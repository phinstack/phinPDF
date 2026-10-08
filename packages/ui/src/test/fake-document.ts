import { vi } from 'vitest';
import type { TextLayerResult } from '@phinpdf/renderer';

type RenderPage = (page: number, canvas: HTMLCanvasElement, options?: unknown) => Promise<void>;
type RenderTextLayer = (
  page: number,
  container: HTMLElement,
  options?: unknown,
) => Promise<TextLayerResult>;

/** A stand-in for RenderDocument's drawing methods. Text layers get one span per item. */
export function fakeSource(itemsPerPage: readonly string[] = ['Hello world']) {
  return {
    renderPage: vi.fn<RenderPage>(() => Promise.resolve()),
    renderTextLayer: vi.fn<RenderTextLayer>((_page, container) => {
      const spans = itemsPerPage.map((str) => {
        const span = document.createElement('span');
        span.textContent = str;
        container.append(span);
        return span;
      });
      return Promise.resolve({ items: itemsPerPage.map((str) => ({ str, hasEOL: false })), spans });
    }),
  };
}
