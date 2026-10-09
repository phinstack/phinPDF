import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import {
  annotationRect,
  pdfRectToView,
  pdfToView,
  rgbToCss,
  type Annotation,
  type NoteAnnotation,
  type PdfRect,
  type Point,
  type ViewTransform,
} from '@phinpdf/core';
import { NOTE_ICON_PX, noteRectAt } from './annotation-hit.ts';

/** What a click on the page does. */
export type AnnotationTool = 'select' | 'highlight' | 'underline' | 'note';

/** Callbacks and shared state for editing annotations, the same for every page. */
export interface AnnotationHandlers {
  readonly tool: AnnotationTool;
  readonly selectedId: string | null;
  readonly onSelect: (id: string | null) => void;
  readonly onMoveNote: (note: NoteAnnotation, rect: PdfRect) => void;
  /** A click on the page with the note tool, centred on the click. */
  readonly onPlaceNote: (pageIndex: number, rect: PdfRect) => void;
}

/** Pixels a note must be dragged before it moves (so a click doesn't nudge it). */
const DRAG_THRESHOLD = 3;

/**
 * Where a note's icon goes: the view position of its rectangle's top-left corner in PDF
 * space. The icon stays upright when the page is rotated, like /NoRotate notes.
 */
function noteOrigin(note: NoteAnnotation, transform: ViewTransform): Point {
  return pdfToView({ x: note.rect.x0, y: note.rect.y1 }, transform);
}

function underlineRect(r: PdfRect, transform: ViewTransform) {
  // The line sits at the bottom of the text in PDF space, so it follows rotation.
  const thickness = Math.max((r.y1 - r.y0) * 0.08, 0.75);
  return pdfRectToView({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y0 + thickness }, transform);
}

function summary(a: Annotation): string {
  const text = a.contents.trim();
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

function NoteIcon({
  note,
  transform,
  selected,
  handlers,
}: {
  note: NoteAnnotation;
  transform: ViewTransform;
  selected: boolean;
  handlers: AnnotationHandlers;
}) {
  const origin = noteOrigin(note, transform);
  const [drag, setDrag] = useState<Point | null>(null);
  const start = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { x: event.clientX, y: event.clientY, moved: false };
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>): void => {
    const s = start.current;
    if (!s) return;
    const dx = event.clientX - s.x;
    const dy = event.clientY - s.y;
    if (!s.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    s.moved = true;
    setDrag({ x: origin.x + dx, y: origin.y + dy });
  };
  const onPointerUp = (event: PointerEvent<HTMLButtonElement>): void => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    event.stopPropagation();
    if (s.moved) {
      const at = { x: origin.x + event.clientX - s.x, y: origin.y + event.clientY - s.y };
      setDrag(null);
      handlers.onMoveNote(note, noteRectAt(at, transform));
    }
    handlers.onSelect(note.id);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const step = event.shiftKey ? 10 : 1;
    const delta: Record<string, Point> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const d = delta[event.key];
    if (!d) return;
    event.preventDefault();
    event.stopPropagation();
    handlers.onMoveNote(note, noteRectAt({ x: origin.x + d.x, y: origin.y + d.y }, transform));
  };

  const at = drag ?? origin;
  const text = summary(note);
  return (
    <button
      type="button"
      className={selected ? 'phinpdf-note selected' : 'phinpdf-note'}
      style={{ left: at.x, top: at.y, width: NOTE_ICON_PX, height: NOTE_ICON_PX }}
      aria-label={text ? `Note: ${text}` : 'Note'}
      aria-pressed={selected}
      title={text || 'Note'}
      data-annotation-id={note.id}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        start.current = null;
        setDrag(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        // Keyboard activation (pointer clicks are handled on pointer up).
        if (e.detail === 0) handlers.onSelect(note.id);
      }}
      onKeyDown={onKeyDown}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M3 4.5A1.5 1.5 0 0 1 4.5 3h15A1.5 1.5 0 0 1 21 4.5v11a1.5 1.5 0 0 1-1.5 1.5H10l-5 4v-4h-.5A1.5 1.5 0 0 1 3 15.5z"
          fill={rgbToCss(note.color)}
          stroke="rgb(0 0 0 / 70%)"
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
        <path d="M7 8h10M7 12h7" stroke="rgb(0 0 0 / 55%)" strokeWidth="1.25" />
      </svg>
    </button>
  );
}

export interface AnnotationLayerProps {
  readonly annotations: readonly Annotation[];
  readonly transform: ViewTransform;
  readonly width: number;
  readonly height: number;
  readonly handlers: AnnotationHandlers;
  /**
   * 'marks' draws highlights and underlines, under the text layer so text stays
   * selectable (PageView hit-tests clicks on them). 'notes' draws the note buttons, above
   * the text layer so they can be clicked and dragged.
   */
  readonly layer: 'marks' | 'notes';
}

/** Draws a page's highlights, underlines, or notes over the canvas. */
export function AnnotationLayer({
  annotations,
  transform,
  width,
  height,
  handlers,
  layer,
}: AnnotationLayerProps) {
  if (layer === 'notes') {
    return annotations.map((a) =>
      a.kind === 'note' ? (
        <NoteIcon
          key={a.id}
          note={a}
          transform={transform}
          selected={a.id === handlers.selectedId}
          handlers={handlers}
        />
      ) : null,
    );
  }
  const selected = annotations.find((a) => a.id === handlers.selectedId);
  const selectedBox = selected && selected.kind !== 'note' ? annotationRect(selected) : null;
  return (
    <>
      <svg
        className="phinpdf-annots"
        width={width}
        height={height}
        aria-hidden="true"
        focusable="false"
      >
        {annotations.map((a) => {
          if (a.kind === 'note') return null;
          const fill = rgbToCss(a.color);
          return (
            <g
              key={a.id}
              data-annotation-id={a.id}
              data-kind={a.kind}
              className={a.kind === 'highlight' ? 'phinpdf-highlight' : 'phinpdf-underline'}
            >
              {a.rects.map((r, i) => {
                const box =
                  a.kind === 'highlight'
                    ? pdfRectToView(r, transform)
                    : underlineRect(r, transform);
                return (
                  <rect
                    key={i}
                    x={box.left}
                    y={box.top}
                    width={box.width}
                    height={box.height}
                    fill={fill}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
      {selectedBox && (
        <svg className="phinpdf-selection" width={width} height={height} aria-hidden="true">
          {(() => {
            const box = pdfRectToView(selectedBox, transform);
            return (
              <rect
                x={box.left - 2}
                y={box.top - 2}
                width={box.width + 4}
                height={box.height + 4}
              />
            );
          })()}
        </svg>
      )}
    </>
  );
}
