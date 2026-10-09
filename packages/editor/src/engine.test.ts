/**
 * Save → reopen round trips. Files are written by PDFium and read back by PDF.js (the
 * renderer) and by PDFium, so both engines must agree on what was saved.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { init, type WrappedPdfiumModule } from '@embedpdf/pdfium';
import {
  diffAnnotations,
  nextBaseline,
  type Annotation,
  type AnnotationChange,
  type Baseline,
  type MarkupAnnotation,
  type NoteAnnotation,
} from '@phinpdf/core';
import { OpenError, openDocument, type LoadedAnnotation } from '@phinpdf/renderer';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyChanges, SaveError } from './engine.ts';

const CORPUS = join(import.meta.dirname, '../../../test-corpus/files');
const read = (file: string) => new Uint8Array(readFileSync(join(CORPUS, file)));

let pdfium: WrappedPdfiumModule;

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const wasm = readFileSync(require.resolve('@embedpdf/pdfium/pdfium.wasm'));
  pdfium = await init({ wasmBinary: new Uint8Array(wasm).buffer });
  pdfium.PDFiumExt_Init();
});

async function reopen(bytes: Uint8Array, password?: string, page = 1): Promise<LoadedAnnotation[]> {
  const doc = await openDocument(bytes, password === undefined ? {} : { password });
  try {
    return await doc.getAnnotations(page);
  } finally {
    await doc.destroy();
  }
}

/** Subtype codes of every annotation on a page, as PDFium sees them. */
function pdfiumSubtypes(bytes: Uint8Array, password = '', pageIndex = 0): number[] {
  const p = pdfium;
  const ptr = p.pdfium.wasmExports.malloc(bytes.length);
  p.pdfium.HEAPU8.set(bytes, ptr);
  const doc = p.FPDF_LoadMemDocument(ptr, bytes.length, password);
  const page = p.FPDF_LoadPage(doc, pageIndex);
  const subtypes: number[] = [];
  for (let i = 0; i < p.FPDFPage_GetAnnotCount(page); i++) {
    const a = p.FPDFPage_GetAnnot(page, i);
    subtypes.push(p.FPDFAnnot_GetSubtype(a));
    p.FPDFPage_CloseAnnot(a);
  }
  p.FPDF_ClosePage(page);
  p.FPDF_CloseDocument(doc);
  p.pdfium.wasmExports.free(ptr);
  return subtypes;
}

const highlight: MarkupAnnotation = {
  id: 'phinpdf-h1',
  kind: 'highlight',
  pageIndex: 0,
  color: { r: 255, g: 235, b: 59 },
  contents: 'Important',
  author: 'Tester',
  modified: '2026-10-09T10:00:00.000Z',
  rects: [
    { x0: 72, y0: 700, x1: 300, y1: 714 },
    { x0: 72, y0: 684, x1: 210, y1: 698 },
  ],
};
const underline: MarkupAnnotation = {
  ...highlight,
  id: 'phinpdf-u1',
  kind: 'underline',
  color: { r: 229, g: 57, b: 53 },
  contents: '',
  rects: [{ x0: 72, y0: 600, x1: 250, y1: 614 }],
};
const note: NoteAnnotation = {
  id: 'phinpdf-n1',
  kind: 'note',
  pageIndex: 0,
  color: { r: 100, g: 181, b: 246 },
  contents: 'Ünïcode note ✓',
  author: '',
  modified: null,
  rect: { x0: 500, y0: 740, x1: 520, y1: 760 },
};

const create = (...annotations: Annotation[]): AnnotationChange[] =>
  annotations.map((annotation) => ({ op: 'create', annotation }));

const byId = (loaded: LoadedAnnotation[]) => new Map(loaded.map((l) => [l.annotation, l]));

describe('applyChanges', () => {
  it('creates highlights, underlines, and notes that PDF.js reads back', async () => {
    const src = read('normal/text-1page.pdf');
    const { bytes, keys } = applyChanges(pdfium, {
      bytes: src,
      changes: create(highlight, underline, note),
    });
    expect(keys.map(([id, key]) => [id, key.subtype, key.name])).toEqual([
      ['phinpdf-h1', 'Highlight', 'phinpdf-h1'],
      ['phinpdf-u1', 'Underline', 'phinpdf-u1'],
      ['phinpdf-n1', 'Text', 'phinpdf-n1'],
    ]);

    const loaded = (await reopen(bytes)).map((l) => l.annotation);
    expect(loaded.map((a) => a.kind)).toEqual(['highlight', 'underline', 'note']);
    const [h, u, n] = loaded as [MarkupAnnotation, MarkupAnnotation, NoteAnnotation];
    expect(h.color).toEqual(highlight.color);
    expect(h.contents).toBe('Important');
    expect(h.author).toBe('Tester');
    expect(h.modified).toBe('2026-10-09T10:00:00.000Z');
    expect(h.rects).toHaveLength(2);
    expect(h.rects[1]?.x1).toBeCloseTo(210, 3);
    expect(u.color).toEqual(underline.color);
    expect(n.contents).toBe('Ünïcode note ✓');
    expect(n.rect.x0).toBeCloseTo(500, 3);
    expect(n.color).toEqual(note.color);
  });

  it('saves incrementally, keeping the original bytes', () => {
    const src = read('normal/text-1page.pdf');
    const { bytes } = applyChanges(pdfium, { bytes: src, changes: create(note) });
    expect(bytes.length).toBeGreaterThan(src.length);
    expect(Buffer.from(bytes.subarray(0, src.length)).equals(Buffer.from(src))).toBe(true);
  });

  it('edits and deletes annotations made by other apps, leaving other types alone', async () => {
    const src = read('normal/annotations.pdf');
    const original = await reopen(src);
    expect(original.map((l) => l.annotation.kind)).toEqual(['note', 'highlight']);
    const [fileNote, fileHighlight] = original as [LoadedAnnotation, LoadedAnnotation];
    const edited = { ...fileNote.annotation, contents: 'Edited', color: note.color };
    const { bytes } = applyChanges(pdfium, {
      bytes: src,
      changes: [
        { op: 'update', key: fileNote.key, annotation: edited },
        { op: 'delete', key: fileHighlight.key, pageIndex: 0 },
      ],
    });
    const after = (await reopen(bytes)).map((l) => l.annotation);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ kind: 'note', contents: 'Edited', color: note.color });
    // Text, Square, Ink remain (PDFium subtype codes 1, 5, 15).
    expect(pdfiumSubtypes(bytes)).toEqual([1, 5, 15]);
  });

  it('finds its own annotations by name on the next save', async () => {
    const src = read('normal/text-1page.pdf');
    let baseline: Baseline = new Map();
    const first = applyChanges(pdfium, {
      bytes: src,
      changes: diffAnnotations(baseline, [highlight, note]),
    });
    baseline = nextBaseline(baseline, [highlight, note], new Map(first.keys));

    const moved: NoteAnnotation = { ...note, rect: { x0: 100, y0: 100, x1: 120, y1: 120 } };
    const second = applyChanges(pdfium, {
      bytes: first.bytes,
      changes: diffAnnotations(baseline, [moved]),
    });
    const after = (await reopen(second.bytes)).map((l) => l.annotation);
    expect(after).toHaveLength(1);
    expect((after[0] as NoteAnnotation).rect.x0).toBeCloseTo(100, 3);
    expect(byId(await reopen(second.bytes)).size).toBe(1);
  });

  it('recreates an edited annotation whose original is gone', async () => {
    const src = read('normal/text-1page.pdf');
    const { bytes, keys } = applyChanges(pdfium, {
      bytes: src,
      changes: [
        {
          op: 'update',
          key: { subtype: 'Text', rect: { x0: 1, y0: 1, x1: 2, y1: 2 }, name: 'missing' },
          annotation: note,
        },
        { op: 'delete', key: { subtype: 'Highlight', rect: note.rect, name: null }, pageIndex: 0 },
      ],
    });
    expect(keys).toHaveLength(1);
    expect((await reopen(bytes)).map((l) => l.annotation.kind)).toEqual(['note']);
  });

  it.each(['encrypted/aes-256.pdf', 'encrypted/aes-128.pdf', 'encrypted/rc4-40.pdf'])(
    'keeps %s encrypted with the same password',
    async (file) => {
      const { bytes } = applyChanges(pdfium, {
        bytes: read(file),
        password: 'user',
        changes: create(highlight),
      });
      await expect(openDocument(bytes)).rejects.toMatchObject({ code: 'password-required' });
      expect((await reopen(bytes, 'user')).map((l) => l.annotation.kind)).toEqual(['highlight']);
    },
  );

  it('rejects a missing or wrong password', () => {
    const save = (password?: string) =>
      applyChanges(pdfium, { bytes: read('encrypted/aes-256.pdf'), password, changes: [] });
    expect(() => save()).toThrow(SaveError);
    expect(() => save('nope')).toThrow(expect.objectContaining({ code: 'password' }));
  });

  it('rejects files PDFium cannot open and pages that do not exist', () => {
    expect(() =>
      applyChanges(pdfium, { bytes: new TextEncoder().encode('not a pdf'), changes: [] }),
    ).toThrow(expect.objectContaining({ code: 'open' }));
    expect(() =>
      applyChanges(pdfium, {
        bytes: read('normal/text-1page.pdf'),
        changes: create({ ...note, pageIndex: 5 }),
      }),
    ).toThrow(expect.objectContaining({ code: 'page' }));
  });

  it('writes to rotated and cropped pages in user space', async () => {
    for (const file of ['geometry/rotate-90.pdf', 'geometry/cropbox.pdf']) {
      const { bytes } = applyChanges(pdfium, { bytes: read(file), changes: create(note) });
      const [loaded] = await reopen(bytes);
      expect((loaded?.annotation as NoteAnnotation).rect.y1).toBeCloseTo(760, 3);
    }
  });

  it('saves damaged files that PDFium had to repair', async () => {
    const { bytes } = applyChanges(pdfium, {
      bytes: read('malformed/wrong-xref-offsets.pdf'),
      changes: create(note),
    });
    expect((await reopen(bytes)).map((l) => l.annotation.kind)).toEqual(['note']);
  });

  it('does not leak WebAssembly memory over many saves', () => {
    const src = read('normal/text-1page.pdf');
    const run = () => applyChanges(pdfium, { bytes: src, changes: create(highlight, note) });
    for (let i = 0; i < 50; i++) run();
    const before = pdfium.pdfium.HEAPU8.length;
    for (let i = 0; i < 1000; i++) run();
    expect(pdfium.pdfium.HEAPU8.length).toBe(before);
  });
});

it('reports open errors from the renderer for unencrypted output', async () => {
  await expect(openDocument(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(OpenError);
});
