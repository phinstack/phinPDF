import type { Command } from './command-stack.ts';
import { unionRect, type PdfRect } from './geometry.ts';

/**
 * The annotations phinPDF can create and edit (1.0 scope). Every other annotation type in
 * a file is left untouched and drawn by the renderer as usual.
 */
export type AnnotationKind = 'highlight' | 'underline' | 'note';

/** PDF subtype names, as written in files. */
export type AnnotationSubtype = 'Highlight' | 'Underline' | 'Text';

export const SUBTYPE_OF: Readonly<Record<AnnotationKind, AnnotationSubtype>> = {
  highlight: 'Highlight',
  underline: 'Underline',
  note: 'Text',
};

/** An sRGB colour with 0–255 channels. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

interface AnnotationBase {
  /** Unique within the session. Also written as the annotation's /NM when saved. */
  readonly id: string;
  readonly pageIndex: number;
  readonly color: Rgb;
  /** The comment text (/Contents). */
  readonly contents: string;
  /** The author (/T). Empty when unknown. */
  readonly author: string;
  /** Last modification time as an ISO 8601 string, or null when the file has none. */
  readonly modified: string | null;
}

export interface MarkupAnnotation extends AnnotationBase {
  readonly kind: 'highlight' | 'underline';
  /** One rectangle per text line, in PDF user space. */
  readonly rects: readonly PdfRect[];
}

export interface NoteAnnotation extends AnnotationBase {
  readonly kind: 'note';
  /** The note icon's rectangle in PDF user space. */
  readonly rect: PdfRect;
}

export type Annotation = MarkupAnnotation | NoteAnnotation;

/** Width and height of a new note icon, in points. */
export const NOTE_SIZE = 20;

/** Colours offered in the toolbar, close to Acrobat Reader's defaults. */
export const ANNOTATION_COLORS: readonly { readonly name: string; readonly rgb: Rgb }[] = [
  { name: 'Yellow', rgb: { r: 255, g: 235, b: 59 } },
  { name: 'Green', rgb: { r: 118, g: 255, b: 122 } },
  { name: 'Blue', rgb: { r: 100, g: 181, b: 246 } },
  { name: 'Pink', rgb: { r: 255, g: 128, b: 171 } },
  { name: 'Red', rgb: { r: 229, g: 57, b: 53 } },
];

export const DEFAULT_COLOR: Readonly<Record<AnnotationKind, Rgb>> = {
  highlight: { r: 255, g: 235, b: 59 },
  underline: { r: 229, g: 57, b: 53 },
  note: { r: 255, g: 235, b: 59 },
};

/** The annotation's bounding rectangle (/Rect) in PDF user space. */
export function annotationRect(a: Annotation): PdfRect {
  if (a.kind === 'note') return a.rect;
  return unionRect(a.rects) ?? { x0: 0, y0: 0, x1: 0, y1: 0 };
}

export function rgbToCss({ r, g, b }: Rgb): string {
  return `rgb(${String(r)} ${String(g)} ${String(b)})`;
}

export function sameRgb(a: Rgb, b: Rgb): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b;
}

function sameRect(a: PdfRect, b: PdfRect): boolean {
  return a.x0 === b.x0 && a.y0 === b.y0 && a.x1 === b.x1 && a.y1 === b.y1;
}

/** True when two annotations would be saved identically. */
export function sameAnnotation(a: Annotation, b: Annotation): boolean {
  if (
    a.id !== b.id ||
    a.kind !== b.kind ||
    a.pageIndex !== b.pageIndex ||
    a.contents !== b.contents ||
    a.author !== b.author ||
    a.modified !== b.modified ||
    !sameRgb(a.color, b.color)
  ) {
    return false;
  }
  if (a.kind === 'note' && b.kind === 'note') return sameRect(a.rect, b.rect);
  if (a.kind !== 'note' && b.kind !== 'note') {
    return (
      a.rects.length === b.rects.length &&
      a.rects.every((r, i) => {
        const other = b.rects[i];
        return other !== undefined && sameRect(r, other);
      })
    );
  }
  return false;
}

/** A PDF date string (D:YYYYMMDDHHmmSSZ) for an ISO time. */
export function toPdfDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `D:${String(d.getUTCFullYear())}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

// ---------------------------------------------------------------------------------------
// Edit state and commands

export interface AnnotationState {
  readonly items: readonly Annotation[];
}

export const EMPTY_ANNOTATIONS: AnnotationState = { items: [] };

const LABELS: Readonly<Record<AnnotationKind, string>> = {
  highlight: 'Highlight',
  underline: 'Underline',
  note: 'Note',
};

export function addAnnotation(annotation: Annotation): Command<AnnotationState> {
  return {
    label: `Add ${LABELS[annotation.kind]}`,
    apply: (s) => ({ items: [...s.items.filter((a) => a.id !== annotation.id), annotation] }),
    revert: (s) => ({ items: s.items.filter((a) => a.id !== annotation.id) }),
  };
}

export function removeAnnotation(annotation: Annotation): Command<AnnotationState> {
  let index = -1;
  return {
    label: `Delete ${LABELS[annotation.kind]}`,
    apply: (s) => {
      index = s.items.findIndex((a) => a.id === annotation.id);
      return { items: s.items.filter((a) => a.id !== annotation.id) };
    },
    revert: (s) => {
      if (s.items.some((a) => a.id === annotation.id)) return s;
      const items = [...s.items];
      items.splice(index < 0 ? items.length : Math.min(index, items.length), 0, annotation);
      return { items };
    },
  };
}

/** Replaces `before` with `after` (same id). The label names what changed. */
export function updateAnnotation(
  before: Annotation,
  after: Annotation,
  label = `Edit ${LABELS[before.kind]}`,
): Command<AnnotationState> {
  if (before.id !== after.id) throw new Error('updateAnnotation: ids differ');
  const replace = (s: AnnotationState, from: Annotation, to: Annotation): AnnotationState => ({
    items: s.items.map((a) => (a.id === from.id ? to : a)),
  });
  return {
    label,
    apply: (s) => replace(s, before, after),
    revert: (s) => replace(s, after, before),
  };
}

// ---------------------------------------------------------------------------------------
// Saving: what changed since the file was opened or last saved

/**
 * How the saver finds an annotation that already exists in the file. Annotations phinPDF
 * wrote carry their id in /NM; others are matched by subtype and /Rect.
 */
export interface FileKey {
  readonly subtype: AnnotationSubtype;
  readonly rect: PdfRect;
  readonly name: string | null;
}

/** An annotation as it is in the saved file. */
export interface BaselineEntry {
  readonly annotation: Annotation;
  readonly key: FileKey;
}

export type Baseline = ReadonlyMap<string, BaselineEntry>;

export type AnnotationChange =
  | { readonly op: 'create'; readonly annotation: Annotation }
  | { readonly op: 'update'; readonly key: FileKey; readonly annotation: Annotation }
  | { readonly op: 'delete'; readonly key: FileKey; readonly pageIndex: number };

/** The edits that turn the saved file (`baseline`) into the current state. */
export function diffAnnotations(
  baseline: Baseline,
  current: readonly Annotation[],
): AnnotationChange[] {
  const changes: AnnotationChange[] = [];
  const seen = new Set<string>();
  for (const annotation of current) {
    seen.add(annotation.id);
    const saved = baseline.get(annotation.id);
    if (!saved) changes.push({ op: 'create', annotation });
    else if (!sameAnnotation(saved.annotation, annotation)) {
      changes.push({ op: 'update', key: saved.key, annotation });
    }
  }
  for (const [id, saved] of baseline) {
    if (!seen.has(id)) {
      changes.push({ op: 'delete', key: saved.key, pageIndex: saved.annotation.pageIndex });
    }
  }
  return changes;
}

/**
 * The baseline after a successful save: the current annotations, keyed by what the saver
 * reported for the ones it wrote, and by their previous keys otherwise.
 */
export function nextBaseline(
  previous: Baseline,
  current: readonly Annotation[],
  writtenKeys: ReadonlyMap<string, FileKey>,
): Baseline {
  const next = new Map<string, BaselineEntry>();
  for (const annotation of current) {
    const key = writtenKeys.get(annotation.id) ?? previous.get(annotation.id)?.key;
    if (key) next.set(annotation.id, { annotation, key });
  }
  return next;
}
