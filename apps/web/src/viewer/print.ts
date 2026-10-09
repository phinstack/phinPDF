import { pdfRectToView, rgbToCss, type Annotation, type ViewTransform } from '@phinpdf/core';
import type { RenderDocument } from '@phinpdf/renderer';

/** Print resolution. 150 dpi keeps text sharp without huge memory use. */
export const PRINT_DPI = 150;
const CONTAINER_ID = 'phinpdf-print';

type PrintSource = Pick<RenderDocument, 'renderPage' | 'numPages' | 'getPageGeometry'>;

/**
 * Draws highlights and underlines onto a printed page. PDF.js doesn't draw them (phinPDF
 * does, see RenderDocument.getAnnotations). Note icons are left out: their text can't be
 * printed, and an icon alone only covers the page.
 */
export function drawAnnotations(
  context: CanvasRenderingContext2D,
  annotations: readonly Annotation[],
  transform: ViewTransform,
): void {
  context.save();
  for (const a of annotations) {
    if (a.kind === 'note') continue;
    context.globalCompositeOperation = a.kind === 'highlight' ? 'multiply' : 'source-over';
    context.fillStyle = rgbToCss(a.color);
    for (const r of a.rects) {
      const rect =
        a.kind === 'highlight' ? r : { ...r, y1: r.y0 + Math.max((r.y1 - r.y0) * 0.08, 0.75) };
      const box = pdfRectToView(rect, transform);
      context.fillRect(box.left, box.top, box.width, box.height);
    }
  }
  context.restore();
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not render page for printing'));
    }, 'image/png');
  });
}

/** Removes a previous print job's images and frees their memory. */
export function cleanupPrint(): void {
  const container = document.getElementById(CONTAINER_ID);
  if (!container) return;
  for (const img of container.querySelectorAll('img')) URL.revokeObjectURL(img.src);
  container.remove();
}

/**
 * Renders every page to an image in a print-only container, then opens the system print
 * dialog (where the user picks pages, printer, and paper). The images are removed after
 * printing.
 */
export async function printDocument(
  doc: PrintSource,
  print: () => Promise<void>,
  onProgress: (done: number) => void,
  signal: AbortSignal,
  annotationsFor: (pageIndex: number) => readonly Annotation[] = () => [],
): Promise<void> {
  cleanupPrint();
  const container = document.createElement('div');
  container.id = CONTAINER_ID;
  container.setAttribute('aria-hidden', 'true');
  const images: HTMLImageElement[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      signal.throwIfAborted();
      const canvas = document.createElement('canvas');
      const scale = PRINT_DPI / 72;
      await doc.renderPage(n, canvas, { scale, pixelRatio: 1, signal });
      const annotations = annotationsFor(n - 1);
      const context = annotations.length > 0 ? canvas.getContext('2d') : null;
      if (context) {
        const geometry = await doc.getPageGeometry(n);
        drawAnnotations(context, annotations, { geometry, scale, rotation: 0 });
      }
      const blob = await toBlob(canvas);
      canvas.width = 0;
      canvas.height = 0;
      const img = new Image();
      img.alt = `Page ${String(n)}`;
      img.src = URL.createObjectURL(blob);
      images.push(img);
      container.append(img);
      onProgress(n);
    }
    signal.throwIfAborted();
    document.body.append(container);
    await Promise.all(images.map((img) => img.decode().catch(() => undefined)));
  } catch (error) {
    for (const img of images) URL.revokeObjectURL(img.src);
    container.remove();
    throw error;
  }
  window.addEventListener('afterprint', cleanupPrint, { once: true });
  await print();
}
