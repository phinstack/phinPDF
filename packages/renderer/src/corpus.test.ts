/**
 * Runs every file in the test corpus through the renderer and checks the outcome against
 * test-corpus/manifest.json. Also guards the corpus itself against silent changes.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OpenError } from './errors.ts';
import { openDocument } from './renderer.ts';

interface Entry {
  file: string;
  sha256: string;
  expect: { opens: true | string; pages?: number; password?: string };
}

const CORPUS = join(import.meta.dirname, '../../../test-corpus');
const manifest = JSON.parse(readFileSync(join(CORPUS, 'manifest.json'), 'utf8')) as Entry[];
const read = (file: string): Uint8Array =>
  new Uint8Array(readFileSync(join(CORPUS, 'files', file)));

async function openOutcome(bytes: Uint8Array, password?: string) {
  try {
    const doc = await openDocument(bytes, password === undefined ? {} : { password });
    // Touch every page so loops or crashes in the page tree surface here.
    const sizes = [];
    for (let n = 1; n <= Math.min(doc.numPages, 50); n++) {
      sizes.push(await doc.getPageSize(n).catch(() => null));
    }
    const pages = doc.numPages;
    await doc.destroy();
    return { opens: true as const, pages, sizes };
  } catch (error) {
    if (error instanceof OpenError) return { opens: error.code };
    throw error;
  }
}

describe('test corpus', () => {
  it('has at least 50 files', () => {
    expect(manifest.length).toBeGreaterThanOrEqual(50);
  });

  describe.each(manifest)('$file', (entry) => {
    it('matches its recorded SHA-256', () => {
      expect(createHash('sha256').update(read(entry.file)).digest('hex')).toBe(entry.sha256);
    });

    it('opens with the expected outcome', { timeout: 20_000 }, async () => {
      const result = await openOutcome(read(entry.file));
      expect(result.opens).toBe(entry.expect.opens);
      if (entry.expect.opens === true) expect(result).toHaveProperty('pages', entry.expect.pages);
    });

    if (entry.expect.password !== undefined) {
      const password = entry.expect.password;
      it('opens with its password and rejects a wrong one', async () => {
        const ok = await openOutcome(read(entry.file), password);
        expect(ok).toHaveProperty('pages', entry.expect.pages);
        const wrong = await openOutcome(read(entry.file), 'wrong-password');
        expect(wrong.opens).toBe('password-incorrect');
      });
    }
  });
});
