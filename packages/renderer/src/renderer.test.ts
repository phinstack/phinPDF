import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { describeOpenError, OpenError, type OpenErrorCode } from './errors.ts';
import { looksLikePdf, openDocument, SECURE_DOCUMENT_OPTIONS } from './renderer.ts';

const corpus = (file: string): Uint8Array =>
  new Uint8Array(readFileSync(join(import.meta.dirname, '../../../test-corpus/files', file)));
const ascii = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('looksLikePdf', () => {
  it('finds the header at the start or within the first 1024 bytes', () => {
    expect(looksLikePdf(ascii('%PDF-1.7\n'))).toBe(true);
    expect(looksLikePdf(ascii(`${'x'.repeat(1000)}%PDF-1.4`))).toBe(true);
  });

  it('rejects files without a header in range', () => {
    expect(looksLikePdf(ascii(''))).toBe(false);
    expect(looksLikePdf(ascii('%PDF'))).toBe(false);
    expect(looksLikePdf(ascii('hello world'))).toBe(false);
    expect(looksLikePdf(ascii(`${'x'.repeat(1020)}%PDF-1.4`))).toBe(false);
  });
});

describe('SECURE_DOCUMENT_OPTIONS', () => {
  it('disables XFA and limits image size', () => {
    expect(SECURE_DOCUMENT_OPTIONS.enableXfa).toBe(false);
    expect(SECURE_DOCUMENT_OPTIONS.maxImageSize).toBeGreaterThan(0);
    expect(Object.isFrozen(SECURE_DOCUMENT_OPTIONS)).toBe(true);
  });
});

describe('openDocument', () => {
  it('rejects files over the size limit before parsing', async () => {
    await expect(openDocument(ascii('%PDF-1.7\n'), { maxBytes: 4 })).rejects.toMatchObject({
      code: 'too-large',
    });
  });

  it('does not modify the caller’s bytes', async () => {
    const bytes = corpus('normal/text-1page.pdf');
    const copy = bytes.slice();
    const doc = await openDocument(bytes);
    await doc.destroy();
    expect(bytes).toEqual(copy);
  });

  it('reports page sizes after rotation and scale', async () => {
    const doc = await openDocument(corpus('geometry/rotate-90.pdf'));
    expect(await doc.getPageSize(1)).toEqual({ width: 792, height: 612 });
    expect(await doc.getPageSize(1, 2)).toEqual({ width: 1584, height: 1224 });
    await doc.destroy();
  });

  it('rejects out-of-range page numbers', async () => {
    const doc = await openDocument(corpus('normal/text-1page.pdf'));
    await expect(doc.getPageSize(0)).rejects.toThrow(RangeError);
    await expect(doc.getPageSize(2)).rejects.toThrow(RangeError);
    await expect(doc.getPageSize(1.5)).rejects.toThrow(RangeError);
    await doc.destroy();
  });

  it('can be destroyed more than once and refuses use afterwards', async () => {
    const doc = await openDocument(corpus('normal/text-1page.pdf'));
    await doc.destroy();
    await doc.destroy();
    await expect(doc.getPageSize(1)).rejects.toThrow('destroyed');
  });

  it('stops rendering before starting when the signal is already aborted', async () => {
    const doc = await openDocument(corpus('normal/text-1page.pdf'));
    const canvas = {} as HTMLCanvasElement;
    await expect(doc.renderPage(1, canvas, { signal: AbortSignal.abort() })).rejects.toMatchObject({
      name: 'AbortError',
    });
    await doc.destroy();
  });
});

describe('describeOpenError', () => {
  it.each<OpenErrorCode>([
    'not-pdf',
    'too-large',
    'password-required',
    'password-incorrect',
    'invalid',
    'unknown',
  ])('has a plain-language message for %s', (code) => {
    expect(describeOpenError(code)).toMatch(/\.$/);
  });

  it('keeps the original error as the cause', () => {
    const cause = new Error('inner');
    expect(new OpenError('invalid', 'x', { cause }).cause).toBe(cause);
  });
});
