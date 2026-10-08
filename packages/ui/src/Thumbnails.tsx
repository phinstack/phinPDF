import { useEffect, useMemo, useRef } from 'react';
import { layoutPages, visibleRange, type Size } from '@phinpdf/core';
import type { RenderDocument } from '@phinpdf/renderer';
import { THUMBNAIL_GAP, THUMBNAIL_WIDTH } from './constants.ts';
import { useScrollMetrics } from './use-scroll-metrics.ts';

export type ThumbnailSource = Pick<RenderDocument, 'renderPage'>;

function Thumbnail({
  source,
  index,
  size,
  top,
  current,
  onSelect,
}: {
  source: ThumbnailSource;
  index: number;
  size: Size;
  top: number;
  current: boolean;
  onSelect: (index: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const height = (size.height * THUMBNAIL_WIDTH) / size.width;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller = new AbortController();
    source
      .renderPage(index + 1, canvas, {
        scale: THUMBNAIL_WIDTH / size.width,
        pixelRatio: globalThis.devicePixelRatio || 1,
        signal: controller.signal,
      })
      .catch(() => undefined);
    return () => {
      controller.abort();
      canvas.width = 0;
      canvas.height = 0;
    };
  }, [source, index, size.width]);

  return (
    <button
      type="button"
      className={current ? 'phinpdf-thumb current' : 'phinpdf-thumb'}
      style={{ top }}
      aria-current={current ? 'page' : undefined}
      aria-label={`Page ${String(index + 1)}`}
      onClick={() => {
        onSelect(index);
      }}
    >
      <span className="phinpdf-thumb-page" style={{ width: THUMBNAIL_WIDTH, height }}>
        <canvas ref={canvasRef} aria-hidden="true" />
      </span>
      <span className="phinpdf-thumb-label">{index + 1}</span>
    </button>
  );
}

export interface ThumbnailsProps {
  readonly document: ThumbnailSource;
  /** Page sizes in PDF points, already rotated. */
  readonly sizes: readonly Size[];
  readonly currentPage: number;
  readonly onSelect: (index: number) => void;
  /** Thumbnails reflect the view rotation. */
  readonly rotation: number;
}

/** A virtualized column of page thumbnails. The current page stays in view. */
export function Thumbnails({
  document: source,
  sizes,
  currentPage,
  onSelect,
  rotation,
}: ThumbnailsProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const metrics = useScrollMetrics(scrollerRef);
  const layout = useMemo(
    () =>
      layoutPages(
        sizes.map((s) => ({
          width: THUMBNAIL_WIDTH,
          height: (s.height * THUMBNAIL_WIDTH) / s.width,
        })),
        1,
        THUMBNAIL_GAP,
      ),
    [sizes],
  );

  // Scroll the current page's thumbnail into view when it changes.
  useEffect(() => {
    const el = scrollerRef.current;
    const box = layout.pages[currentPage];
    if (!el || !box) return;
    if (box.top < el.scrollTop || box.top + box.height > el.scrollTop + el.clientHeight) {
      el.scrollTop = box.top - THUMBNAIL_GAP;
    }
  }, [currentPage, layout]);

  const { first, last } = visibleRange(layout, metrics.top, metrics.height || 600, 2);
  const items = [];
  for (let i = first; i <= last; i++) {
    const box = layout.pages[i];
    const size = sizes[i];
    if (!box || !size) continue;
    items.push(
      <Thumbnail
        key={`${String(i)}-${String(rotation)}`}
        source={source}
        index={i}
        size={size}
        top={box.top}
        current={i === currentPage}
        onSelect={onSelect}
      />,
    );
  }

  return (
    <div ref={scrollerRef} className="phinpdf-thumbs" aria-label="Page thumbnails">
      <div style={{ position: 'relative', height: layout.totalHeight }}>{items}</div>
    </div>
  );
}
