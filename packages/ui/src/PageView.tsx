import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { Annotation, ItemRange, PageGeometry, ViewTransform } from '@phinpdf/core';
import type { RenderDocument, TextLayerResult } from '@phinpdf/renderer';
import { hitTestMarkup, NOTE_ICON_PX, noteRectAt } from './annotation-hit.ts';
import { AnnotationLayer, type AnnotationHandlers } from './AnnotationLayer.tsx';

/** The parts of a document a page view needs (narrow, so tests can fake it). */
export type PageSource = Pick<RenderDocument, 'renderPage' | 'renderTextLayer'>;

/** Search matches to paint on one page. */
export interface PageHighlights {
  /** Number of text items the ranges refer to (to detect a mismatch with the text layer). */
  readonly itemCount: number;
  readonly matches: readonly { readonly ranges: readonly ItemRange[]; readonly current: boolean }[];
}

export interface PageViewProps {
  readonly document: PageSource;
  readonly pageNumber: number;
  /** CSS pixels per PDF point. */
  readonly scale: number;
  readonly rotation: number;
  readonly width: number;
  readonly height: number;
  readonly top: number;
  readonly left: number;
  readonly label: string;
  readonly highlights?: PageHighlights | undefined;
  readonly onError?: ((error: unknown) => void) | undefined;
  /** The page's crop box and rotation. Annotations are only shown when it is known. */
  readonly geometry?: PageGeometry | undefined;
  readonly annotations?: readonly Annotation[] | undefined;
  readonly annotationHandlers?: AnnotationHandlers | undefined;
}

const NO_ANNOTATIONS: readonly Annotation[] = [];

function isCancellation(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' ||
      error.name === 'RenderingCancelledException' ||
      error.name === 'AbortException')
  );
}

/** Restores each span's original text, removing any highlight marks. */
function clearMarks(spans: readonly HTMLElement[], items: TextLayerResult['items']): void {
  spans.forEach((span, i) => {
    if (span.querySelector('mark')) span.textContent = items[i]?.str ?? span.textContent;
  });
}

/** Wraps matched substrings of text-layer spans in <mark> elements. */
function applyMarks(text: TextLayerResult, highlights: PageHighlights): HTMLElement | null {
  const byItem = new Map<number, { start: number; end: number; current: boolean }[]>();
  for (const match of highlights.matches) {
    for (const r of match.ranges) {
      const list = byItem.get(r.item) ?? [];
      list.push({ start: r.start, end: r.end, current: match.current });
      byItem.set(r.item, list);
    }
  }
  let currentMark: HTMLElement | null = null;
  for (const [item, ranges] of byItem) {
    const span = text.spans[item];
    const str = text.items[item]?.str;
    if (!span || str === undefined) continue;
    ranges.sort((a, b) => a.start - b.start);
    const nodes: Node[] = [];
    let pos = 0;
    for (const r of ranges) {
      if (r.start > pos) nodes.push(document.createTextNode(str.slice(pos, r.start)));
      const mark = document.createElement('mark');
      mark.className = r.current ? 'phinpdf-hit current' : 'phinpdf-hit';
      mark.textContent = str.slice(r.start, r.end);
      if (r.current) currentMark ??= mark;
      nodes.push(mark);
      pos = Math.max(pos, r.end);
    }
    if (pos < str.length) nodes.push(document.createTextNode(str.slice(pos)));
    span.replaceChildren(...nodes);
  }
  return currentMark;
}

/** One page: the rendered canvas plus the selectable, searchable text layer. */
export function PageView({
  document: source,
  pageNumber,
  scale,
  rotation,
  width,
  height,
  top,
  left,
  label,
  highlights,
  onError,
  geometry,
  annotations = NO_ANNOTATIONS,
  annotationHandlers: handlers,
}: PageViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState<TextLayerResult | null>(null);
  // The canvas render that finished last, so tests and tools can tell when the page is drawn.
  const [drawn, setDrawn] = useState<string | null>(null);
  const renderKey = `${String(pageNumber)}@${String(scale)}/${String(rotation)}`;

  // Draw the page. Cancelled when the page scrolls out of range or the zoom changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller = new AbortController();
    const pixelRatio = globalThis.devicePixelRatio || 1;
    const key = `${String(pageNumber)}@${String(scale)}/${String(rotation)}`;
    source
      .renderPage(pageNumber, canvas, { scale, rotation, pixelRatio, signal: controller.signal })
      .then(
        () => {
          if (!controller.signal.aborted) setDrawn(key);
        },
        (error: unknown) => {
          if (!isCancellation(error)) onError?.(error);
        },
      );
    return () => {
      controller.abort();
    };
  }, [source, pageNumber, scale, rotation, onError]);

  // Release the canvas memory as soon as the page leaves the rendered range.
  useEffect(() => {
    const canvas = canvasRef.current;
    return () => {
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    };
  }, []);

  // Build the text layer.
  useEffect(() => {
    const container = textRef.current;
    if (!container) return;
    const controller = new AbortController();
    source
      .renderTextLayer(pageNumber, container, { scale, rotation, signal: controller.signal })
      .then(
        (result) => {
          if (!controller.signal.aborted) setText(result);
        },
        (error: unknown) => {
          if (!isCancellation(error)) onError?.(error);
        },
      );
    return () => {
      controller.abort();
      setText(null);
    };
  }, [source, pageNumber, scale, rotation, onError]);

  // Paint search matches, and bring the current match into view.
  useEffect(() => {
    if (!text || !highlights || highlights.itemCount !== text.items.length) return;
    const current = applyMarks(text, highlights);
    current?.scrollIntoView({ block: 'center', inline: 'nearest' });
    return () => {
      clearMarks(text.spans, text.items);
    };
  }, [text, highlights]);

  const transform = useMemo<ViewTransform | null>(
    () => (geometry ? { geometry, scale, rotation } : null),
    [geometry, scale, rotation],
  );

  // Clicks select highlights and underlines (which sit under the text layer), or place a
  // note with the note tool. A click that ends a text selection does neither.
  const onClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (!handlers || !transform || event.button !== 0) return;
    const box = event.currentTarget.getBoundingClientRect();
    const point = { x: event.clientX - box.left, y: event.clientY - box.top };
    if (handlers.tool === 'note') {
      const corner = { x: point.x - NOTE_ICON_PX / 2, y: point.y - NOTE_ICON_PX / 2 };
      handlers.onPlaceNote(pageNumber - 1, noteRectAt(corner, transform));
      return;
    }
    const selection = globalThis.getSelection();
    if (selection && !selection.isCollapsed) return;
    handlers.onSelect(hitTestMarkup(annotations, transform, point)?.id ?? null);
  };

  return (
    // Clicking is a pointer convenience; every action has a keyboard path (toolbar, notes,
    // comments panel), so the page itself is not a control.
    <div
      className="phinpdf-page"
      role="img"
      aria-label={label}
      data-page={pageNumber}
      data-text-ready={text ? 'true' : 'false'}
      data-rendered={drawn === renderKey ? 'true' : 'false'}
      data-tool={handlers?.tool}
      style={{ top, left, width, height }}
      onClick={onClick}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      {transform && handlers && (
        <AnnotationLayer
          annotations={annotations}
          transform={transform}
          width={width}
          height={height}
          handlers={handlers}
          layer="marks"
        />
      )}
      <div ref={textRef} className="textLayer" />
      {transform && handlers && (
        <AnnotationLayer
          annotations={annotations}
          transform={transform}
          width={width}
          height={height}
          handlers={handlers}
          layer="notes"
        />
      )}
    </div>
  );
}
