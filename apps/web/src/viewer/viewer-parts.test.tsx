// @vitest-environment jsdom
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeDoc } from '../test/fake-doc.ts';
import { cleanupPrint, printDocument } from './print.ts';
import { Toolbar, type ToolbarProps } from './Toolbar.tsx';
import { useSearch } from './use-search.ts';

describe('Toolbar', () => {
  const props = (over: Partial<ToolbarProps> = {}): ToolbarProps => ({
    fileName: 'report.pdf',
    pageIndex: 4,
    pageCount: 12,
    zoom: 1.25,
    zoomMode: { kind: 'auto' },
    sidebarOpen: true,
    searchOpen: false,
    pageInputRef: createRef(),
    onOpen: vi.fn(),
    onPrint: vi.fn(),
    onGoToPage: vi.fn(),
    onZoomMode: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onRotate: vi.fn(),
    onToggleSidebar: vi.fn(),
    onToggleSearch: vi.fn(),
    tool: 'select',
    toolColor: { r: 255, g: 235, b: 59 },
    dirty: false,
    saving: false,
    canUndo: false,
    canRedo: false,
    onTool: vi.fn(),
    onToolColor: vi.fn(),
    onSave: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    ...over,
  });

  it('shows the page and jumps to a typed page number, clamped to the document', async () => {
    const p = props();
    render(<Toolbar {...p} />);
    const input = screen.getByLabelText('Page number');
    expect(input).toHaveValue('5');
    await userEvent.clear(input);
    await userEvent.type(input, '9{Enter}');
    expect(p.onGoToPage).toHaveBeenLastCalledWith(8);
    await userEvent.clear(input);
    await userEvent.type(input, '999{Enter}');
    expect(p.onGoToPage).toHaveBeenLastCalledWith(11);
  });

  it('does not change under the user while they are typing a page number', async () => {
    const p = props();
    const { rerender } = render(<Toolbar {...p} />);
    const input = screen.getByLabelText('Page number');
    await userEvent.click(input);
    // The view finishes scrolling and the current page changes while the box has focus.
    rerender(<Toolbar {...p} pageIndex={30} />);
    expect(input).toHaveValue('5');
    await userEvent.keyboard('32{Enter}');
    expect(p.onGoToPage).toHaveBeenLastCalledWith(11);
    // Still focused after Enter, with the new page selected: typing replaces it, even if
    // the current page changes again in between.
    expect(input).toHaveFocus();
    expect(input).toHaveValue('12');
    rerender(<Toolbar {...p} pageIndex={2} />);
    await userEvent.keyboard('7{Enter}');
    expect(p.onGoToPage).toHaveBeenLastCalledWith(6);
  });

  it('follows the current page again after losing focus', async () => {
    const p = props();
    const { rerender } = render(<Toolbar {...p} />);
    const input = screen.getByLabelText('Page number');
    await userEvent.click(input);
    await userEvent.tab();
    rerender(<Toolbar {...p} pageIndex={8} />);
    expect(input).toHaveValue('9');
    expect(p.onGoToPage).not.toHaveBeenCalled();
  });

  it('restores the page number when editing is cancelled with Escape', async () => {
    render(<Toolbar {...props()} />);
    const input = screen.getByLabelText('Page number');
    await userEvent.clear(input);
    await userEvent.type(input, '3{Escape}');
    expect(input).toHaveValue('5');
  });

  it('steps pages and disables the ends', async () => {
    const p = props({ pageIndex: 0 });
    render(<Toolbar {...p} />);
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(p.onGoToPage).toHaveBeenCalledWith(1);
  });

  it('offers zoom modes and presets', async () => {
    const p = props();
    render(<Toolbar {...p} />);
    const select = screen.getByRole('combobox', { name: 'Zoom level, 125%' });
    await userEvent.selectOptions(select, 'Fit width');
    expect(p.onZoomMode).toHaveBeenLastCalledWith({ kind: 'fit-width' });
    await userEvent.selectOptions(select, '200%');
    expect(p.onZoomMode).toHaveBeenLastCalledWith({ kind: 'scale', scale: 2 });
    await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    await userEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(p.onZoomIn).toHaveBeenCalled();
    expect(p.onZoomOut).toHaveBeenCalled();
  });

  it('shows a custom zoom value that is not a preset', () => {
    render(<Toolbar {...props({ zoom: 1.1, zoomMode: { kind: 'scale', scale: 1.1 } })} />);
    expect(screen.getByRole('option', { name: '110%' })).toBeInTheDocument();
  });

  it('wires the remaining buttons', async () => {
    const p = props();
    render(<Toolbar {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.click(screen.getByRole('button', { name: 'Print' }));
    await userEvent.click(screen.getByRole('button', { name: 'Rotate clockwise' }));
    await userEvent.click(screen.getByRole('button', { name: 'Hide sidebar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    for (const fn of [p.onOpen, p.onPrint, p.onRotate, p.onToggleSidebar, p.onToggleSearch]) {
      expect(fn).toHaveBeenCalledTimes(1);
    }
  });
});

describe('useSearch', () => {
  const pages = ['alpha beta', 'beta gamma beta', 'delta', 'Beta'];

  it('finds matches across pages and selects the first one from the current page', async () => {
    const doc = fakeDoc(pages);
    const { result } = renderHook(() => useSearch(doc, 2, true));
    act(() => {
      result.current.setQuery('beta');
    });
    await waitFor(() => {
      expect(result.current.scanned).toBe(4);
    });
    expect(result.current.matches.map((m) => m.page)).toEqual([0, 1, 1, 3]);
    expect(result.current.current?.page).toBe(3);
    act(() => {
      result.current.next();
    });
    expect(result.current.currentIndex).toBe(0);
    act(() => {
      result.current.previous();
    });
    expect(result.current.currentIndex).toBe(3);
  });

  it('respects case sensitivity and builds highlights per page', async () => {
    const doc = fakeDoc(pages);
    const { result } = renderHook(() => useSearch(doc, 0, true));
    act(() => {
      result.current.setOptions({ caseSensitive: true, wholeWord: false });
      result.current.setQuery('Beta');
    });
    await waitFor(() => {
      expect(result.current.matches).toHaveLength(1);
    });
    expect(result.current.highlights.get(3)).toEqual({
      itemCount: 1,
      matches: [{ ranges: [{ item: 0, start: 0, end: 4 }], current: true }],
    });
  });

  it('extracts each page’s text only once across queries', async () => {
    const doc = fakeDoc(pages);
    const { result } = renderHook(() => useSearch(doc, 0, true));
    act(() => {
      result.current.setQuery('beta');
    });
    await waitFor(() => {
      expect(result.current.scanned).toBe(4);
    });
    act(() => {
      result.current.setQuery('gamma');
    });
    await waitFor(() => {
      expect(result.current.matches).toHaveLength(1);
    });
    expect(doc.getTextItems).toHaveBeenCalledTimes(4);
  });

  it('does nothing while inactive or with an empty query', async () => {
    const doc = fakeDoc(pages);
    const { result } = renderHook(() => useSearch(doc, 0, false));
    act(() => {
      result.current.setQuery('beta');
    });
    await new Promise((r) => setTimeout(r, 300));
    expect(result.current.matches).toEqual([]);
    expect(doc.getTextItems).not.toHaveBeenCalled();
  });
});

describe('printDocument', () => {
  afterEach(() => {
    cleanupPrint();
    vi.restoreAllMocks();
  });

  it('renders every page to an image, prints, then cleans up', async () => {
    const doc = fakeDoc(['a', 'b', 'c']);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(cb) {
      cb(new Blob(['png']));
    });
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:fake');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    // jsdom has no HTMLImageElement.decode().
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      value: () => Promise.resolve(),
      configurable: true,
    });
    const progress: number[] = [];
    let imagesWhenPrinting = 0;
    await printDocument(
      doc,
      () => {
        imagesWhenPrinting = document.querySelectorAll('#phinpdf-print img').length;
        return Promise.resolve();
      },
      (n) => progress.push(n),
      new AbortController().signal,
    );
    expect(imagesWhenPrinting).toBe(3);
    expect(progress).toEqual([1, 2, 3]);
    expect(doc.renderPage).toHaveBeenCalledWith(
      1,
      expect.any(HTMLCanvasElement),
      expect.objectContaining({ scale: 150 / 72, pixelRatio: 1 }),
    );
    expect(createUrl).toHaveBeenCalledTimes(3);
    window.dispatchEvent(new Event('afterprint'));
    expect(document.getElementById('phinpdf-print')).toBeNull();
    expect(revoke).toHaveBeenCalledTimes(3);
  });

  it('stops and leaves nothing behind when cancelled', async () => {
    const doc = fakeDoc(['a', 'b']);
    const controller = new AbortController();
    controller.abort();
    const print = vi.fn(() => Promise.resolve());
    await expect(printDocument(doc, print, vi.fn(), controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(print).not.toHaveBeenCalled();
    expect(document.getElementById('phinpdf-print')).toBeNull();
  });
});
