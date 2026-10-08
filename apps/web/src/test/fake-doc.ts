import { vi } from 'vitest';
import type { RenderDocument } from '@phinpdf/renderer';

/** A RenderDocument stand-in with `numPages` pages whose text is given per page. */
export function fakeDoc(pages: readonly string[] = ['page one', 'page two', 'page three']) {
  const doc = {
    numPages: pages.length,
    getPageSizes: vi.fn(() => Promise.resolve(pages.map(() => ({ width: 612, height: 792 })))),
    getOutline: vi.fn(() => Promise.resolve([])),
    getTextItems: vi.fn((n: number) =>
      Promise.resolve([{ str: pages[n - 1] ?? '', hasEOL: false }]),
    ),
    renderPage: vi.fn<RenderDocument['renderPage']>(() => Promise.resolve()),
    renderTextLayer: vi.fn((n: number, container: HTMLElement) => {
      const span = document.createElement('span');
      span.textContent = pages[n - 1] ?? '';
      container.append(span);
      return Promise.resolve({
        items: [{ str: pages[n - 1] ?? '', hasEOL: false }],
        spans: [span],
      });
    }),
    cleanupWhenIdle: vi.fn(),
    destroy: vi.fn(() => Promise.resolve()),
  };
  return doc as typeof doc & RenderDocument;
}
