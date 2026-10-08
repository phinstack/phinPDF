import type { RenderDocument } from '@phinpdf/renderer';

/** Print resolution. 150 dpi keeps text sharp without huge memory use. */
export const PRINT_DPI = 150;
const CONTAINER_ID = 'phinpdf-print';

type PrintSource = Pick<RenderDocument, 'renderPage' | 'numPages'>;

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
      await doc.renderPage(n, canvas, { scale: PRINT_DPI / 72, pixelRatio: 1, signal });
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
