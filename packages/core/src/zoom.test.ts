import { describe, expect, it } from 'vitest';
import {
  clampZoom,
  formatZoom,
  MAX_ZOOM,
  MIN_ZOOM,
  parseZoom,
  resolveZoom,
  zoomIn,
  zoomOut,
} from './zoom.ts';

const page = { width: 816, height: 1056 };

describe('resolveZoom', () => {
  it('returns explicit scales, clamped', () => {
    expect(resolveZoom({ kind: 'scale', scale: 1.5 }, page, { width: 1, height: 1 }, 0)).toBe(1.5);
    expect(resolveZoom({ kind: 'scale', scale: 100 }, page, { width: 1, height: 1 }, 0)).toBe(
      MAX_ZOOM,
    );
  });

  it('fits the page width inside the padding', () => {
    expect(resolveZoom({ kind: 'fit-width' }, page, { width: 836, height: 500 }, 10)).toBe(1);
  });

  it('fits the whole page using the tighter dimension', () => {
    expect(resolveZoom({ kind: 'fit-page' }, page, { width: 2000, height: 548 }, 10)).toBe(0.5);
    expect(resolveZoom({ kind: 'fit-page' }, page, { width: 428, height: 5000 }, 10)).toBe(0.5);
  });

  it('automatic fits portrait pages to the width, up to 125%', () => {
    expect(resolveZoom({ kind: 'auto' }, page, { width: 428, height: 300 }, 10)).toBe(0.5);
    expect(resolveZoom({ kind: 'auto' }, page, { width: 3000, height: 300 }, 10)).toBe(1.25);
  });

  it('automatic fits landscape pages whole', () => {
    const landscape = { width: 1056, height: 816 };
    expect(resolveZoom({ kind: 'auto' }, landscape, { width: 3000, height: 428 }, 10)).toBe(0.5);
  });

  it('falls back to 100% for a zero-sized page', () => {
    expect(resolveZoom({ kind: 'fit-width' }, { width: 0, height: 0 }, page, 0)).toBe(1);
  });
});

describe('zoom steps', () => {
  it('moves to the next preset step', () => {
    expect(zoomIn(1)).toBe(1.1);
    expect(zoomIn(1.17)).toBe(1.25);
    expect(zoomOut(1)).toBe(0.9);
    expect(zoomOut(1.17)).toBe(1.1);
  });

  it('stops at the limits', () => {
    expect(zoomIn(MAX_ZOOM)).toBe(MAX_ZOOM);
    expect(zoomOut(MIN_ZOOM)).toBe(MIN_ZOOM);
  });
});

describe('clampZoom', () => {
  it('handles non-finite values', () => {
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(0)).toBe(MIN_ZOOM);
  });
});

describe('formatZoom and parseZoom', () => {
  it('formats as a whole percentage', () => {
    expect(formatZoom(1.25)).toBe('125%');
    expect(formatZoom(0.333)).toBe('33%');
  });

  it.each([
    ['125', 1.25],
    ['125%', 1.25],
    [' 80 % ', 0.8],
    ['12.5', 0.125],
    ['100000', MAX_ZOOM],
  ])('parses %j', (input, expected) => {
    expect(parseZoom(input)).toBe(expected);
  });

  it.each(['', 'abc', '-50', '0', '1,5', '50%%', '1.2.3', '.'])('rejects %j', (input) => {
    expect(parseZoom(input)).toBeNull();
  });
});
