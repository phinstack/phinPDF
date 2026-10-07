import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';

export const corpusFile = (file: string): string =>
  join(import.meta.dirname, '../../../test-corpus/files', file);

/**
 * Tracks problems a user would never see but we must catch: console errors, uncaught
 * exceptions, CSP violations, dialogs (for example from PDF JavaScript), and any request
 * that leaves the app's origin.
 */
export const test = base.extend<{ problems: string[] }>({
  problems: async ({ page, baseURL }, use) => {
    const problems: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(`console: ${m.text()}`);
    });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('dialog', (d) => {
      problems.push(`dialog: ${d.message()}`);
      void d.dismiss();
    });
    page.on('request', (r) => {
      const url = new URL(r.url());
      if (
        !['blob:', 'data:'].includes(url.protocol) &&
        url.origin !== new URL(baseURL ?? '').origin
      ) {
        problems.push(`external request: ${r.url()}`);
      }
    });
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => {
        console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`);
      });
    });
    await use(problems);
  },
});

/** Opens a corpus file through the app's "Open PDF…" button. */
export async function openViaButton(page: Page, file: string): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open PDF…' }).click();
  await (await chooser).setFiles(corpusFile(file));
}

/** Forces the <input type=file> fallback so all browsers take the same path. */
export async function disableFileSystemAccess(page: Page): Promise<void> {
  await page.addInitScript(() => {
    delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker;
  });
}

/** Counts non-white pixels in the page canvas, sampling every 8th pixel. */
export function inkedPixels(page: Page): Promise<number> {
  return page.getByRole('img').evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let n = 0;
    for (let i = 0; i < data.length; i += 32) if ((data[i] ?? 255) < 200) n++;
    return n;
  });
}

export const readCorpus = (file: string): Buffer => readFileSync(corpusFile(file));
export { expect };
