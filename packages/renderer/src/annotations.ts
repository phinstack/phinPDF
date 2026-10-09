import {
  DEFAULT_COLOR,
  pdfRect,
  quadsToRects,
  type Annotation,
  type AnnotationSubtype,
  type BaselineEntry,
  type Rgb,
} from '@phinpdf/core';

/** The fields of PDF.js annotation data that phinPDF reads. */
export interface RawAnnotation {
  readonly id: string;
  readonly subtype?: string;
  readonly annotationFlags?: number;
  readonly rect?: ArrayLike<number>;
  readonly quadPoints?: ArrayLike<number> | null;
  readonly color?: ArrayLike<number> | null;
  readonly contentsObj?: { readonly str?: string } | null;
  readonly titleObj?: { readonly str?: string } | null;
  readonly modificationDate?: string | null;
  readonly inReplyTo?: string | null;
}

/** An annotation read from the file, with what is needed to find it again when saving. */
export interface LoadedAnnotation extends BaselineEntry {
  /** PDF.js's id for it, used to stop PDF.js drawing it (phinPDF draws it instead). */
  readonly sourceId: string;
}

const MANAGED: Readonly<Record<string, AnnotationSubtype>> = {
  Highlight: 'Highlight',
  Underline: 'Underline',
  Text: 'Text',
};

// Annotation flags (PDF 32000-1, 12.5.3).
const INVISIBLE = 1;
const HIDDEN = 2;
const NOVIEW = 32;

function toRgb(color: ArrayLike<number> | null | undefined, fallback: Rgb): Rgb {
  if (color?.length !== 3) return fallback;
  const [r = 0, g = 0, b = 0] = Array.from(color, (c) => Math.max(0, Math.min(255, Math.round(c))));
  return { r, g, b };
}

/**
 * Converts PDF.js annotation data into phinPDF's model, or null for annotations phinPDF
 * leaves alone: other types, hidden ones, and replies (which belong to their parent).
 */
export function toLoadedAnnotation(
  raw: RawAnnotation,
  pageIndex: number,
  parseDate: (pdfDate: string) => Date | null,
): LoadedAnnotation | null {
  const subtype = raw.subtype ? MANAGED[raw.subtype] : undefined;
  if (!subtype || !raw.rect || raw.rect.length !== 4) return null;
  if ((raw.annotationFlags ?? 0) & (INVISIBLE | HIDDEN | NOVIEW)) return null;
  if (subtype === 'Text' && raw.inReplyTo) return null;
  const [ax, ay, bx, by] = Array.from(raw.rect) as [number, number, number, number];
  if (![ax, ay, bx, by].every(Number.isFinite)) return null;
  const rect = pdfRect(ax, ay, bx, by);

  const date = raw.modificationDate ? parseDate(raw.modificationDate) : null;
  const common = {
    id: `file-${String(pageIndex)}-${raw.id}`,
    pageIndex,
    contents: raw.contentsObj?.str ?? '',
    author: raw.titleObj?.str ?? '',
    modified: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
  };
  let annotation: Annotation;
  if (subtype === 'Text') {
    annotation = { ...common, kind: 'note', color: toRgb(raw.color, DEFAULT_COLOR.note), rect };
  } else {
    const kind = subtype === 'Highlight' ? 'highlight' : 'underline';
    const rects = raw.quadPoints ? quadsToRects(raw.quadPoints) : [];
    annotation = {
      ...common,
      kind,
      color: toRgb(raw.color, DEFAULT_COLOR[kind]),
      rects: rects.length > 0 ? rects : [rect],
    };
  }
  return { annotation, key: { subtype, rect, name: null }, sourceId: raw.id };
}
