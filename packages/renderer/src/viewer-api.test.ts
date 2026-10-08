import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cappedPixelRatio,
  MAX_CANVAS_PIXELS,
  normalizeRotation,
  openDocument,
} from './renderer.ts';

const corpus = (file: string): Uint8Array =>
  new Uint8Array(readFileSync(join(import.meta.dirname, '../../../test-corpus/files', file)));

describe('getPageSizes', () => {
  it('returns every page size, at scale, in page order', async () => {
    const doc = await openDocument(corpus('geometry/mixed-sizes.pdf'));
    expect(await doc.getPageSizes()).toEqual([
      { width: 612, height: 792 },
      { width: 595, height: 842 },
      { width: 792, height: 612 },
      { width: 612, height: 1008 },
    ]);
    const half = await doc.getPageSizes(0.5);
    expect(half[0]).toEqual({ width: 306, height: 396 });
    await doc.destroy();
  });

  it('applies extra rotation on top of the page rotation', async () => {
    const doc = await openDocument(corpus('geometry/rotate-90.pdf'));
    expect(await doc.getPageSizes(1, 0)).toEqual([{ width: 792, height: 612 }]);
    expect(await doc.getPageSizes(1, 90)).toEqual([{ width: 612, height: 792 }]);
    expect(await doc.getPageSizes(1, 270)).toEqual([{ width: 612, height: 792 }]);
    await doc.destroy();
  });

  it('handles 1,000 pages', { timeout: 30_000 }, async () => {
    const doc = await openDocument(corpus('normal/large-1000pages.pdf'));
    const sizes = await doc.getPageSizes();
    expect(sizes).toHaveLength(1000);
    expect(new Set(sizes.map((s) => `${String(s.width)}x${String(s.height)}`))).toEqual(
      new Set(['612x792']),
    );
    await doc.destroy();
  });

  it('gives pages that cannot be loaded a fallback size instead of failing', async () => {
    const doc = await openDocument(corpus('malformed/cyclic-page-tree.pdf'));
    const sizes = await doc.getPageSizes();
    expect(sizes).toHaveLength(doc.numPages);
    expect(sizes[1]).toEqual(sizes[0]);
    await doc.destroy();
  });

  it('stops when aborted', async () => {
    const doc = await openDocument(corpus('normal/large-1000pages.pdf'));
    await expect(doc.getPageSizes(1, 0, AbortSignal.abort())).rejects.toMatchObject({
      name: 'AbortError',
    });
    await doc.destroy();
  });
});

describe('getTextItems', () => {
  it('returns the text runs on a page', async () => {
    const doc = await openDocument(corpus('normal/text-1page.pdf'));
    const items = await doc.getTextItems(1);
    const text = items.map((i) => i.str).join(' ');
    expect(text).toContain('Page 1');
    expect(text).toContain('The quick brown fox');
    await doc.destroy();
  });

  it('returns nothing for a page without text', async () => {
    const doc = await openDocument(corpus('normal/vector-graphics.pdf'));
    expect(await doc.getTextItems(1)).toEqual([]);
    await doc.destroy();
  });
});

describe('getOutline', () => {
  it('resolves bookmark destinations to page indices', async () => {
    const doc = await openDocument(corpus('normal/outline.pdf'));
    expect(await doc.getOutline()).toEqual([
      { title: 'Chapter 1', pageIndex: 0, url: null, children: [] },
      {
        title: 'Chapter 2',
        pageIndex: 1,
        url: null,
        children: [{ title: 'Section 2.1', pageIndex: 2, url: null, children: [] }],
      },
    ]);
    await doc.destroy();
  });

  it('returns an empty list for a document without bookmarks', async () => {
    const doc = await openDocument(corpus('normal/text-1page.pdf'));
    expect(await doc.getOutline()).toEqual([]);
    await doc.destroy();
  });
});

describe('cleanupWhenIdle', () => {
  it('frees caches when idle and keeps the document usable', async () => {
    const doc = await openDocument(corpus('normal/standard-fonts.pdf'));
    await doc.getTextItems(1);
    doc.cleanupWhenIdle();
    expect((await doc.getTextItems(1)).length).toBeGreaterThan(0);
    await doc.destroy();
    expect(() => {
      doc.cleanupWhenIdle();
    }).not.toThrow();
  });

  it('waits for work in progress before cleaning up', async () => {
    const doc = await openDocument(corpus('normal/text-10pages.pdf'));
    const pending = doc.getTextItems(5);
    doc.cleanupWhenIdle();
    expect((await pending).length).toBeGreaterThan(0);
    expect((await doc.getTextItems(6)).length).toBeGreaterThan(0);
    await doc.destroy();
  });
});

describe('cappedPixelRatio', () => {
  it('keeps the ratio when the canvas is small enough', () => {
    expect(cappedPixelRatio(800, 1000, 2)).toBe(2);
  });

  it('lowers the ratio so the canvas stays within the limit', () => {
    const ratio = cappedPixelRatio(19_200, 19_200, 1);
    expect(19_200 * 19_200 * ratio * ratio).toBeCloseTo(MAX_CANVAS_PIXELS, -2);
  });

  it('handles empty canvases', () => {
    expect(cappedPixelRatio(0, 0, 2)).toBe(2);
  });
});

describe('normalizeRotation', () => {
  it.each([
    [0, 0],
    [90, 90],
    [360, 0],
    [450, 90],
    [-90, 270],
    [100, 90],
  ])('%i degrees -> %i', (input, expected) => {
    expect(normalizeRotation(input)).toBe(expected);
  });
});
