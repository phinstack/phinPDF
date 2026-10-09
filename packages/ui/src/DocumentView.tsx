import { useEffect, useLayoutEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import {
  CSS_PIXELS_PER_POINT,
  currentPageIndex,
  layoutPages,
  scrollTopForPage,
  visibleRange,
  type Annotation,
  type Layout,
  type PageGeometry,
  type Size,
} from '@phinpdf/core';
import type { AnnotationHandlers } from './AnnotationLayer.tsx';
import { PAGE_GAP } from './constants.ts';
import { PageView, type PageHighlights, type PageSource } from './PageView.tsx';
import { useScrollMetrics } from './use-scroll-metrics.ts';

export interface ScrollRequest {
  /** 0-based page index. */
  readonly page: number;
  /** Changes on every request, so asking for the same page twice still scrolls. */
  readonly key: number;
}

export interface DocumentViewProps {
  readonly document: PageSource;
  /** Page sizes in PDF points, already rotated. */
  readonly sizes: readonly Size[];
  /** Zoom factor, 1 = 100%. */
  readonly zoom: number;
  readonly rotation: number;
  readonly highlights?: ReadonlyMap<number, PageHighlights> | undefined;
  readonly scrollRequest?: ScrollRequest | null | undefined;
  readonly onCurrentPageChange?: ((index: number) => void) | undefined;
  readonly onViewportChange?: ((size: { width: number; height: number }) => void) | undefined;
  readonly onRenderError?: ((error: unknown) => void) | undefined;
  /** Ctrl+wheel zoom; `direction` is 1 to zoom in, -1 to zoom out. */
  readonly onWheelZoom?: ((direction: 1 | -1) => void) | undefined;
  readonly label: string;
  /** Per-page crop boxes; annotations are drawn once these are known. */
  readonly geometries?: readonly PageGeometry[] | undefined;
  /** Annotations by 0-based page index. */
  readonly annotations?: ReadonlyMap<number, readonly Annotation[]> | undefined;
  readonly annotationHandlers?: AnnotationHandlers | undefined;
}

/**
 * The scrolling column of pages. Only pages near the viewport are rendered; the rest are
 * represented by the layout so the scrollbar is right for the whole document.
 */
export function DocumentView({
  document: source,
  sizes,
  zoom,
  rotation,
  highlights,
  scrollRequest,
  onCurrentPageChange,
  onViewportChange,
  onRenderError,
  onWheelZoom,
  label,
  geometries,
  annotations,
  annotationHandlers,
}: DocumentViewProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const metrics = useScrollMetrics(scrollerRef);
  const cssScale = zoom * CSS_PIXELS_PER_POINT;
  const layout = useMemo(() => layoutPages(sizes, cssScale, PAGE_GAP), [sizes, cssScale]);

  // Keep the reader's place when the layout changes (zoom, rotation): same page, same
  // relative position within it.
  const previous = useRef<{ layout: Layout; top: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    const prev = previous.current;
    if (el && prev && prev.layout !== layout && prev.layout.pages.length === layout.pages.length) {
      const index = currentPageIndex(prev.layout, prev.top, prev.height);
      const before = prev.layout.pages[index];
      const after = layout.pages[index];
      if (before && after) {
        const fraction = (prev.top - before.top) / before.height;
        el.scrollTop = after.top + fraction * after.height;
      }
    }
    if (el) previous.current = { layout, top: el.scrollTop, height: el.clientHeight };
  }, [layout]);
  useEffect(() => {
    if (previous.current)
      previous.current = { ...previous.current, top: metrics.top, height: metrics.height };
  }, [metrics.top, metrics.height]);

  // Scroll to a page on request (page box, thumbnails, bookmarks, search).
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (el && scrollRequest) el.scrollTop = scrollTopForPage(layout, scrollRequest.page, PAGE_GAP);
    // Only react to new requests, not to layout changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRequest]);

  const current = currentPageIndex(layout, metrics.top, metrics.height);
  useEffect(() => {
    onCurrentPageChange?.(current);
  }, [current, onCurrentPageChange]);

  useEffect(() => {
    if (metrics.width > 0) onViewportChange?.({ width: metrics.width, height: metrics.height });
  }, [metrics.width, metrics.height, onViewportChange]);

  // Ctrl+wheel zooms the document instead of the browser page.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !onWheelZoom) return;
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      onWheelZoom(event.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, [onWheelZoom]);

  const { first, last } = visibleRange(layout, metrics.top, metrics.height || 800, 1);
  const innerWidth = Math.max(layout.maxWidth + PAGE_GAP * 2, metrics.width);
  const total = sizes.length;

  const pages = [];
  for (let i = first; i <= last; i++) {
    const box = layout.pages[i];
    if (!box) continue;
    pages.push(
      <PageView
        key={i}
        document={source}
        pageNumber={i + 1}
        scale={cssScale}
        rotation={rotation}
        width={box.width}
        height={box.height}
        top={box.top}
        left={(innerWidth - box.width) / 2}
        label={`Page ${String(i + 1)} of ${String(total)}`}
        highlights={highlights?.get(i)}
        onError={onRenderError}
        geometry={geometries?.[i]}
        annotations={annotations?.get(i)}
        annotationHandlers={annotationHandlers}
      />,
    );
  }

  // Home/End jump to the first/last page; other keys scroll natively.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const el = scrollerRef.current;
    if (!el || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Home') el.scrollTop = 0;
    else if (event.key === 'End') el.scrollTop = el.scrollHeight;
    else return;
    event.preventDefault();
  };

  return (
    <div
      ref={scrollerRef}
      className="phinpdf-scroller"
      tabIndex={0}
      role="region"
      aria-label={label}
      onKeyDown={onKeyDown}
      data-first={first + 1}
      data-last={last + 1}
    >
      <div style={{ position: 'relative', width: innerWidth, height: layout.totalHeight }}>
        {pages}
      </div>
    </div>
  );
}
