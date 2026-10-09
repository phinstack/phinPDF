// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PdfRect } from '@phinpdf/core';
import { SaveError } from '@phinpdf/editor';
import type { SavedFile } from '@phinpdf/platform';
import type { LoadedAnnotation } from '@phinpdf/renderer';
import { fakeDoc } from '../test/fake-doc.ts';
import { fakeEditor, fakePlatform } from '../test/fakes.ts';
import { Viewer, type SaveDocument, type ViewerProps } from './Viewer.tsx';

// Text selection needs layout, which jsdom lacks; tests choose what is "selected".
const selected = vi.hoisted(() => ({ rects: new Map<number, PdfRect[]>() }));
vi.mock('@phinpdf/ui', async (original) => ({
  ...(await original<typeof import('@phinpdf/ui')>()),
  selectionToPageRects: () => selected.rects,
}));

const fileNote: LoadedAnnotation = {
  sourceId: '5R',
  key: { subtype: 'Text', rect: { x0: 20, y0: 750, x1: 40, y1: 770 }, name: null },
  annotation: {
    id: 'file-0-5R',
    kind: 'note',
    pageIndex: 0,
    color: { r: 255, g: 204, b: 0 },
    contents: 'From Acrobat',
    author: 'Kim',
    modified: null,
    rect: { x0: 20, y0: 750, x1: 40, y1: 770 },
  },
};

afterEach(() => {
  selected.rects = new Map();
  vi.restoreAllMocks();
});

async function setup(
  over: Partial<ViewerProps> = {},
  annotations: LoadedAnnotation[] = [fileNote],
) {
  const doc = fakeDoc(['alpha', 'beta'], annotations);
  const platform = fakePlatform();
  const editor = fakeEditor();
  const onSaved = vi.fn();
  const onDirtyChange = vi.fn();
  const saveRef = { current: null as SaveDocument | null };
  const props: ViewerProps = {
    doc,
    file: { id: 'f1', name: 'notes.pdf', bytes: new Uint8Array([37, 80, 68, 70]) },
    platform,
    editor,
    onOpen: vi.fn(),
    onSaved,
    onDirtyChange,
    saveRef,
    ...over,
  };
  const utils = render(<Viewer {...props} />);
  await screen.findByRole('region', { name: 'notes.pdf, 2 pages' });
  return { doc, platform, editor, onSaved, onDirtyChange, saveRef, props, ...utils };
}

const showComments = async () => {
  await userEvent.click(screen.getByRole('tab', { name: /Comments/ }));
  return screen.findByRole('list', { name: 'Comments' });
};
const save = () => screen.getByRole('button', { name: 'Save' });

describe('Viewer annotations', () => {
  it('lists annotations from the file without counting them as changes', async () => {
    const { onDirtyChange } = await setup();
    const list = await showComments();
    expect(within(list).getByRole('button')).toHaveTextContent('From Acrobat');
    expect(screen.getByRole('tab', { name: /Comments\s*\(1\)/ })).toBeInTheDocument();
    expect(save()).toBeDisabled();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(await screen.findByRole('button', { name: 'Note: From Acrobat' })).toBeInTheDocument();
  });

  it('edits a comment from the list and saves it into the file', async () => {
    const { editor, platform, onSaved } = await setup();
    const list = await showComments();
    await userEvent.click(within(list).getByRole('button'));
    const box = screen.getByRole('textbox', { name: 'Comment' });
    await userEvent.clear(box);
    await userEvent.type(box, 'Edited');
    fireEvent.blur(box);
    expect(document.title).toBe('• notes.pdf – phinPDF');
    expect(save()).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Undo Edit Comment' })).toBeEnabled();

    await userEvent.click(save());
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    const request = editor.save.mock.calls[0]?.[0];
    expect(request?.changes).toEqual([
      expect.objectContaining({ op: 'update', key: fileNote.key }),
    ]);
    expect(platform.saveFile).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'f1' }),
      expect.any(Uint8Array),
    );
    expect(onSaved.mock.calls[0]?.[0]).toMatchObject({ id: 'f1', name: 'notes.pdf' });
    expect(save()).toBeDisabled();
    expect(screen.getByTestId('edit-status')).toHaveTextContent('Saved notes.pdf');
  });

  it('highlights and underlines the selected text from the toolbar', async () => {
    await setup({}, []);
    selected.rects = new Map([[1, [{ x0: 10, y0: 10, x1: 100, y1: 22 }]]]);
    await userEvent.click(screen.getByRole('button', { name: 'Highlight' }));
    // Applied to the selection; the tool itself stays off.
    expect(screen.getByRole('button', { name: 'Highlight' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Underline' }));
    await showComments();
    expect(screen.getAllByText(/Page 2/)).toHaveLength(2);
    expect(screen.getByTestId('edit-status')).toHaveTextContent('Underline added');

    // Without a selection, the button switches the tool on and off.
    selected.rects = new Map();
    const tool = screen.getByRole('button', { name: 'Highlight' });
    await userEvent.click(tool);
    expect(tool).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: /Highlight colour/ }));
    await userEvent.click(screen.getByRole('radio', { name: 'Blue' }));
    expect(screen.getByRole('button', { name: 'Highlight colour: Blue' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(tool).toHaveAttribute('aria-pressed', 'false');
  });

  it('applies the active markup tool when a mouse selection ends', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await setup({}, []);
    const tool = screen.getByRole('button', { name: 'Underline' });
    fireEvent.click(tool);
    selected.rects = new Map([[0, [{ x0: 10, y0: 10, x1: 100, y1: 22 }]]]);
    vi.spyOn(window, 'getSelection').mockReturnValue(
      selectionIn(document.querySelector('.phinpdf-page')),
    );
    fireEvent.pointerUp(document.querySelector('.phinpdf-page') as Element);
    await act(() => vi.runAllTimersAsync());
    expect(screen.getByRole('tab', { name: /Comments\s*\(1\)/ })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('offers quick actions next to a mouse selection', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await setup({}, []);
    const page = document.querySelector('.phinpdf-page');
    vi.spyOn(window, 'getSelection').mockReturnValue(selectionIn(page));
    fireEvent.pointerUp(page as Element);
    await act(() => vi.runAllTimersAsync());
    const menu = screen.getByRole('toolbar', { name: 'Selected text' });
    selected.rects = new Map([[0, [{ x0: 10, y0: 10, x1: 100, y1: 22 }]]]);
    fireEvent.click(within(menu).getByRole('button', { name: 'Highlight' }));
    expect(screen.queryByRole('toolbar', { name: 'Selected text' })).toBeNull();
    // A click elsewhere with nothing selected hides the menu.
    vi.spyOn(window, 'getSelection').mockReturnValue(null);
    fireEvent.pointerUp(page as Element);
    fireEvent(document, new Event('selectionchange'));
    await act(() => vi.runAllTimersAsync());
    vi.useRealTimers();
  });

  it('places a note with the note tool, then undoes and redoes it', async () => {
    await setup({}, []);
    await userEvent.click(screen.getByRole('button', { name: 'Sticky note' }));
    const page = document.querySelector<HTMLElement>('.phinpdf-page[data-page="1"]');
    if (!page) throw new Error('no page');
    page.getBoundingClientRect = () => new DOMRect(0, 0, 816, 1056);
    await waitFor(() => {
      expect(page).toHaveAttribute('data-tool', 'note');
    });
    fireEvent.click(page, { clientX: 100, clientY: 100 });
    const box = await screen.findByRole('textbox', { name: 'Comment' });
    expect(box).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Sticky note' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Note' })).toBeInTheDocument();
    box.blur();

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(screen.queryByRole('button', { name: 'Note' })).toBeNull();
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    expect(screen.getByRole('button', { name: 'Note' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    await userEvent.click(screen.getByRole('button', { name: 'Undo Add Note' }));
    await userEvent.click(screen.getByRole('button', { name: 'Redo Add Note' }));
    expect(screen.getByRole('button', { name: 'Note' })).toBeInTheDocument();
  });

  it('moves a note, changes its colour, and deletes it with the Delete key', async () => {
    await setup();
    const note = await screen.findByRole('button', { name: 'Note: From Acrobat' });
    fireEvent.keyDown(note, { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: 'Undo Move Note' })).toBeEnabled();
    fireEvent.click(note, { detail: 0 });
    await userEvent.click(screen.getByRole('radio', { name: 'Pink' }));
    expect(screen.getByRole('button', { name: 'Undo Change Colour' })).toBeEnabled();
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(screen.queryByRole('button', { name: /^Note/ })).toBeNull();
    expect(screen.getByTestId('edit-status')).toHaveTextContent('Deleted');
  });

  it('saves a copy with Ctrl+Shift+S and reports the new name', async () => {
    const { platform, onSaved } = await setup();
    fireEvent.keyDown(window, { key: 'S', ctrlKey: true, shiftKey: true });
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    expect(platform.saveFileAs).toHaveBeenCalledWith('notes.pdf', expect.any(Uint8Array));
    expect(onSaved.mock.calls[0]?.[0]).toMatchObject({ id: 'saved-as', name: 'notes.pdf' });
  });

  it('does nothing when the save dialog is cancelled', async () => {
    const platform = fakePlatform({ saveFileAs: vi.fn(() => Promise.resolve(null)) });
    const { onSaved, saveRef } = await setup({ platform });
    let result = true;
    await act(async () => {
      result = (await saveRef.current?.({ as: true })) ?? true;
    });
    expect(result).toBe(false);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows why a save failed and keeps the changes', async () => {
    const editor = fakeEditor();
    editor.save.mockRejectedValue(new SaveError('password', 'nope'));
    await setup({ editor });
    const note = await screen.findByRole('button', { name: 'Note: From Acrobat' });
    fireEvent.keyDown(note, { key: 'ArrowUp' });
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(await screen.findByRole('alert')).toHaveTextContent(/password is needed/);
    expect(save()).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ignores a second save while one is running', async () => {
    let finish: () => void = () => undefined;
    const platform = fakePlatform({
      saveFile: vi.fn(
        (f: SavedFile) =>
          new Promise<SavedFile | null>((resolve) => {
            finish = () => {
              resolve(f);
            };
          }),
      ),
    });
    const { saveRef } = await setup({ platform });
    let first: Promise<boolean> | undefined;
    let second = true;
    await act(async () => {
      first = saveRef.current?.();
      second = (await saveRef.current?.()) ?? true;
    });
    expect(second).toBe(false);
    await act(async () => {
      finish();
      await first;
    });
    expect(platform.saveFile).toHaveBeenCalledTimes(1);
  });

  it('prints highlights onto the page images', async () => {
    const fillRect = vi.fn();
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({ save: vi.fn(), restore: vi.fn(), fillRect } as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => {
      cb(new Blob(['x']));
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    // jsdom has no HTMLImageElement.decode().
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: () => Promise.resolve(),
    });
    const highlight: LoadedAnnotation = {
      sourceId: '6R',
      key: { subtype: 'Highlight', rect: { x0: 0, y0: 0, x1: 1, y1: 1 }, name: null },
      annotation: {
        id: 'file-0-6R',
        kind: 'highlight',
        pageIndex: 0,
        color: { r: 255, g: 235, b: 59 },
        contents: '',
        author: '',
        modified: null,
        rects: [{ x0: 0, y0: 0, x1: 1, y1: 1 }],
      },
    };
    const { doc, platform } = await setup({}, [highlight]);
    await showComments();
    await screen.findByText('Highlight · Page 1');
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true });
    await waitFor(() => {
      expect(platform.print).toHaveBeenCalled();
    });
    expect(doc.getPageGeometry).toHaveBeenCalledWith(1);
    expect(getContext).toHaveBeenCalledWith('2d');
    expect(fillRect).toHaveBeenCalledTimes(1);
  });
});

/** A fake selection inside `element` (for the pointerup handler). */
function selectionIn(element: Element | null): Selection {
  return {
    isCollapsed: false,
    rangeCount: 1,
    getRangeAt: () => ({
      commonAncestorContainer: element,
      getBoundingClientRect: () => new DOMRect(100, 100, 50, 12),
    }),
    removeAllRanges: vi.fn(),
  } as unknown as Selection;
}
