// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Platform } from '@phinpdf/platform';
import { fakeDoc } from '../test/fake-doc.ts';
import { Viewer } from './Viewer.tsx';

function platform(): Platform {
  return {
    kind: 'web',
    openFile: vi.fn(),
    getLaunchFile: vi.fn(),
    openDroppedFile: vi.fn(),
    saveFile: vi.fn(),
    saveFileAs: vi.fn(),
    print: vi.fn(() => {
      window.dispatchEvent(new Event('afterprint'));
      return Promise.resolve();
    }),
    openExternalLink: vi.fn(),
    recentFiles: vi.fn(() => Promise.resolve([])),
  };
}

async function setup(
  pages = ['alpha fox', 'beta', 'gamma fox'],
  options: { outline?: boolean } = {},
) {
  const doc = fakeDoc(pages);
  if (options.outline) {
    doc.getOutline.mockResolvedValue([
      { title: 'Intro', pageIndex: 0, url: null, children: [] },
      { title: 'Last', pageIndex: pages.length - 1, url: null, children: [] },
    ] as never);
  }
  const p = platform();
  const onOpen = vi.fn();
  const utils = render(<Viewer doc={doc} fileName="notes.pdf" platform={p} onOpen={onOpen} />);
  await screen.findByRole('region', { name: `notes.pdf, ${String(pages.length)} pages` });
  return { doc, platform: p, onOpen, ...utils };
}

const zoomSelect = () => screen.getByRole('combobox', { name: /Zoom level/ });
const firstPage = () => document.querySelector<HTMLElement>('.phinpdf-page[data-page="1"]');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Viewer', () => {
  it('shows the document in the toolbar and window title', async () => {
    await setup();
    expect(screen.getByText('/ 3')).toBeInTheDocument();
    expect(screen.getByText('notes.pdf')).toBeInTheDocument();
    expect(document.title).toBe('notes.pdf – phinPDF');
  });

  it('opens and closes the find bar with Ctrl+F and Escape', async () => {
    await setup();
    await userEvent.keyboard('{Control>}f{/Control}');
    const box = screen.getByRole('searchbox', { name: 'Find in document' });
    expect(box).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('search')).toBeNull();
  });

  it('searches the document and steps through matches with F3', async () => {
    await setup();
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find in document' }), 'fox');
    await waitFor(() => {
      expect(screen.getByText('1 of 2')).toBeInTheDocument();
    });
    await userEvent.keyboard('{F3}');
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
    await userEvent.keyboard('{Shift>}{F3}{/Shift}');
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.queryByRole('search')).toBeNull();
  });

  it('zooms with the keyboard shortcuts', async () => {
    await setup();
    await userEvent.keyboard('{Control>}1{/Control}');
    expect(zoomSelect()).toHaveAccessibleName('Zoom level, 100%');
    await userEvent.keyboard('{Control>}={/Control}');
    expect(zoomSelect()).toHaveAccessibleName('Zoom level, 110%');
    await userEvent.keyboard('{Control>}-{/Control}{Control>}-{/Control}');
    expect(zoomSelect()).toHaveAccessibleName('Zoom level, 90%');
    await userEvent.keyboard('{Control>}2{/Control}');
    expect(zoomSelect()).toHaveValue('fit-width');
    await userEvent.keyboard('{Control>}0{/Control}');
    expect(zoomSelect()).toHaveValue('fit-page');
  });

  it('zooms with the toolbar buttons', async () => {
    await setup();
    await userEvent.selectOptions(zoomSelect(), '100%');
    await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(zoomSelect()).toHaveAccessibleName('Zoom level, 110%');
    await userEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(zoomSelect()).toHaveAccessibleName('Zoom level, 100%');
  });

  it('rotates pages with the button and the keyboard', async () => {
    await setup();
    await userEvent.selectOptions(zoomSelect(), '100%');
    expect(firstPage()?.style.width).toBe('816px');
    await userEvent.click(screen.getByRole('button', { name: 'Rotate clockwise' }));
    expect(firstPage()?.style.width).toBe('1056px');
    await userEvent.keyboard('{Control>}{Shift>}-{/Shift}{/Control}');
    expect(firstPage()?.style.width).toBe('816px');
    await userEvent.keyboard('{Control>}{Shift>}+{/Shift}{/Control}');
    expect(firstPage()?.style.width).toBe('1056px');
  });

  it('focuses the page box with Ctrl+Shift+N', async () => {
    await setup();
    await userEvent.keyboard('{Control>}{Shift>}n{/Shift}{/Control}');
    expect(screen.getByLabelText('Page number')).toHaveFocus();
  });

  it('pages with the arrow keys in fit-page mode', async () => {
    await setup();
    const scroller = screen.getByRole('region');
    await userEvent.selectOptions(zoomSelect(), 'Fit page');
    await userEvent.keyboard('{ArrowRight}');
    const afterRight = scroller.scrollTop;
    expect(afterRight).toBeGreaterThan(0);
    await userEvent.keyboard('{ArrowLeft}');
    // Back to page 1, which sits half a page gap below the top.
    expect(scroller.scrollTop).toBe(8);
  });

  it('shows bookmarks and jumps to their pages', async () => {
    await setup(['a', 'b', 'c'], { outline: true });
    if (!screen.queryByRole('complementary', { name: 'Sidebar' })) {
      await userEvent.click(screen.getByRole('button', { name: 'Show sidebar' }));
    }
    await userEvent.click(screen.getByRole('tab', { name: 'Bookmarks' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Last' }));
    expect(screen.getByRole('region').scrollTop).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    expect(screen.getByLabelText('Page thumbnails')).toBeInTheDocument();
  });

  it('hides and shows the sidebar', async () => {
    await setup();
    const toggle = () => screen.getByRole('button', { name: /sidebar/ });
    const initiallyOpen = screen.queryByRole('complementary', { name: 'Sidebar' }) !== null;
    await userEvent.click(toggle());
    expect(screen.queryByRole('complementary', { name: 'Sidebar' }) !== null).toBe(!initiallyOpen);
    await userEvent.click(toggle());
    expect(screen.queryByRole('complementary', { name: 'Sidebar' }) !== null).toBe(initiallyOpen);
  });

  it('prints every page through the platform', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(cb) {
      cb(new Blob(['png']));
    });
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:fake');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      value: () => Promise.resolve(),
      configurable: true,
    });
    const { platform: p } = await setup();
    await userEvent.keyboard('{Control>}p{/Control}');
    await waitFor(() => {
      expect(p.print).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Preparing to print' })).toBeNull();
    });
  });

  it('lets the user cancel printing', async () => {
    const { doc, platform: p } = await setup();
    doc.renderPage.mockImplementation(
      (_n: number, _c: HTMLCanvasElement, options?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Print' }));
    const progress = await screen.findByRole('dialog', { name: 'Preparing to print' });
    await userEvent.click(within(progress).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Preparing to print' })).toBeNull();
    });
    expect(p.print).not.toHaveBeenCalled();
  });

  it('shows a banner when part of the document cannot be drawn', async () => {
    const doc = fakeDoc(['x']);
    doc.renderPage.mockRejectedValue(new Error('broken page'));
    render(<Viewer doc={doc} fileName="bad.pdf" platform={platform()} onOpen={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Some parts of this document could not be displayed.',
    );
  });

  it('opens another file from the toolbar', async () => {
    const { onOpen } = await setup();
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('cleans up page caches after travelling through the document', async () => {
    const pages = Array.from({ length: 40 }, (_, i) => `page ${String(i + 1)}`);
    const { doc } = await setup(pages);
    const input = screen.getByLabelText('Page number');
    await userEvent.clear(input);
    await userEvent.type(input, '30{Enter}');
    act(() => {
      screen.getByRole('region').dispatchEvent(new Event('scroll'));
    });
    await waitFor(() => {
      expect(doc.cleanupWhenIdle).toHaveBeenCalled();
    });
  });
});
