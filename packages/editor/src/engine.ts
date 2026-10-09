import {
  annotationRect,
  rectToQuad,
  SUBTYPE_OF,
  toPdfDate,
  type Annotation,
  type AnnotationChange,
  type AnnotationSubtype,
  type FileKey,
  type PdfRect,
} from '@phinpdf/core';
import type { WrappedPdfiumModule } from '@embedpdf/pdfium';

/** What the editor needs to save a document. */
export interface SaveRequest {
  readonly bytes: Uint8Array;
  readonly password?: string | undefined;
  readonly changes: readonly AnnotationChange[];
}

export interface SaveResult {
  readonly bytes: Uint8Array;
  /** Where each created or updated annotation now is in the file, by annotation id. */
  readonly keys: readonly (readonly [string, FileKey])[];
}

export type SaveErrorCode = 'open' | 'password' | 'page' | 'write';

export class SaveError extends Error {
  constructor(
    readonly code: SaveErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SaveError';
  }
}

// PDFium constants (fpdfview.h, fpdf_annot.h, fpdf_save.h).
const FPDF_ERR_PASSWORD = 4;
const FPDF_INCREMENTAL = 1;
const FPDF_NO_INCREMENTAL = 2;
const FPDFANNOT_COLORTYPE_COLOR = 0;
const FLAG_PRINT = 4;
const FLAG_NOZOOM = 8;
const FLAG_NOROTATE = 16;
/** FXDIB blend mode used for highlight appearances, as Acrobat does. */
const BLEND_MULTIPLY = 1;
/** EmbedPDF's icon enum: 0 is /Comment (Acrobat's default note icon). */
const ICON_COMMENT = 0;

const SUBTYPE_CODE: Readonly<Record<AnnotationSubtype, number>> = {
  Text: 1,
  Highlight: 9,
  Underline: 10,
};

/** Two /Rect values within this many points are treated as the same annotation. */
const RECT_TOLERANCE = 0.05;

type Pdfium = WrappedPdfiumModule;

/** Heap helpers that free everything they allocate. */
class Heap {
  readonly #p: Pdfium;
  readonly #owned: number[] = [];

  constructor(p: Pdfium) {
    this.#p = p;
  }

  alloc(bytes: number): number {
    const ptr = this.#p.pdfium.wasmExports.malloc(bytes);
    if (!ptr) throw new SaveError('write', 'Out of memory');
    this.#owned.push(ptr);
    return ptr;
  }

  bytes(data: Uint8Array): number {
    const ptr = this.alloc(data.length);
    this.#p.pdfium.HEAPU8.set(data, ptr);
    return ptr;
  }

  floats(values: readonly number[]): number {
    const ptr = this.alloc(values.length * 4);
    this.#p.pdfium.HEAPF32.set(values, ptr >> 2);
    return ptr;
  }

  /** A NUL-terminated UTF-16LE string (FPDF_WIDESTRING). */
  wide(text: string): number {
    const size = (text.length + 1) * 2;
    const ptr = this.alloc(size);
    this.#p.pdfium.stringToUTF16(text, ptr, size);
    return ptr;
  }

  readFloats(ptr: number, count: number): number[] {
    return Array.from(this.#p.pdfium.HEAPF32.subarray(ptr >> 2, (ptr >> 2) + count));
  }

  freeAll(): void {
    for (const ptr of this.#owned.splice(0)) this.#p.pdfium.wasmExports.free(ptr);
  }
}

function readString(p: Pdfium, heap: Heap, annot: number, key: string): string {
  const length = p.FPDFAnnot_GetStringValue(annot, key, 0, 0);
  if (length <= 2) return '';
  const ptr = heap.alloc(length);
  p.FPDFAnnot_GetStringValue(annot, key, ptr, length);
  return p.pdfium.UTF16ToString(ptr);
}

function setString(p: Pdfium, heap: Heap, annot: number, key: string, value: string): void {
  p.FPDFAnnot_SetStringValue(annot, key, heap.wide(value));
}

function readRect(p: Pdfium, heap: Heap, annot: number): PdfRect | null {
  const ptr = heap.alloc(16);
  if (!p.FPDFAnnot_GetRect(annot, ptr)) return null;
  const [left, top, right, bottom] = heap.readFloats(ptr, 4) as [number, number, number, number];
  return {
    x0: Math.min(left, right),
    y0: Math.min(top, bottom),
    x1: Math.max(left, right),
    y1: Math.max(top, bottom),
  };
}

/** FS_RECTF is left, top, right, bottom. */
function rectFloats(r: PdfRect): number[] {
  return [r.x0, r.y1, r.x1, r.y0];
}

/**
 * Notes match on their top-left corner only: PDF.js resizes a note without an appearance
 * stream to its icon size but keeps that corner.
 */
function nearlySameRect(a: PdfRect, b: PdfRect, subtype: AnnotationSubtype): boolean {
  if (subtype === 'Text') {
    return Math.abs(a.x0 - b.x0) <= RECT_TOLERANCE && Math.abs(a.y1 - b.y1) <= RECT_TOLERANCE;
  }
  return (
    Math.abs(a.x0 - b.x0) <= RECT_TOLERANCE &&
    Math.abs(a.y0 - b.y0) <= RECT_TOLERANCE &&
    Math.abs(a.x1 - b.x1) <= RECT_TOLERANCE &&
    Math.abs(a.y1 - b.y1) <= RECT_TOLERANCE
  );
}

/** One open page and the annotations already matched on it. */
class PageEdit {
  readonly #p: Pdfium;
  readonly #heap: Heap;
  readonly page: number;
  readonly #claimed = new Set<number>();
  readonly #handles: number[] = [];

  constructor(p: Pdfium, heap: Heap, page: number) {
    this.#p = p;
    this.#heap = heap;
    this.page = page;
  }

  #track(annot: number): number {
    this.#handles.push(annot);
    return annot;
  }

  /** Finds the file annotation for `key` that no earlier change has claimed, or 0. */
  find(key: FileKey): number {
    const p = this.#p;
    const subtype = SUBTYPE_CODE[key.subtype];
    if (key.name) {
      const byName = p.EPDFPage_GetAnnotByName(this.page, this.#heap.wide(key.name));
      if (byName) {
        const index = p.FPDFPage_GetAnnotIndex(this.page, byName);
        if (p.FPDFAnnot_GetSubtype(byName) === subtype && !this.#claimed.has(index)) {
          this.#claimed.add(index);
          return this.#track(byName);
        }
        p.FPDFPage_CloseAnnot(byName);
      }
    }
    const count = p.FPDFPage_GetAnnotCount(this.page);
    for (let i = 0; i < count; i++) {
      if (this.#claimed.has(i)) continue;
      const annot = p.FPDFPage_GetAnnot(this.page, i);
      if (!annot) continue;
      const rect = p.FPDFAnnot_GetSubtype(annot) === subtype && readRect(p, this.#heap, annot);
      if (rect && nearlySameRect(rect, key.rect, key.subtype)) {
        this.#claimed.add(i);
        return this.#track(annot);
      }
      p.FPDFPage_CloseAnnot(annot);
    }
    return 0;
  }

  create(subtype: AnnotationSubtype): number {
    const annot = this.#p.FPDFPage_CreateAnnot(this.page, SUBTYPE_CODE[subtype]);
    if (!annot) throw new SaveError('write', `Could not create a ${subtype} annotation`);
    return this.#track(annot);
  }

  /** Removes an annotation and its pop-up, if it has one. */
  remove(annot: number): void {
    const p = this.#p;
    const popup = p.FPDFAnnot_GetLinkedAnnot(annot, 'Popup');
    const targets = [annot];
    if (popup) targets.push(this.#track(popup));
    const indices = targets
      .map((a) => p.FPDFPage_GetAnnotIndex(this.page, a))
      .filter((i) => i >= 0)
      .toSorted((a, b) => b - a);
    for (const index of indices) p.FPDFPage_RemoveAnnot(this.page, index);
  }

  close(): void {
    for (const annot of this.#handles.splice(0)) this.#p.FPDFPage_CloseAnnot(annot);
    this.#p.FPDF_ClosePage(this.page);
  }
}

/** Writes an annotation's properties. Geometry of existing markup is never rewritten. */
function writeAnnotation(
  p: Pdfium,
  heap: Heap,
  annot: number,
  a: Annotation,
  isNew: boolean,
): string {
  const { r, g, b } = a.color;
  p.FPDFAnnot_SetColor(annot, FPDFANNOT_COLORTYPE_COLOR, r, g, b, 255);
  if (a.contents || (!isNew && p.FPDFAnnot_HasKey(annot, 'Contents'))) {
    setString(p, heap, annot, 'Contents', a.contents);
  }
  if (a.author) setString(p, heap, annot, 'T', a.author);
  if (a.modified) {
    const date = toPdfDate(a.modified);
    if (date) setString(p, heap, annot, 'M', date);
  }
  let name = isNew ? '' : readString(p, heap, annot, 'NM');
  if (!name) {
    name = a.id;
    setString(p, heap, annot, 'NM', name);
  }

  if (a.kind === 'note') {
    p.FPDFAnnot_SetRect(annot, heap.floats(rectFloats(a.rect)));
    if (isNew) {
      p.FPDFAnnot_SetFlags(annot, FLAG_PRINT | FLAG_NOZOOM | FLAG_NOROTATE);
      p.EPDFAnnot_SetName(annot, ICON_COMMENT);
    }
    p.EPDFAnnot_GenerateAppearance(annot);
  } else {
    if (isNew) {
      p.FPDFAnnot_SetRect(annot, heap.floats(rectFloats(annotationRect(a))));
      for (const rect of a.rects) {
        p.FPDFAnnot_AppendAttachmentPoints(annot, heap.floats(rectToQuad(rect)));
      }
      p.FPDFAnnot_SetFlags(annot, FLAG_PRINT);
    }
    if (a.kind === 'highlight') p.EPDFAnnot_GenerateAppearanceWithBlend(annot, BLEND_MULTIPLY);
    else p.EPDFAnnot_GenerateAppearance(annot);
  }
  return name;
}

function pageOf(change: AnnotationChange): number {
  return change.op === 'delete' ? change.pageIndex : change.annotation.pageIndex;
}

function saveDocument(p: Pdfium, heap: Heap, doc: number, flags: number): Uint8Array {
  const writer = p.PDFiumExt_OpenFileWriter();
  try {
    if (!p.FPDF_SaveAsCopy(doc, writer, flags)) {
      throw new SaveError('write', 'PDFium could not write the document');
    }
    const size = p.PDFiumExt_GetFileWriterSize(writer);
    const ptr = heap.alloc(size);
    p.PDFiumExt_GetFileWriterData(writer, ptr, size);
    return p.pdfium.HEAPU8.slice(ptr, ptr + size);
  } finally {
    p.PDFiumExt_CloseFileWriter(writer);
  }
}

function openDocument(p: Pdfium, heap: Heap, bytes: Uint8Array, password: string): number {
  const doc = p.FPDF_LoadMemDocument(heap.bytes(bytes), bytes.length, password);
  if (!doc) {
    const error = p.FPDF_GetLastError();
    throw error === FPDF_ERR_PASSWORD
      ? new SaveError('password', 'The password is required to save this file')
      : new SaveError('open', `PDFium could not open the document (error ${String(error)})`);
  }
  return doc;
}

/** True if `bytes` opens with the same page count (guards incremental saves of damaged files). */
function verify(p: Pdfium, bytes: Uint8Array, password: string, pageCount: number): boolean {
  const heap = new Heap(p);
  try {
    const doc = p.FPDF_LoadMemDocument(heap.bytes(bytes), bytes.length, password);
    if (!doc) return false;
    const ok = p.FPDF_GetPageCount(doc) === pageCount;
    p.FPDF_CloseDocument(doc);
    return ok;
  } finally {
    heap.freeAll();
  }
}

/**
 * Applies annotation changes and returns the new file. Saves incrementally (the original
 * bytes are kept and the changes appended), which preserves encryption and anything
 * phinPDF doesn't understand. Falls back to a full rewrite if the incremental result
 * doesn't reopen cleanly, which can happen with damaged files PDFium had to repair.
 */
export function applyChanges(p: Pdfium, request: SaveRequest): SaveResult {
  const heap = new Heap(p);
  const password = request.password ?? '';
  let doc = 0;
  const pages = new Map<number, PageEdit>();
  try {
    doc = openDocument(p, heap, request.bytes, password);
    const pageCount = p.FPDF_GetPageCount(doc);
    const getPage = (index: number): PageEdit => {
      let page = pages.get(index);
      if (!page) {
        const handle = index >= 0 && index < pageCount ? p.FPDF_LoadPage(doc, index) : 0;
        if (!handle) throw new SaveError('page', `Page ${String(index + 1)} could not be loaded`);
        page = new PageEdit(p, heap, handle);
        pages.set(index, page);
      }
      return page;
    };

    // Match every existing annotation before changing anything, so removals and edits
    // can't disturb the matching of later changes.
    const matched = request.changes.map((change) =>
      change.op === 'create' ? 0 : getPage(pageOf(change)).find(change.key),
    );

    const keys: [string, FileKey][] = [];
    const removals: [PageEdit, number][] = [];
    request.changes.forEach((change, i) => {
      const page = getPage(pageOf(change));
      const existing = matched[i] ?? 0;
      if (change.op === 'delete') {
        if (existing) removals.push([page, existing]);
        return;
      }
      const a = change.annotation;
      const subtype = SUBTYPE_OF[a.kind];
      // An update whose original is gone (edited elsewhere) is written as a new annotation.
      const annot = existing || page.create(subtype);
      const name = writeAnnotation(p, heap, annot, a, !existing);
      keys.push([a.id, { subtype, rect: annotationRect(a), name }]);
    });
    for (const [page, annot] of removals) page.remove(annot);
    for (const page of pages.values()) page.close();
    pages.clear();

    let bytes = saveDocument(p, heap, doc, FPDF_INCREMENTAL);
    if (!verify(p, bytes, password, pageCount)) {
      bytes = saveDocument(p, heap, doc, FPDF_NO_INCREMENTAL);
    }
    return { bytes, keys };
  } finally {
    for (const page of pages.values()) page.close();
    if (doc) p.FPDF_CloseDocument(doc);
    heap.freeAll();
  }
}
