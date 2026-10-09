import {
  containsPoint,
  NOTE_SIZE,
  pdfRectToView,
  viewToPdf,
  type Annotation,
  type PdfRect,
  type Point,
  type ViewTransform,
} from '@phinpdf/core';

/** Note icons are drawn at a fixed screen size, like viewers do for /NoZoom notes. */
export const NOTE_ICON_PX = 24;

/** The topmost highlight or underline under a point in view space, if any. */
export function hitTestMarkup(
  annotations: readonly Annotation[],
  transform: ViewTransform,
  point: Point,
): Annotation | null {
  for (let i = annotations.length - 1; i >= 0; i--) {
    const a = annotations[i];
    if (!a || a.kind === 'note') continue;
    if (a.rects.some((r) => containsPoint(pdfRectToView(r, transform), point, 2))) return a;
  }
  return null;
}

/** The rectangle for a note whose icon's top-left corner is at `point` (view space). */
export function noteRectAt(point: Point, transform: ViewTransform): PdfRect {
  const p = viewToPdf(point, transform);
  return { x0: p.x, y0: p.y - NOTE_SIZE, x1: p.x + NOTE_SIZE, y1: p.y };
}
