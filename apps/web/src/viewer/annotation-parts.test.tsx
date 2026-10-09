// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MarkupAnnotation, NoteAnnotation, ViewTransform } from '@phinpdf/core';
import { SaveError } from '@phinpdf/editor';
import { UnsavedChangesDialog } from '@phinpdf/ui';
import { saveErrorMessage } from '../error-message.ts';
import { AnnotationCard } from './AnnotationCard.tsx';
import { ColorPicker } from './ColorPicker.tsx';
import { CommentsPanel } from './CommentsPanel.tsx';
import { drawAnnotations } from './print.ts';
import { SelectionMenu } from './SelectionMenu.tsx';

const yellow = { r: 255, g: 235, b: 59 };
const note: NoteAnnotation = {
  id: 'n1',
  kind: 'note',
  pageIndex: 2,
  color: yellow,
  contents: 'First thought',
  author: 'Robin',
  modified: '2026-10-09T12:00:00.000Z',
  rect: { x0: 0, y0: 0, x1: 20, y1: 20 },
};
const highlight: MarkupAnnotation = {
  id: 'h1',
  kind: 'highlight',
  pageIndex: 0,
  color: { r: 118, g: 255, b: 122 },
  contents: '',
  author: '',
  modified: null,
  rects: [{ x0: 10, y0: 700, x1: 110, y1: 712 }],
};

function card(over: Partial<Parameters<typeof AnnotationCard>[0]> = {}) {
  const props = {
    annotation: note,
    focusComment: false,
    onColor: vi.fn(),
    onContents: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  return { props, ...render(<AnnotationCard {...props} />) };
}

describe('AnnotationCard', () => {
  it('shows the kind, page, author, date, and comment', () => {
    card();
    expect(screen.getByRole('heading', { name: /Sticky note.*Page 3/ })).toBeInTheDocument();
    expect(screen.getByText(/Robin ·/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Comment' })).toHaveValue('First thought');
    expect(screen.getByRole('radio', { name: 'Yellow' })).toHaveAttribute('aria-checked', 'true');
  });

  it('saves the comment once on blur, not on every keystroke', async () => {
    const { props } = card({ focusComment: true });
    const box = screen.getByRole('textbox', { name: 'Comment' });
    expect(box).toHaveFocus();
    await userEvent.type(box, ' more');
    expect(props.onContents).not.toHaveBeenCalled();
    fireEvent.blur(box);
    expect(props.onContents).toHaveBeenCalledExactlyOnceWith('First thought more');
  });

  it('saves on Ctrl+Enter and saves then closes on Escape', async () => {
    const { props } = card();
    const box = screen.getByRole('textbox', { name: 'Comment' });
    await userEvent.type(box, '!');
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    expect(props.onContents).toHaveBeenLastCalledWith('First thought!');
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalled();
  });

  it('saves a pending comment when it closes or unmounts', async () => {
    const { props, unmount } = card();
    const box = screen.getByRole('textbox', { name: 'Comment' });
    await userEvent.type(box, '?');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(props.onContents).toHaveBeenCalledWith('First thought?');
    expect(props.onClose).toHaveBeenCalled();
    unmount();
  });

  it('commits on unmount when nothing else did', () => {
    const { props, unmount } = card();
    fireEvent.change(screen.getByRole('textbox', { name: 'Comment' }), {
      target: { value: 'changed' },
    });
    unmount();
    expect(props.onContents).toHaveBeenCalledWith('changed');
  });

  it('follows the comment when undo changes it', () => {
    const { props, rerender } = card();
    rerender(<AnnotationCard {...props} annotation={{ ...note, contents: 'Undone' }} />);
    expect(screen.getByRole('textbox', { name: 'Comment' })).toHaveValue('Undone');
  });

  it('changes colour and deletes', async () => {
    const { props } = card({ annotation: highlight });
    expect(screen.queryByText(/·/)).toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: 'Blue' }));
    expect(props.onColor).toHaveBeenCalledWith({ r: 100, g: 181, b: 246 });
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(props.onDelete).toHaveBeenCalled();
  });

  it('moves between colours with the arrow keys', () => {
    const { props } = card();
    const yellowRadio = screen.getByRole('radio', { name: 'Yellow' });
    expect(yellowRadio).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(yellowRadio, { key: 'ArrowLeft' });
    expect(props.onColor).toHaveBeenLastCalledWith({ r: 229, g: 57, b: 53 });
    fireEvent.keyDown(yellowRadio, { key: 'ArrowRight' });
    expect(props.onColor).toHaveBeenLastCalledWith({ r: 118, g: 255, b: 122 });
    fireEvent.keyDown(yellowRadio, { key: 'x' });
    expect(props.onColor).toHaveBeenCalledTimes(2);
  });

  it('shows a modified date only when it is valid', () => {
    card({ annotation: { ...note, author: '', modified: 'garbage' } });
    expect(document.querySelector('.card-meta')).toBeNull();
  });
});

describe('ColorPicker', () => {
  it('opens the swatches and closes on Escape or an outside click', async () => {
    const onChange = vi.fn();
    render(<ColorPicker value={yellow} onChange={onChange} label="Highlight colour" />);
    const button = screen.getByRole('button', { name: 'Highlight colour: Yellow' });
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(screen.getByRole('radio', { name: 'Pink' }));
    expect(onChange).toHaveBeenCalledWith({ r: 255, g: 128, b: 171 });
    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('radiogroup')).toBeNull();
    await userEvent.click(button);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('names a colour outside the palette as custom', () => {
    render(<ColorPicker value={{ r: 1, g: 2, b: 3 }} onChange={vi.fn()} label="Note colour" />);
    expect(screen.getByRole('button', { name: 'Note colour: Custom' })).toBeInTheDocument();
  });
});

describe('CommentsPanel', () => {
  it('lists annotations in page order and selects on click', async () => {
    const onSelect = vi.fn();
    render(
      <CommentsPanel annotations={[note, highlight]} selectedId="n1" loaded onSelect={onSelect} />,
    );
    const items = screen.getAllByRole('button');
    expect(items.map((b) => b.textContent)).toEqual([
      'Highlight · Page 1No comment',
      'Note · Page 3First thought',
    ]);
    expect(items[1]).toHaveAttribute('aria-current', 'true');
    await userEvent.click(items[0] as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith(highlight);
  });

  it('says when there are no comments, or that they are still loading', () => {
    const { rerender } = render(
      <CommentsPanel annotations={[]} selectedId={null} loaded={false} onSelect={vi.fn()} />,
    );
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    rerender(<CommentsPanel annotations={[]} selectedId={null} loaded onSelect={vi.fn()} />);
    expect(screen.getByText('No comments yet.')).toBeInTheDocument();
  });
});

describe('SelectionMenu', () => {
  it('offers highlight and underline without losing the selection', async () => {
    const onHighlight = vi.fn();
    const onUnderline = vi.fn();
    render(
      <SelectionMenu at={{ x: 10, y: 20 }} onHighlight={onHighlight} onUnderline={onUnderline} />,
    );
    const menu = screen.getByRole('toolbar', { name: 'Selected text' });
    expect(menu).toHaveStyle({ left: '10px', top: '20px' });
    const down = new Event('pointerdown', { bubbles: true, cancelable: true });
    menu.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Highlight' }));
    await userEvent.click(screen.getByRole('button', { name: 'Underline' }));
    expect(onHighlight).toHaveBeenCalled();
    expect(onUnderline).toHaveBeenCalled();
  });
});

describe('UnsavedChangesDialog', () => {
  it('offers save, discard, and cancel', async () => {
    const props = { onSave: vi.fn(), onDiscard: vi.fn(), onCancel: vi.fn() };
    const { rerender } = render(
      <UnsavedChangesDialog fileName="a.pdf" saving={false} {...props} />,
    );
    expect(screen.getByRole('dialog', { name: 'Save changes?' })).toHaveTextContent('a.pdf');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await userEvent.click(screen.getByRole('button', { name: "Don't save" }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onSave).toHaveBeenCalled();
    expect(props.onDiscard).toHaveBeenCalled();
    expect(props.onCancel).toHaveBeenCalled();
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(props.onCancel).toHaveBeenCalledTimes(2);
    rerender(<UnsavedChangesDialog fileName="a.pdf" saving {...props} />);
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });
});

describe('saveErrorMessage', () => {
  it.each<[unknown, RegExp]>([
    [new SaveError('password', 'x'), /password/],
    [new SaveError('open', 'x'), /damaged/],
    [new SaveError('page', 'x'), /damaged/],
    [new SaveError('write', 'x'), /could not be written/],
    ['cannot save file: denied', /read-only/],
    ['unknown file', /no longer available/],
    [new DOMException('no', 'NotAllowedError'), /did not allow/],
    ['other', /could not be saved/],
    [new Error('x'), /could not be saved/],
  ])('explains %s', (error, message) => {
    expect(saveErrorMessage(error)).toMatch(message);
  });
});

describe('drawAnnotations', () => {
  it('fills highlights with multiply and underlines as thin lines, skipping notes', () => {
    const calls: string[] = [];
    const context = {
      save: () => calls.push('save'),
      restore: () => calls.push('restore'),
      fillRect: (x: number, y: number, w: number, h: number) =>
        calls.push(`rect ${[x, y, w, h].map((n) => String(Math.round(n * 100) / 100)).join(',')}`),
      set globalCompositeOperation(v: string) {
        calls.push(`op ${v}`);
      },
      set fillStyle(v: string) {
        calls.push(`fill ${v}`);
      },
    } as unknown as CanvasRenderingContext2D;
    const transform: ViewTransform = {
      geometry: { view: [0, 0, 612, 792], rotate: 0 },
      scale: 1,
      rotation: 0,
    };
    drawAnnotations(context, [highlight, { ...highlight, kind: 'underline' }, note], transform);
    expect(calls).toEqual([
      'save',
      'op multiply',
      'fill rgb(118 255 122)',
      'rect 10,80,100,12',
      'op source-over',
      'fill rgb(118 255 122)',
      'rect 10,91.04,100,0.96',
      'restore',
    ]);
  });
});
