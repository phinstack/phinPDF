import {
  disableFileSystemAccess,
  expect,
  inkedPixels,
  openViaButton,
  readCorpus,
  test,
} from './fixtures.ts';

test.beforeEach(async ({ page }) => {
  await disableFileSystemAccess(page);
});

test.afterEach(({ problems }) => {
  expect(problems).toEqual([]);
});

test('loads with the empty state and a strict CSP', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('No document open.');
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(csp).not.toContain('unsafe-inline');
  expect(csp).not.toMatch(/'unsafe-eval'/);
});

test('opens a PDF and renders the first page', async ({ page }) => {
  await page.goto('/');
  await openViaButton(page, 'normal/text-10pages.pdf');
  await expect(page.getByRole('status')).toHaveText('text-10pages.pdf — 10 pages');
  await expect(page.getByRole('img', { name: 'Page 1 of 10' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveAttribute('data-rendered', 'true');
  expect(await inkedPixels(page)).toBeGreaterThan(100);
});

test('renders standard fonts using bundled font data', async ({ page }) => {
  await page.goto('/');
  await openViaButton(page, 'normal/standard-fonts.pdf');
  await expect(page.getByRole('status')).toHaveAttribute('data-rendered', 'true');
  expect(await inkedPixels(page)).toBeGreaterThan(100);
});

test('opens with Ctrl+O', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open PDF…' }).focus();
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Control+o');
  await (
    await chooser
  ).setFiles({
    name: 'rotated.pdf',
    mimeType: 'application/pdf',
    buffer: readCorpus('geometry/rotate-90.pdf'),
  });
  await expect(page.getByRole('status')).toHaveText('rotated.pdf — 1 page');
});

test.describe('errors', () => {
  for (const [file, message] of [
    ['malformed/not-a-pdf.pdf', 'This file is not a PDF.'],
    ['malformed/empty.pdf', 'This file is not a PDF.'],
    ['malformed/truncated.pdf', 'This PDF is damaged and could not be opened.'],
    ['encrypted/aes-256.pdf', 'This PDF is password-protected.'],
  ] as const) {
    test(`shows "${message}" for ${file}`, async ({ page }) => {
      await page.goto('/');
      await openViaButton(page, file);
      await expect(page.getByRole('alert')).toHaveText(message);
    });
  }
});

test.describe('hostile files open safely', () => {
  for (const file of [
    'malicious/js-openaction.pdf',
    'malicious/uri-openaction.pdf',
    'malicious/launch-action.pdf',
    'malicious/submitform-action.pdf',
    'malicious/image-bomb.pdf',
    'malicious/xfa-form.pdf',
  ]) {
    // The afterEach check fails the test on any dialog, external request, or error.
    test(file, async ({ page }) => {
      await page.goto('/');
      await openViaButton(page, file);
      await expect(page.getByRole('status')).toHaveAttribute('data-rendered', 'true');
    });
  }
});
