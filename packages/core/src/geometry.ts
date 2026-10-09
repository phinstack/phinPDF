/**
 * Conversions between PDF user space (points, y up, origin at the page box's corner) and
 * page view space (CSS pixels, y down, origin at the top-left of the drawn page). These
 * match the transform PDF.js uses for its canvas and text layer, so overlays line up.
 */

/** A point in either space. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** An axis-aligned rectangle in PDF user space, normalized so x0 <= x1 and y0 <= y1. */
export interface PdfRect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** An axis-aligned rectangle in view space (CSS pixels, y down). */
export interface ViewRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** What is needed to place a page: its visible box and its own /Rotate. */
export interface PageGeometry {
  /** The page's crop box in user space: [x0, y0, x1, y1]. */
  readonly view: readonly [number, number, number, number];
  /** The page's own rotation in degrees (0, 90, 180, or 270). */
  readonly rotate: number;
}

/** How a page is currently shown. */
export interface ViewTransform {
  readonly geometry: PageGeometry;
  /** CSS pixels per PDF point. */
  readonly scale: number;
  /** Extra clockwise view rotation on top of the page's own. */
  readonly rotation: number;
}

export const US_LETTER_GEOMETRY: PageGeometry = { view: [0, 0, 612, 792], rotate: 0 };

function totalRotation(t: ViewTransform): 0 | 90 | 180 | 270 {
  const r = (((Math.round((t.geometry.rotate + t.rotation) / 90) * 90) % 360) + 360) % 360;
  return r as 0 | 90 | 180 | 270;
}

/** Maps a PDF user-space point to view space. */
export function pdfToView(p: Point, t: ViewTransform): Point {
  const [x0, y0, x1, y1] = t.geometry.view;
  const s = t.scale;
  switch (totalRotation(t)) {
    case 0:
      return { x: (p.x - x0) * s, y: (y1 - p.y) * s };
    case 90:
      return { x: (p.y - y0) * s, y: (p.x - x0) * s };
    case 180:
      return { x: (x1 - p.x) * s, y: (p.y - y0) * s };
    case 270:
      return { x: (y1 - p.y) * s, y: (x1 - p.x) * s };
  }
}

/** Maps a view-space point back to PDF user space. */
export function viewToPdf(p: Point, t: ViewTransform): Point {
  const [x0, y0, x1, y1] = t.geometry.view;
  const s = t.scale;
  switch (totalRotation(t)) {
    case 0:
      return { x: p.x / s + x0, y: y1 - p.y / s };
    case 90:
      return { x: p.y / s + x0, y: p.x / s + y0 };
    case 180:
      return { x: x1 - p.x / s, y: p.y / s + y0 };
    case 270:
      return { x: x1 - p.y / s, y: y1 - p.x / s };
  }
}

/** Normalizes any two corners into a PdfRect. */
export function pdfRect(ax: number, ay: number, bx: number, by: number): PdfRect {
  return {
    x0: Math.min(ax, bx),
    y0: Math.min(ay, by),
    x1: Math.max(ax, bx),
    y1: Math.max(ay, by),
  };
}

export function pdfRectToView(r: PdfRect, t: ViewTransform): ViewRect {
  const a = pdfToView({ x: r.x0, y: r.y0 }, t);
  const b = pdfToView({ x: r.x1, y: r.y1 }, t);
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

export function viewRectToPdf(r: ViewRect, t: ViewTransform): PdfRect {
  const a = viewToPdf({ x: r.left, y: r.top }, t);
  const b = viewToPdf({ x: r.left + r.width, y: r.top + r.height }, t);
  return pdfRect(a.x, a.y, b.x, b.y);
}

/** The smallest rectangle containing all of `rects`. */
export function unionRect(rects: readonly PdfRect[]): PdfRect | null {
  if (rects.length === 0) return null;
  let { x0, y0, x1, y1 } = rects[0] as PdfRect;
  for (const r of rects) {
    x0 = Math.min(x0, r.x0);
    y0 = Math.min(y0, r.y0);
    x1 = Math.max(x1, r.x1);
    y1 = Math.max(y1, r.y1);
  }
  return { x0, y0, x1, y1 };
}

export function containsPoint(r: ViewRect, p: Point, slop = 0): boolean {
  return (
    p.x >= r.left - slop &&
    p.x <= r.left + r.width + slop &&
    p.y >= r.top - slop &&
    p.y <= r.top + r.height + slop
  );
}

/** Flat QuadPoints for one rectangle, in the order Acrobat writes: UL, UR, LL, LR. */
export function rectToQuad(r: PdfRect): number[] {
  return [r.x0, r.y1, r.x1, r.y1, r.x0, r.y0, r.x1, r.y0];
}

/** Bounding rectangles of flat QuadPoints (8 numbers per quad). Partial quads are ignored. */
export function quadsToRects(quads: ArrayLike<number>): PdfRect[] {
  const rects: PdfRect[] = [];
  for (let i = 0; i + 8 <= quads.length; i += 8) {
    const xs = [quads[i], quads[i + 2], quads[i + 4], quads[i + 6]] as number[];
    const ys = [quads[i + 1], quads[i + 3], quads[i + 5], quads[i + 7]] as number[];
    if (![...xs, ...ys].every(Number.isFinite)) continue;
    rects.push({
      x0: Math.min(...xs),
      y0: Math.min(...ys),
      x1: Math.max(...xs),
      y1: Math.max(...ys),
    });
  }
  return rects;
}

/**
 * Merges view-space rectangles that sit on the same text line and touch or nearly touch,
 * so a selection across several spans becomes one rectangle per line. Rectangles count as
 * one line when they overlap vertically by at least half the smaller height.
 */
export function mergeLineRects(rects: readonly ViewRect[], gap = 2): ViewRect[] {
  const sorted = rects
    .filter((r) => r.width > 0.5 && r.height > 0.5)
    .toSorted((a, b) => a.top - b.top || a.left - b.left);
  const lines: { left: number; top: number; right: number; bottom: number }[] = [];
  for (const r of sorted) {
    const right = r.left + r.width;
    const bottom = r.top + r.height;
    const line = lines.find((l) => {
      const overlap = Math.min(l.bottom, bottom) - Math.max(l.top, r.top);
      const minHeight = Math.min(l.bottom - l.top, r.height);
      const horizontalGap = Math.max(l.left, r.left) - Math.min(l.right, right);
      return overlap >= minHeight / 2 && horizontalGap <= gap;
    });
    if (line) {
      line.left = Math.min(line.left, r.left);
      line.top = Math.min(line.top, r.top);
      line.right = Math.max(line.right, right);
      line.bottom = Math.max(line.bottom, bottom);
    } else {
      lines.push({ left: r.left, top: r.top, right, bottom });
    }
  }
  return lines.map((l) => ({
    left: l.left,
    top: l.top,
    width: l.right - l.left,
    height: l.bottom - l.top,
  }));
}
