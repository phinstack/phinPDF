// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  Annotation,
  MarkupAnnotation,
  NoteAnnotation,
  PageGeometry,
  ViewTransform,
} from '@phinpdf/core';
import { hitTestMarkup, noteRectAt } from './annotation-hit.ts';
import type { AnnotationHandlers } from './AnnotationLayer.tsx';
import { PageView } from './PageView.tsx';
import { selectionToPageRects } from './selection.ts';
import { fakeSource } from './test/fake-document.ts';

const LETTER: PageGeometry = { view: [0, 0, 612, 792], rotate: 0 };
const T: ViewTransform = { geometry: LETTER, scale: 1, rotation: 0 };

const highlight: MarkupAnnotation = {
  id: 'h1',
  kind: 'highlight',
  pageIndex: 0,
  color: { r: 255, g: 235, b: 59 },
  contents: '',
  author: '',
  modified: null,
  rects: [{ x0: 100, y0: 680, x1: 200, y1: 692 }],
};
const underline: MarkupAnnotation = { ...highlight, id: 'u1', kind: 'underline' };
const note: NoteAnnotation = {
  id: 'n1',
  kind: 'note',
  pageIndex: 0,
  color: { r: 100, g: 181, b: 246 },
  contents: 'A rather long comment that should be shortened in the label because it goes on and on',
  author: '',
  modified: null,
  rect: { x0: 50, y0: 722, x1: 70, y1: 742 },
};

function handlers(over: Partial<AnnotationHandlers> = {}): AnnotationHandlers {
  return {
    tool: 'select',
    selectedId: null,
    onSelect: vi.fn(),
    onMoveNote: vi.fn(),
    onPlaceNote: vi.fn(),
    ...over,
  };
}

function renderPage(annotations: Annotation[], h: AnnotationHandlers) {
  const utils = render(
    <PageView
      document={fakeSource()}
      pageNumber={1}
      scale={1}
      rotation={0}
      width={612}
      height={792}
      top={0}
      left={0}
      label="Page 1"
      geometry={LETTER}
      annotations={annotations}
      annotationHandlers={h}
    />,
  );
  const page = screen.getByRole('img', { name: 'Page 1' });
  page.getBoundingClientRect = () => new DOMRect(0, 0, 612, 792);
  return { ...utils, page };
}

describe('hit testing helpers', () => {
  it('finds the topmost markup under a point', () => {
    const top = { ...highlight, id: 'top' };
    expect(hitTestMarkup([highlight, top, note], T, { x: 150, y: 106 })?.id).toBe('top');
    expect(hitTestMarkup([highlight], T, { x: 10, y: 10 })).toBeNull();
    expect(hitTestMarkup([note], T, { x: 55, y: 55 })).toBeNull();
  });

  it('places a note with its top-left corner at the point', () => {
    expect(noteRectAt({ x: 10, y: 20 }, T)).toEqual({ x0: 10, y0: 752, x1: 30, y1: 772 });
  });
});

describe('annotation layer', () => {
  it('draws highlights and underlines at their place on the page', () => {
    const { container } = renderPage([highlight, underline], handlers());
    const hl = container.querySelector('.phinpdf-highlight rect');
    expect(hl).toHaveAttribute('x', '100');
    expect(hl).toHaveAttribute('y', '100');
    expect(hl).toHaveAttribute('width', '100');
    expect(hl).toHaveAttribute('height', '12');
    const ul = container.querySelector('.phinpdf-underline rect');
    // A thin line at the bottom of the text.
    expect(Number(ul?.getAttribute('y'))).toBeGreaterThan(110);
    expect(Number(ul?.getAttribute('height'))).toBeLessThan(2);
  });

  it('selects a highlight on click and clears the selection elsewhere', () => {
    const h = handlers();
    const { page } = renderPage([highlight], h);
    fireEvent.click(page, { clientX: 150, clientY: 105 });
    expect(h.onSelect).toHaveBeenLastCalledWith('h1');
    fireEvent.click(page, { clientX: 400, clientY: 500 });
    expect(h.onSelect).toHaveBeenLastCalledWith(null);
  });

  it('outlines the selected highlight', () => {
    const { container } = renderPage([highlight], handlers({ selectedId: 'h1' }));
    expect(container.querySelector('.phinpdf-selection rect')).toHaveAttribute('x', '98');
  });

  it('does not change the selection when a click ends a text selection', () => {
    const h = handlers();
    const { page } = renderPage([highlight], h);
    const getSelection = vi
      .spyOn(window, 'getSelection')
      .mockReturnValue({ isCollapsed: false } as Selection);
    fireEvent.click(page, { clientX: 150, clientY: 105 });
    expect(h.onSelect).not.toHaveBeenCalled();
    getSelection.mockRestore();
  });

  it('places a note centred on the click with the note tool', () => {
    const h = handlers({ tool: 'note' });
    const { page } = renderPage([], h);
    expect(page).toHaveAttribute('data-tool', 'note');
    fireEvent.click(page, { clientX: 112, clientY: 112 });
    expect(h.onPlaceNote).toHaveBeenCalledWith(0, { x0: 100, y0: 672, x1: 120, y1: 692 });
  });

  it('shows notes as labelled buttons that select on click or keyboard', () => {
    const h = handlers();
    renderPage([note], h);
    const button = screen.getByRole('button', { name: /^Note: A rather long comment/ });
    expect(button.getAttribute('aria-label')?.endsWith('…')).toBe(true);
    expect(button).toHaveStyle({ left: '50px', top: '50px' });
    fireEvent.click(button, { detail: 0 });
    expect(h.onSelect).toHaveBeenCalledWith('n1');
    expect(screen.getByRole('button', { name: /^Note/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('labels an empty note simply as Note', () => {
    renderPage([{ ...note, contents: ' ' }], handlers({ selectedId: 'n1' }));
    expect(screen.getByRole('button', { name: 'Note' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('drags a note to a new place', () => {
    const h = handlers();
    renderPage([note], h);
    const button = screen.getByRole('button', { name: /^Note/ });
    button.setPointerCapture = vi.fn();
    fireEvent.pointerDown(button, { button: 0, clientX: 60, clientY: 60, pointerId: 1 });
    fireEvent.pointerMove(button, { clientX: 61, clientY: 60 });
    expect(button).toHaveStyle({ left: '50px' });
    fireEvent.pointerMove(button, { clientX: 100, clientY: 80 });
    expect(button).toHaveStyle({ left: '90px', top: '70px' });
    fireEvent.pointerUp(button, { clientX: 100, clientY: 80 });
    expect(h.onMoveNote).toHaveBeenCalledWith(note, { x0: 90, y0: 702, x1: 110, y1: 722 });
    expect(h.onSelect).toHaveBeenCalledWith('n1');
  });

  it('treats a press without movement as a click, and cancels cleanly', () => {
    const h = handlers();
    renderPage([note], h);
    const button = screen.getByRole('button', { name: /^Note/ });
    button.setPointerCapture = vi.fn();
    fireEvent.pointerDown(button, { button: 2, clientX: 60, clientY: 60 });
    fireEvent.pointerMove(button, { clientX: 90, clientY: 90 });
    fireEvent.pointerUp(button, { clientX: 90, clientY: 90 });
    expect(h.onSelect).not.toHaveBeenCalled();
    fireEvent.pointerDown(button, { button: 0, clientX: 60, clientY: 60 });
    fireEvent.pointerUp(button, { clientX: 60, clientY: 60 });
    expect(h.onMoveNote).not.toHaveBeenCalled();
    expect(h.onSelect).toHaveBeenCalledWith('n1');
    fireEvent.pointerDown(button, { button: 0, clientX: 60, clientY: 60 });
    fireEvent.pointerMove(button, { clientX: 90, clientY: 90 });
    fireEvent.pointerCancel(button);
    expect(button).toHaveStyle({ left: '50px' });
  });

  it('nudges a note with the arrow keys', () => {
    const h = handlers();
    renderPage([note], h);
    const button = screen.getByRole('button', { name: /^Note/ });
    fireEvent.keyDown(button, { key: 'ArrowRight' });
    expect(h.onMoveNote).toHaveBeenLastCalledWith(note, { x0: 51, y0: 722, x1: 71, y1: 742 });
    fireEvent.keyDown(button, { key: 'ArrowDown', shiftKey: true });
    expect(h.onMoveNote).toHaveBeenLastCalledWith(note, { x0: 50, y0: 712, x1: 70, y1: 732 });
    fireEvent.keyDown(button, { key: 'ArrowLeft' });
    fireEvent.keyDown(button, { key: 'ArrowUp' });
    fireEvent.keyDown(button, { key: 'a' });
    expect(h.onMoveNote).toHaveBeenCalledTimes(4);
  });

  it('shows no annotations until the page geometry is known', async () => {
    const { container } = render(
      <PageView
        document={fakeSource()}
        pageNumber={1}
        scale={1}
        rotation={0}
        width={612}
        height={792}
        top={0}
        left={0}
        label="Page 1"
        annotations={[highlight]}
        annotationHandlers={handlers()}
      />,
    );
    await waitFor(() => {
      expect(container.querySelector('[data-text-ready="true"]')).not.toBeNull();
    });
    expect(container.querySelector('.phinpdf-annots')).toBeNull();
    fireEvent.click(screen.getByRole('img'));
  });
});

describe('selectionToPageRects', () => {
  const textOf = (el: HTMLElement | undefined): Node => {
    const node = el?.firstChild;
    if (!node) throw new Error('no text');
    return node;
  };

  function pageWithText(texts: string[], pageNumber = 1) {
    const page = document.createElement('div');
    page.className = 'phinpdf-page';
    page.dataset['page'] = String(pageNumber);
    page.getBoundingClientRect = () => new DOMRect(10, 20, 612, 792);
    const layer = document.createElement('div');
    layer.className = 'textLayer';
    const spans = texts.map((t) => {
      const span = document.createElement('span');
      span.textContent = t;
      layer.append(span);
      return span;
    });
    page.append(layer);
    document.body.append(page);
    return { page, spans };
  }

  const rects = (list: DOMRect[]) =>
    Object.assign(list, { item: (i: number) => list[i] ?? null }) as unknown as DOMRectList;

  /** jsdom has no layout, so Range#getClientRects doesn't exist; supply one per test. */
  function stubClientRects(impl: (range: Range) => DOMRectList) {
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: function (this: Range) {
        return impl(this);
      },
    });
    return () => {
      Reflect.deleteProperty(Range.prototype, 'getClientRects');
    };
  }

  it('returns nothing without a selection', () => {
    expect(selectionToPageRects(null, () => T).size).toBe(0);
    expect(selectionToPageRects({ isCollapsed: true } as Selection, () => T).size).toBe(0);
  });

  it('turns selected text into one PDF rect per line', () => {
    const { page, spans } = pageWithText(['Hello', 'world', ' ']);
    const range = document.createRange();
    range.setStart(textOf(spans[0]), 1);
    range.setEnd(textOf(spans[2]), 1);
    const restore = stubClientRects((r) =>
      r.startContainer.textContent === 'Hello'
        ? rects([new DOMRect(110, 120, 40, 12)])
        : rects([new DOMRect(151, 120, 50, 12)]),
    );
    const selection = {
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => range,
    } as unknown as Selection;
    const result = selectionToPageRects(selection, (i) => (i === 0 ? T : null));
    expect([...result.keys()]).toEqual([0]);
    expect(result.get(0)).toEqual([{ x0: 100, y0: 680, x1: 191, y1: 692 }]);
    restore();
    page.remove();
  });

  it('skips pages without a known transform and text outside text layers', () => {
    const { page, spans } = pageWithText(['Only']);
    const outside = document.createElement('p');
    outside.textContent = 'outside';
    document.body.append(outside);
    const range = document.createRange();
    range.setStartBefore(page);
    range.setEndAfter(outside);
    const restore = stubClientRects(() => rects([new DOMRect(0, 0, 5, 5)]));
    const selection = {
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => range,
    } as unknown as Selection;
    expect(selectionToPageRects(selection, () => null).size).toBe(0);
    expect(spans).toHaveLength(1);
    restore();
    page.remove();
    outside.remove();
  });
});
