import {
  getDocument,
  GlobalWorkerOptions,
  InvalidPDFException,
  PasswordException,
  PasswordResponses,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import { OpenError } from './errors.ts';

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
  readonly signal?: AbortSignal;
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

  constructor(task: PDFDocumentLoadingTask, doc: PDFDocumentProxy) {
    this.#task = task;
    this.#doc = doc;
  }

  get numPages(): number {
    return this.#doc.numPages;
  }

  /** Page size in CSS pixels at the given scale, after the page's own rotation. */
  async getPageSize(pageNumber: number, scale = 1): Promise<PageSize> {
    const page = await this.#getPage(pageNumber);
    const { width, height } = page.getViewport({ scale });
    return { width, height };
  }

  /** Renders a page into a canvas, sizing the canvas for sharp output on HiDPI screens. */
  async renderPage(
    pageNumber: number,
    canvas: HTMLCanvasElement,
    { scale = 1, pixelRatio = 1, signal }: RenderOptions = {},
  ): Promise<void> {
    signal?.throwIfAborted();
    const page = await this.#getPage(pageNumber);
    signal?.throwIfAborted();
    const viewport = page.getViewport({ scale: scale * pixelRatio });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${String(Math.floor(viewport.width / pixelRatio))}px`;
    canvas.style.height = `${String(Math.floor(viewport.height / pixelRatio))}px`;
    const task = page.render({ canvas, viewport });
    const onAbort = (): void => {
      task.cancel();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      await task.promise;
    } finally {
      signal?.removeEventListener('abort', onAbort);
      page.cleanup();
    }
  }

  async destroy(): Promise<void> {
    if (this.#destroyed) return;
    this.#destroyed = true;
    await this.#task.destroy();
  }

  #getPage(pageNumber: number) {
    if (this.#destroyed) throw new Error('Document has been destroyed');
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > this.numPages) {
      throw new RangeError(`Page ${String(pageNumber)} is out of range 1–${String(this.numPages)}`);
    }
    return this.#doc.getPage(pageNumber);
  }
}
