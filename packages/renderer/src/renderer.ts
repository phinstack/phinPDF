import {
  getDocument,
  GlobalWorkerOptions,
  InvalidPDFException,
  PasswordException,
  PasswordResponses,
  TextLayer,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import { OpenError } from './errors.ts';
import { resolveOutline, type OutlineNode, type RawOutlineItem } from './outline.ts';

/** URLs of PDF.js assets, supplied by the app because they depend on its bundler. */
export interface RendererAssets {
  readonly workerSrc?: string;
  readonly standardFontDataUrl?: string;
  readonly cMapUrl?: string;
  readonly wasmUrl?: string;
  readonly iccUrl?: string;
}

/**
 * Security-relevant PDF.js options (ADR-0007). PDF.js 6 no longer has `isEvalSupported`
 * or any eval; the matching control is the app's CSP without 'unsafe-eval'. PDF
 * JavaScript never runs because the PDF.js scripting sandbox is never loaded.
 */
export const SECURE_DOCUMENT_OPTIONS = Object.freeze({
  /** Never render XFA forms. */
  enableXfa: false,
  /** Render what we can from damaged files instead of failing the whole document. */
  stopAtErrors: false,
  /** Images larger than this many pixels are skipped (decompression-bomb guard). */
  maxImageSize: 64 * 1024 * 1024,
});

export const DEFAULT_MAX_FILE_BYTES = 512 * 1024 * 1024;

/**
 * Largest canvas we draw, in device pixels (4096 x 4096). Bigger canvases are slow and can
 * exhaust GPU memory, so very large pages or zooms render at a lower pixel ratio instead.
 */
export const MAX_CANVAS_PIXELS = 4096 * 4096;

/** Pixel ratio to render at so that a canvas stays within `maxPixels`. */
export function cappedPixelRatio(
  cssWidth: number,
  cssHeight: number,
  pixelRatio: number,
  maxPixels: number = MAX_CANVAS_PIXELS,
): number {
  const pixels = cssWidth * cssHeight * pixelRatio * pixelRatio;
  if (pixels <= maxPixels || pixels === 0) return pixelRatio;
  return pixelRatio * Math.sqrt(maxPixels / pixels);
}

/** Normalizes a rotation to 0, 90, 180, or 270 degrees. */
export function normalizeRotation(degrees: number): 0 | 90 | 180 | 270 {
  const r = (((Math.round(degrees / 90) * 90) % 360) + 360) % 360;
  return r as 0 | 90 | 180 | 270;
}

let assets: RendererAssets = {};

export function configureRenderer(next: RendererAssets): void {
  assets = { ...next };
  if (next.workerSrc) GlobalWorkerOptions.workerSrc = next.workerSrc;
}

/** True if a `%PDF-` header appears in the first 1024 bytes (as the spec allows). */
export function looksLikePdf(bytes: Uint8Array): boolean {
  const end = Math.min(bytes.length, 1024) - 5;
  for (let i = 0; i <= end; i++) {
    if (
      bytes[i] === 0x25 && // %
      bytes[i + 1] === 0x50 && // P
      bytes[i + 2] === 0x44 && // D
      bytes[i + 3] === 0x46 && // F
      bytes[i + 4] === 0x2d // -
    ) {
      return true;
    }
  }
  return false;
}

export interface OpenOptions {
  readonly password?: string;
  readonly maxBytes?: number;
}

export interface PageSize {
  readonly width: number;
  readonly height: number;
}

export interface RenderOptions {
  /** CSS pixels per PDF point. */
  readonly scale?: number;
  /** Device pixels per CSS pixel (window.devicePixelRatio). */
  readonly pixelRatio?: number;
  /** Extra clockwise rotation on top of the page's own, in degrees. */
  readonly rotation?: number;
  readonly signal?: AbortSignal;
}

/** One run of text on a page, as used by search. */
export interface PageTextItem {
  readonly str: string;
  readonly hasEOL: boolean;
}

export interface TextLayerResult {
  /** The text items, in the same order as `spans`. */
  readonly items: readonly PageTextItem[];
  /** One span per text item, for search highlighting. */
  readonly spans: readonly HTMLElement[];
}

function toOpenError(error: unknown): OpenError {
  if (error instanceof PasswordException) {
    return error.code === PasswordResponses.INCORRECT_PASSWORD
      ? new OpenError('password-incorrect', 'Incorrect password', { cause: error })
      : new OpenError('password-required', 'Password required', { cause: error });
  }
  if (error instanceof InvalidPDFException) {
    return new OpenError('invalid', 'Invalid or corrupted PDF', { cause: error });
  }
  return new OpenError('unknown', 'Could not open PDF', { cause: error });
}

export async function openDocument(
  bytes: Uint8Array,
  { password, maxBytes = DEFAULT_MAX_FILE_BYTES }: OpenOptions = {},
): Promise<RenderDocument> {
  if (bytes.length > maxBytes) throw new OpenError('too-large', 'File too large');
  if (!looksLikePdf(bytes)) throw new OpenError('not-pdf', 'No PDF header found');

  const task = getDocument({
    ...assets,
    ...SECURE_DOCUMENT_OPTIONS,
    // PDF.js transfers the buffer to its worker, so give it a copy and keep ours intact.
    data: bytes.slice(),
    ...(password === undefined ? {} : { password }),
  });
  try {
    return new RenderDocument(task, await task.promise);
  } catch (error) {
    await task.destroy();
    throw toOpenError(error);
  }
}

export class RenderDocument {
  readonly #task: PDFDocumentLoadingTask;
  readonly #doc: PDFDocumentProxy;
  #destroyed = false;
  /** Renders and text extractions in progress (cleanup must wait for them). */
  #active = 0;
  #cleanupPending = false;

  constructor(task: PDFDocumentLoadingTask, doc: PDFDocumentProxy) {
    this.#task = task;
    this.#doc = doc;
  }

  get numPages(): number {
    return this.#doc.numPages;
  }

  /** Page size in CSS pixels at the given scale, after the page's own rotation. */
  async getPageSize(pageNumber: number, scale = 1, rotation = 0): Promise<PageSize> {
    const page = await this.#getPage(pageNumber);
    const { width, height } = this.#viewport(page, scale, rotation);
    return { width, height };
  }

  /**
   * Sizes of every page, fetched in batches. Used to lay out the scrolling view before
   * any page is drawn. A page that can't be loaded (a damaged page tree) gets the size of
   * the page before it, or US Letter, so one bad page doesn't stop the whole document.
   * Rejects with an AbortError if `signal` aborts.
   */
  async getPageSizes(scale = 1, rotation = 0, signal?: AbortSignal): Promise<PageSize[]> {
    const results: (PageSize | null)[] = [];
    const batch = 32;
    for (let start = 1; start <= this.numPages; start += batch) {
      signal?.throwIfAborted();
      const end = Math.min(this.numPages, start + batch - 1);
      const numbers = Array.from({ length: end - start + 1 }, (_, i) => start + i);
      results.push(
        ...(await Promise.all(
          numbers.map((n) => this.getPageSize(n, scale, rotation).catch(() => null)),
        )),
      );
    }
    signal?.throwIfAborted();
    const letter =
      rotation % 180 === 0
        ? { width: 612 * scale, height: 792 * scale }
        : { width: 792 * scale, height: 612 * scale };
    let previous: PageSize = letter;
    return results.map((size) => (previous = size ?? previous));
  }

  /** Renders a page into a canvas, sizing the canvas for sharp output on HiDPI screens. */
  async renderPage(
    pageNumber: number,
    canvas: HTMLCanvasElement,
    { scale = 1, pixelRatio = 1, rotation = 0, signal }: RenderOptions = {},
  ): Promise<void> {
    signal?.throwIfAborted();
    const page = await this.#getPage(pageNumber);
    signal?.throwIfAborted();
    const css = this.#viewport(page, scale, rotation);
    const ratio = cappedPixelRatio(css.width, css.height, pixelRatio);
    const viewport = this.#viewport(page, scale * ratio, rotation);
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${String(Math.floor(css.width))}px`;
    canvas.style.height = `${String(Math.floor(css.height))}px`;
    const task = page.render({ canvas, viewport });
    const onAbort = (): void => {
      task.cancel();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    this.#begin();
    try {
      await task.promise;
    } finally {
      signal?.removeEventListener('abort', onAbort);
      page.cleanup();
      this.#end();
    }
  }

  /**
   * Renders the invisible, selectable text layer for a page into `container` (which must
   * have the `textLayer` class and be positioned over the canvas).
   */
  async renderTextLayer(
    pageNumber: number,
    container: HTMLElement,
    { scale = 1, rotation = 0, signal }: Omit<RenderOptions, 'pixelRatio'> = {},
  ): Promise<TextLayerResult> {
    signal?.throwIfAborted();
    const page = await this.#getPage(pageNumber);
    signal?.throwIfAborted();
    const viewport = this.#viewport(page, scale, rotation);
    container.replaceChildren();
    container.style.setProperty('--total-scale-factor', String(scale));
    container.style.setProperty('--scale-round-x', '1px');
    container.style.setProperty('--scale-round-y', '1px');
    const layer = new TextLayer({
      textContentSource: page.streamTextContent({ includeMarkedContent: false }),
      container,
      viewport,
    });
    const onAbort = (): void => {
      layer.cancel();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    this.#begin();
    try {
      await layer.render();
    } finally {
      signal?.removeEventListener('abort', onAbort);
      this.#end();
    }
    const strings = layer.textContentItemsStr;
    return {
      items: strings.map((str, i) => ({
        str,
        hasEOL: layer.textDivs[i]?.nextSibling?.nodeName === 'BR',
      })),
      spans: layer.textDivs,
    };
  }

  /** The page's text items, for search. Marked-content entries are skipped. */
  async getTextItems(pageNumber: number): Promise<PageTextItem[]> {
    const page = await this.#getPage(pageNumber);
    this.#begin();
    let content;
    try {
      content = await page.getTextContent({ includeMarkedContent: false });
    } finally {
      this.#end();
    }
    return content.items.flatMap((item) =>
      'str' in item ? [{ str: item.str, hasEOL: item.hasEOL }] : [],
    );
  }

  /** The document outline (bookmarks) with destinations resolved to page indices. */
  async getOutline(): Promise<OutlineNode[]> {
    const doc = this.#doc;
    const raw = (await doc.getOutline()) as RawOutlineItem[] | null;
    return resolveOutline(raw ?? [], {
      numPages: doc.numPages,
      getDestination: (name) => doc.getDestination(name),
      getPageIndex: (ref) =>
        doc.getPageIndex(ref as Parameters<PDFDocumentProxy['getPageIndex']>[0]),
    });
  }

  /**
   * Frees cached fonts, images, and page data on both threads. Long documents can embed
   * many fonts, and PDF.js keeps every font it has loaded until this runs. PDF.js must not
   * clean up while a page is drawing, so this waits until no work is in progress.
   */
  cleanupWhenIdle(): void {
    if (this.#destroyed) return;
    if (this.#active > 0) {
      this.#cleanupPending = true;
      return;
    }
    this.#cleanupPending = false;
    void this.#doc.cleanup().catch(() => undefined);
  }

  #begin(): void {
    this.#active += 1;
  }

  #end(): void {
    this.#active = Math.max(0, this.#active - 1);
    if (this.#active === 0 && this.#cleanupPending) this.cleanupWhenIdle();
  }

  async destroy(): Promise<void> {
    if (this.#destroyed) return;
    this.#destroyed = true;
    await this.#task.destroy();
  }

  #viewport(page: PDFPageProxy, scale: number, rotation: number) {
    return page.getViewport({ scale, rotation: normalizeRotation(page.rotate + rotation) });
  }

  #getPage(pageNumber: number) {
    if (this.#destroyed) throw new Error('Document has been destroyed');
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > this.numPages) {
      throw new RangeError(`Page ${String(pageNumber)} is out of range 1–${String(this.numPages)}`);
    }
    return this.#doc.getPage(pageNumber);
  }
}
