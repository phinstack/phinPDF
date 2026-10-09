import { vi } from 'vitest';
import type { PageGeometry } from '@phinpdf/core';
import type { LoadedAnnotation, RenderDocument } from '@phinpdf/renderer';

const LETTER: PageGeometry = { view: [0, 0, 612, 792], rotate: 0 };

/** A RenderDocument stand-in with `numPages` pages whose text is given per page. */
export function fakeDoc(
  pages: readonly string[] = ['page one', 'page two', 'page three'],
  annotations: readonly LoadedAnnotation[] = [],
) {
  const doc = {
    numPages: pages.length,
    getPageSizes: vi.fn(() => Promise.resolve(pages.map(() => ({ width: 612, height: 792 })))),
    getPageGeometries: vi.fn(() => Promise.resolve(pages.map(() => LETTER))),
    getPageGeometry: vi.fn(() => Promise.resolve(LETTER)),
    getAnnotations: vi.fn((n: number) =>
      Promise.resolve(annotations.filter((a) => a.annotation.pageIndex === n - 1)),
    ),
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
