import workerSrc from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { configureRenderer } from '@phinpdf/renderer';

/** Points PDF.js at its worker and data files, all served from our own origin. */
export function setupPdfjs(base: string = import.meta.env.BASE_URL): void {
  configureRenderer({
    workerSrc,
    standardFontDataUrl: `${base}pdfjs/standard_fonts/`,
    cMapUrl: `${base}pdfjs/cmaps/`,
    wasmUrl: `${base}pdfjs/wasm/`,
    iccUrl: `${base}pdfjs/iccs/`,
  });
}
