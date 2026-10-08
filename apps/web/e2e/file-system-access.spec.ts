import { expect, readCorpus, test, waitForPage } from './fixtures.ts';

// Chromium-based browsers (Chrome, Edge) use the File System Access API instead of an
// <input type=file>. Playwright can't drive that picker, so stub it with a corpus file.
test('opens through showOpenFilePicker in Chromium', async ({ page, browserName, problems }) => {
  test.skip(browserName !== 'chromium', 'File System Access API is Chromium-only');
  const bytes = [...readCorpus('normal/outline.pdf')];
  await page.addInitScript((data: number[]) => {
    Object.assign(window, {
      showOpenFilePicker: () =>
        Promise.resolve([
          {
            name: 'outline.pdf',
            getFile: () =>
              Promise.resolve(
                new File([new Uint8Array(data)], 'outline.pdf', { type: 'application/pdf' }),
              ),
          },
        ]),
    });
  }, bytes);
  await page.goto('/');
  await page.getByRole('button', { name: 'Choose a PDF…' }).click();
  await waitForPage(page, 1);
  await expect(page.getByRole('region', { name: 'outline.pdf, 3 pages' })).toBeVisible();
  expect(problems).toEqual([]);
});

test('treats a cancelled showOpenFilePicker as no-op', async ({ page, browserName, problems }) => {
  test.skip(browserName !== 'chromium', 'File System Access API is Chromium-only');
  await page.addInitScript(() => {
    Object.assign(window, {
      showOpenFilePicker: () => Promise.reject(new DOMException('cancelled', 'AbortError')),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Choose a PDF…' }).click();
  await expect(page.getByRole('status')).toHaveText('No document open.');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(problems).toEqual([]);
});
