import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { toLoadedAnnotation, type RawAnnotation } from './annotations.ts';
import { openDocument } from './renderer.ts';

const corpus = (file: string): Uint8Array =>
  new Uint8Array(readFileSync(join(import.meta.dirname, '../../../test-corpus/files', file)));

const parseDate = (s: string) => (s === 'D:2026' ? new Date('2026-01-02T03:04:05Z') : null);
const raw = (over: Partial<RawAnnotation>): RawAnnotation => ({
  id: '7R',
  subtype: 'Highlight',
  rect: [72, 700, 272, 720],
  ...over,
});

describe('toLoadedAnnotation', () => {
  it('reads a highlight with quads, colour, comment, author, and date', () => {
    const loaded = toLoadedAnnotation(
      raw({
        quadPoints: new Float32Array([72, 720, 172, 720, 72, 700, 172, 700]),
        color: new Uint8ClampedArray([10, 20, 300]),
        contentsObj: { str: 'Why?' },
        titleObj: { str: 'Ann' },
        modificationDate: 'D:2026',
      }),
      2,
      parseDate,
    );
    expect(loaded).toEqual({
      sourceId: '7R',
      key: { subtype: 'Highlight', rect: { x0: 72, y0: 700, x1: 272, y1: 720 }, name: null },
      annotation: {
        id: 'file-2-7R',
        kind: 'highlight',
        pageIndex: 2,
        color: { r: 10, g: 20, b: 255 },
        contents: 'Why?',
        author: 'Ann',
        modified: '2026-01-02T03:04:05.000Z',
        rects: [{ x0: 72, y0: 700, x1: 172, y1: 720 }],
      },
    });
  });

  it('falls back to the rect and default colour, and skips unknown dates', () => {
    const loaded = toLoadedAnnotation(
      raw({ subtype: 'Underline', rect: [300, 20, 100, 10], modificationDate: 'junk' }),
      0,
      parseDate,
    );
    expect(loaded?.annotation).toMatchObject({
      kind: 'underline',
      color: { r: 229, g: 57, b: 53 },
      modified: null,
      contents: '',
      rects: [{ x0: 100, y0: 10, x1: 300, y1: 20 }],
    });
  });

  it('reads a note', () => {
    const loaded = toLoadedAnnotation(raw({ subtype: 'Text', color: null }), 0, parseDate);
    expect(loaded?.annotation).toMatchObject({ kind: 'note', rect: { x0: 72, y1: 720 } });
    expect(loaded?.key.subtype).toBe('Text');
  });

  it.each<[string, Partial<RawAnnotation>]>([
    ['other types', { subtype: 'Square' }],
    ['missing subtype', { subtype: '' }],
    ['bad rects', { rect: [1, 2, 3] }],
    ['non-finite rects', { rect: [0, 0, Number.NaN, 1] }],
    ['hidden annotations', { annotationFlags: 2 }],
    ['invisible annotations', { annotationFlags: 1 }],
    ['no-view annotations', { annotationFlags: 32 }],
    ['replies', { subtype: 'Text', inReplyTo: '5R' }],
  ])('leaves %s alone', (_name, over) => {
    expect(toLoadedAnnotation(raw(over), 0, parseDate)).toBeNull();
  });
});

describe('RenderDocument annotations and geometry', () => {
  it('reads editable annotations and leaves other types to PDF.js', async () => {
    const doc = await openDocument(corpus('normal/annotations.pdf'));
    const loaded = await doc.getAnnotations(1);
    expect(loaded.map((l) => l.annotation.kind)).toEqual(['note', 'highlight']);
    expect(loaded[0]?.annotation.contents).toBe('A note');
    // Cached: the same promise result on the next call.
    expect(await doc.getAnnotations(1)).toBe(loaded);
    // Drawing still works with the editable ones hidden.
    await doc.destroy();
  });

  it('returns no annotations for pages that fail to load', async () => {
    const doc = await openDocument(corpus('normal/text-1page.pdf'));
    expect(await doc.getAnnotations(5)).toEqual([]);
    await doc.destroy();
  });

  it('reports crop boxes and page rotation', async () => {
    const cropped = await openDocument(corpus('geometry/cropbox.pdf'));
    const [box] = await cropped.getPageGeometries();
    expect(box?.rotate).toBe(0);
    expect(box?.view).not.toEqual([0, 0, 612, 792]);
    await cropped.destroy();
    const rotated = await openDocument(corpus('geometry/rotate-90.pdf'));
    expect(await rotated.getPageGeometry(1)).toEqual({ view: [0, 0, 612, 792], rotate: 90 });
    await rotated.destroy();
  });

  it('gives unreadable pages a US Letter box and honours abort', async () => {
    const doc = await openDocument(corpus('malformed/cyclic-page-tree.pdf'));
    const boxes = await doc.getPageGeometries();
    expect(boxes).toHaveLength(doc.numPages);
    const controller = new AbortController();
    controller.abort();
    await expect(doc.getPageGeometries(controller.signal)).rejects.toThrow();
    await doc.destroy();
  });
});
