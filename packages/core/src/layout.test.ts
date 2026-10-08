import { describe, expect, it } from 'vitest';
import { currentPageIndex, layoutPages, scrollTopForPage, visibleRange } from './layout.ts';

const letter = { width: 816, height: 1056 };
const landscape = { width: 1056, height: 816 };

describe('layoutPages', () => {
  it('stacks pages with gaps and scales them', () => {
    const layout = layoutPages([letter, landscape], 0.5, 10);
    expect(layout.pages).toEqual([
      { top: 10, width: 408, height: 528 },
      { top: 548, width: 528, height: 408 },
    ]);
    expect(layout.totalHeight).toBe(966);
    expect(layout.maxWidth).toBe(528);
  });

  it('handles an empty document', () => {
    expect(layoutPages([], 1, 10)).toEqual({ pages: [], totalHeight: 10, maxWidth: 0 });
  });
});

describe('visibleRange', () => {
  const layout = layoutPages(
    Array.from({ length: 100 }, () => ({ width: 100, height: 100 })),
    1,
    10,
  );
  // Page i spans [10 + 110i, 110 + 110i).

  it('returns the pages intersecting the viewport', () => {
    expect(visibleRange(layout, 0, 300, 0)).toEqual({ first: 0, last: 2 });
    expect(visibleRange(layout, 1100, 200, 0)).toEqual({ first: 10, last: 11 });
    expect(visibleRange(layout, 1099, 200, 0)).toEqual({ first: 9, last: 11 });
  });

  it('adds overscan pages on both sides, within bounds', () => {
    expect(visibleRange(layout, 1100, 200, 2)).toEqual({ first: 8, last: 13 });
    expect(visibleRange(layout, 0, 100, 3)).toEqual({ first: 0, last: 3 });
    expect(visibleRange(layout, 10_960, 200, 3)).toEqual({ first: 96, last: 99 });
  });

  it('treats a gap at the top of the viewport as belonging to the next page', () => {
    expect(visibleRange(layout, 112, 50, 0)).toEqual({ first: 1, last: 1 });
  });

  it('copes with scroll positions past the end', () => {
    expect(visibleRange(layout, 99_999, 500, 0)).toEqual({ first: 99, last: 99 });
  });

  it('returns an empty range for an empty document', () => {
    expect(visibleRange(layoutPages([], 1, 10), 0, 500)).toEqual({ first: 0, last: -1 });
  });
});

describe('currentPageIndex', () => {
  const layout = layoutPages(
    Array.from({ length: 10 }, () => ({ width: 100, height: 100 })),
    1,
    10,
  );

  it('picks the page covering most of the viewport', () => {
    expect(currentPageIndex(layout, 0, 100)).toBe(0);
    expect(currentPageIndex(layout, 90, 100)).toBe(1);
    expect(currentPageIndex(layout, 330, 100)).toBe(3);
  });

  it('prefers the earlier page on a tie', () => {
    // Viewport [60, 160): page 0 shows 50px, page 1 shows 40px.
    expect(currentPageIndex(layout, 60, 100)).toBe(0);
  });
});

describe('scrollTopForPage', () => {
  const layout = layoutPages([letter, letter, letter], 1, 20);

  it('scrolls so the page sits just below the top edge', () => {
    expect(scrollTopForPage(layout, 0, 20)).toBe(10);
    expect(scrollTopForPage(layout, 2, 20)).toBe(20 + 2 * (1056 + 20) - 10);
  });

  it('clamps out-of-range indices', () => {
    expect(scrollTopForPage(layout, -5, 20)).toBe(10);
    expect(scrollTopForPage(layout, 99, 20)).toBe(scrollTopForPage(layout, 2, 20));
    expect(scrollTopForPage(layoutPages([], 1, 20), 3, 20)).toBe(0);
  });
});
