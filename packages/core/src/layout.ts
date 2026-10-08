/** A page's size in CSS pixels at zoom 100% (already rotated). */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Where a page sits in the scrolling column, in CSS pixels at the current zoom. */
export interface PageBox {
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface Layout {
  readonly pages: readonly PageBox[];
  readonly totalHeight: number;
  readonly maxWidth: number;
}

/** Stacks pages vertically with `gap` pixels above, between, and below them. */
export function layoutPages(sizes: readonly Size[], scale: number, gap: number): Layout {
  let top = gap;
  let maxWidth = 0;
  const pages = sizes.map((size) => {
    const box = { top, width: size.width * scale, height: size.height * scale };
    top += box.height + gap;
    maxWidth = Math.max(maxWidth, box.width);
    return box;
  });
  return { pages, totalHeight: top, maxWidth };
}

/** Index of the first page whose bottom edge is below `y` (binary search). */
function firstPageEndingAfter(pages: readonly PageBox[], y: number): number {
  let lo = 0;
  let hi = pages.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const page = pages[mid];
    if (page && page.top + page.height <= y) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export interface Range {
  /** 0-based index of the first page to render. */
  readonly first: number;
  /** 0-based index of the last page to render (inclusive). */
  readonly last: number;
}

/**
 * Pages that intersect the viewport, plus `overscan` pages either side so scrolling
 * doesn't reveal blank pages. Empty documents return { first: 0, last: -1 }.
 */
export function visibleRange(
  layout: Layout,
  scrollTop: number,
  viewportHeight: number,
  overscan = 1,
): Range {
  const { pages } = layout;
  if (pages.length === 0) return { first: 0, last: -1 };
  const first = firstPageEndingAfter(pages, scrollTop);
  let last = first;
  const bottom = scrollTop + viewportHeight;
  while (last + 1 < pages.length && (pages[last + 1]?.top ?? Infinity) < bottom) last++;
  return {
    first: Math.max(0, first - overscan),
    last: Math.min(pages.length - 1, last + overscan),
  };
}

/**
 * The page the reader is looking at: the one covering the most of the viewport.
 * Ties go to the earlier page.
 */
export function currentPageIndex(
  layout: Layout,
  scrollTop: number,
  viewportHeight: number,
): number {
  const { first, last } = visibleRange(layout, scrollTop, viewportHeight, 0);
  let best = first;
  let bestVisible = -1;
  for (let i = first; i <= last; i++) {
    const page = layout.pages[i];
    if (!page) continue;
    const visible =
      Math.min(page.top + page.height, scrollTop + viewportHeight) - Math.max(page.top, scrollTop);
    if (visible > bestVisible) {
      best = i;
      bestVisible = visible;
    }
  }
  return best;
}

/** Scroll position that puts the top of a page just below the top of the viewport. */
export function scrollTopForPage(layout: Layout, index: number, gap: number): number {
  const page = layout.pages[Math.min(Math.max(index, 0), layout.pages.length - 1)];
  return page ? Math.max(0, page.top - gap / 2) : 0;
}
