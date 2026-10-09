import { describe, expect, it } from 'vitest';
import {
  containsPoint,
  mergeLineRects,
  pdfRect,
  pdfRectToView,
  pdfToView,
  quadsToRects,
  rectToQuad,
  unionRect,
  viewRectToPdf,
  viewToPdf,
  type PageGeometry,
  type ViewTransform,
} from './geometry.ts';

const letter: PageGeometry = { view: [0, 0, 612, 792], rotate: 0 };
const cropped: PageGeometry = { view: [50, 100, 550, 700], rotate: 0 };

const t = (geometry: PageGeometry, scale: number, rotation = 0): ViewTransform => ({
  geometry,
  scale,
  rotation,
});

describe('pdfToView / viewToPdf', () => {
  it('flips y and scales at rotation 0', () => {
    expect(pdfToView({ x: 0, y: 792 }, t(letter, 1))).toEqual({ x: 0, y: 0 });
    expect(pdfToView({ x: 612, y: 0 }, t(letter, 2))).toEqual({ x: 1224, y: 1584 });
  });

  it('offsets by the crop box origin', () => {
    expect(pdfToView({ x: 50, y: 700 }, t(cropped, 1))).toEqual({ x: 0, y: 0 });
    expect(pdfToView({ x: 550, y: 100 }, t(cropped, 1))).toEqual({ x: 500, y: 600 });
  });

  // Corners of the page box must land on the corners of the rotated view.
  it.each([
    [90, { x: 0, y: 792 }, { x: 792, y: 0 }],
    [180, { x: 0, y: 792 }, { x: 612, y: 792 }],
    [270, { x: 0, y: 792 }, { x: 0, y: 612 }],
  ])('maps the top-left corner at rotation %i', (rotation, pdf, view) => {
    expect(pdfToView(pdf, t(letter, 1, rotation))).toEqual(view);
  });

  it('adds the page rotation to the view rotation', () => {
    const rotated: PageGeometry = { view: [0, 0, 612, 792], rotate: 90 };
    expect(pdfToView({ x: 10, y: 20 }, t(rotated, 1, 270))).toEqual(
      pdfToView({ x: 10, y: 20 }, t(letter, 1, 0)),
    );
  });

  it.each([0, 90, 180, 270, -90, 450])('round-trips at rotation %i', (rotation) => {
    for (const geometry of [letter, cropped, { view: [0, 0, 300, 200], rotate: 270 } as const]) {
      const transform = t(geometry, 1.75, rotation);
      const p = { x: 123.5, y: 456.25 };
      const back = viewToPdf(pdfToView(p, transform), transform);
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
  });
});

describe('rectangles', () => {
  it('normalizes corners', () => {
    expect(pdfRect(10, 20, 5, 1)).toEqual({ x0: 5, y0: 1, x1: 10, y1: 20 });
  });

  it.each([0, 90, 180, 270])('round-trips a rect through view space at %i', (rotation) => {
    const transform = t(cropped, 1.5, rotation);
    const r = { x0: 100, y0: 200, x1: 300, y1: 260 };
    const back = viewRectToPdf(pdfRectToView(r, transform), transform);
    expect(back.x0).toBeCloseTo(r.x0);
    expect(back.y0).toBeCloseTo(r.y0);
    expect(back.x1).toBeCloseTo(r.x1);
    expect(back.y1).toBeCloseTo(r.y1);
  });

  it('places a rect at the top left of an unrotated page', () => {
    expect(pdfRectToView({ x0: 0, y0: 772, x1: 20, y1: 792 }, t(letter, 1))).toEqual({
      left: 0,
      top: 0,
      width: 20,
      height: 20,
    });
  });

  it('unions rectangles', () => {
    expect(unionRect([])).toBeNull();
    expect(
      unionRect([
        { x0: 1, y0: 2, x1: 3, y1: 4 },
        { x0: -1, y0: 3, x1: 2, y1: 10 },
      ]),
    ).toEqual({ x0: -1, y0: 2, x1: 3, y1: 10 });
  });

  it('hit-tests with slop', () => {
    const r = { left: 10, top: 10, width: 10, height: 10 };
    expect(containsPoint(r, { x: 15, y: 15 })).toBe(true);
    expect(containsPoint(r, { x: 21, y: 15 })).toBe(false);
    expect(containsPoint(r, { x: 21, y: 15 }, 2)).toBe(true);
  });
});

describe('quads', () => {
  it('writes UL, UR, LL, LR and reads them back', () => {
    const r = { x0: 72, y0: 700, x1: 272, y1: 720 };
    expect(rectToQuad(r)).toEqual([72, 720, 272, 720, 72, 700, 272, 700]);
    expect(quadsToRects(rectToQuad(r))).toEqual([r]);
  });

  it('reads quads in any point order and skips partial or invalid ones', () => {
    expect(
      quadsToRects([0, 0, 10, 0, 0, 5, 10, 5, 1, 1, Number.NaN, 1, 1, 1, 1, 1, 1, 2, 3]),
    ).toEqual([{ x0: 0, y0: 0, x1: 10, y1: 5 }]);
  });
});

describe('mergeLineRects', () => {
  it('joins touching rects on one line and keeps lines apart', () => {
    const merged = mergeLineRects([
      { left: 0, top: 0, width: 50, height: 12 },
      { left: 51, top: 1, width: 40, height: 10 },
      { left: 0, top: 20, width: 30, height: 12 },
    ]);
    expect(merged).toEqual([
      { left: 0, top: 0, width: 91, height: 12 },
      { left: 0, top: 20, width: 30, height: 12 },
    ]);
  });

  it('keeps distant rects on the same line separate and drops empty ones', () => {
    const merged = mergeLineRects([
      { left: 0, top: 0, width: 10, height: 10 },
      { left: 100, top: 0, width: 10, height: 10 },
      { left: 5, top: 5, width: 0, height: 10 },
    ]);
    expect(merged).toHaveLength(2);
  });
});
