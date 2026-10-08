import {
  corpusFile,
  disableFileSystemAccess,
  expect,
  inkedPixels,
  openViaButton,
  readCorpus,
  test,
  waitForPage,
} from './fixtures.ts';

test.beforeEach(async ({ page }) => {
  await disableFileSystemAccess(page);
});

test.afterEach(({ problems }) => {
  expect(problems).toEqual([]);
});

const pageInput = (page: import('@playwright/test').Page) => page.getByLabel('Page number');
const scroller = (page: import('@playwright/test').Page) => page.locator('.phinpdf-scroller');

test('loads with the start screen and a strict CSP', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('No document open.');
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(csp).not.toContain('unsafe-inline');
  expect(csp).not.toMatch(/'unsafe-eval'/);
});

test('opens a PDF and renders the first page with selectable text', async ({ page }) => {
  await page.goto('/');
  await openViaButton(page, 'normal/text-10pages.pdf');
  await waitForPage(page, 1);
  await expect(page.getByRole('region', { name: 'text-10pages.pdf, 10 pages' })).toBeVisible();
  await expect(page.getByText('/ 10')).toBeVisible();
  expect(await inkedPixels(page, 1)).toBeGreaterThan(100);
  await expect(page.locator('.phinpdf-page[data-page="1"] .textLayer')).toContainText(
    'The quick brown fox',
  );
  await expect(page).toHaveTitle('text-10pages.pdf – phinPDF');
});

test('selects and copies text from the text layer', async ({ page }) => {
  await page.goto('/');
  await openViaButton(page, 'normal/text-1page.pdf');
  await waitForPage(page, 1);
  await page
    .locator('.phinpdf-page[data-page="1"] .textLayer span', { hasText: 'Page 1' })
    .first()
    .dblclick();
  const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');
  expect(['Page', 'Page 1', '1']).toContain(selected.trim());
});

test.describe('navigation', () => {
  test('page box, next and previous buttons, and Home/End', async ({ page }) => {
    await page.goto('/');
    await openViaButton(page, 'normal/text-10pages.pdf');
    await waitForPage(page, 1);
    await pageInput(page).fill('7');
    await pageInput(page).press('Enter');
    await waitForPage(page, 7);
    await expect(pageInput(page)).toHaveValue('7');
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(pageInput(page)).toHaveValue('8');
    await page.getByRole('button', { name: 'Previous page' }).click();
    await expect(pageInput(page)).toHaveValue('7');
    await scroller(page).focus();
    await page.keyboard.press('End');
    await expect(pageInput(page)).toHaveValue('10');
    await page.keyboard.press('Home');
    await expect(pageInput(page)).toHaveValue('1');
  });

  test('scrolling updates the page box and renders only nearby pages', async ({ page }) => {
    await page.goto('/');
    await openViaButton(page, 'normal/large-1000pages.pdf');
    await waitForPage(page, 1);
    await scroller(page).evaluate((el) => {
      el.scrollTop = el.scrollHeight / 2;
    });
    await expect(pageInput(page)).toHaveValue(/^(500|501)$/);
    await expect.poll(() => page.locator('.phinpdf-page').count()).toBeLessThanOrEqual(6);
    await pageInput(page).fill('999');
    await pageInput(page).press('Enter');
    await waitForPage(page, 999);
    expect(await inkedPixels(page, 999)).toBeGreaterThan(100);
  });

  test('thumbnails show the current page and jump on click', async ({ page }) => {
    await page.goto('/');
    await openViaButton(page, 'normal/text-10pages.pdf');
    await waitForPage(page, 1);
    const thumbs = page.getByLabel('Page thumbnails');
    await expect(thumbs.getByRole('button', { name: 'Page 1' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await thumbs.getByRole('button', { name: 'Page 3' }).click();
    await waitForPage(page, 3);
    await expect(pageInput(page)).toHaveValue('3');
    await expect(thumbs.getByRole('button', { name: 'Page 3' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('bookmarks jump to their pages', async ({ page }) => {
    await page.goto('/');
    await openViaButton(page, 'normal/outline.pdf');
    await waitForPage(page, 1);
    await page.getByRole('tab', { name: 'Bookmarks' }).click();
    await page.getByRole('button', { name: 'Section 2.1' }).click();
    await waitForPage(page, 3);
    await expect(pageInput(page)).toHaveValue('3');
  });

  test('the sidebar can be hidden', async ({ page }) => {
    await page.goto('/');
    await openViaButton(page, 'normal/text-1page.pdf');
    await waitForPage(page, 1);
    await page.getByRole('button', { name: 'Hide sidebar' }).click();
    const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
    await expect(sidebar).toHaveCount(0);
    await page.getByRole('button', { name: 'Show sidebar' }).click();
    await expect(sidebar).toBeVisible();
  });
});

test.describe('zoom and rotation', () => {
  const pageBox = (page: import('@playwright/test').Page) =>
    page.locator('.phinpdf-page[data-page="1"]').boundingBox();

  test('zoom buttons, presets, and shortcuts change the page size', async ({ page }) => {
    await page.goto('/');
    await openViaButton(page, 'normal/text-1page.pdf');
    await waitForPage(page, 1);
    await page.getByRole('combobox', { name: /Zoom level/ }).selectOption({ label: '100%' });
    // Letter at 100%: 8.5 in x 96 px = 816 CSS px.
    await expect.poll(async () => Math.round((await pageBox(page))?.width ?? 0)).toBe(816);
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect.poll(async () => Math.round((await pageBox(page))?.width ?? 0)).toBe(898);
    await page.keyboard.press('Control+1');
    await expect.poll(async () => Math.round((await pageBox(page))?.width ?? 0)).toBe(816);
    await page.keyboard.press('Control+-');
    await expect.poll(async () => Math.round((await pageBox(page))?.width ?? 0)).toBe(734);
    await waitForPage(page, 1);
    expect(await inkedPixels(page, 1)).toBeGreaterThan(100);
  });

  test('fit width and fit page use the window size', async ({ page }) => {
    await page.goto('/');
    await openViaButton(page, 'normal/text-1page.pdf');
    await waitForPage(page, 1);
    const viewport = await scroller(page).boundingBox();
    await page.keyboard.press('Control+2');
    await expect
      .poll(async () => (await pageBox(page))?.width ?? 0)
      .toBeGreaterThan((viewport?.width ?? 0) - 40);
    await page.keyboard.press('Control+0');
    await expect
      .poll(async () => (await pageBox(page))?.height ?? 9999)
      .toBeLessThanOrEqual(viewport?.height ?? 0);
  });

  test('rotation turns the page and keeps the text layer aligned', async ({ page }) => {
    await page.goto('/');
    await openViaButton(page, 'normal/text-1page.pdf');
    await waitForPage(page, 1);
    await page.getByRole('combobox', { name: /Zoom level/ }).selectOption({ label: '50%' });
    await expect.poll(async () => Math.round((await pageBox(page))?.width ?? 0)).toBe(408);
    await page.getByRole('button', { name: 'Rotate clockwise' }).click();
    await expect.poll(async () => Math.round((await pageBox(page))?.width ?? 0)).toBe(528);
    await waitForPage(page, 1);
    await expect(page.locator('.phinpdf-page[data-page="1"] .textLayer')).toHaveAttribute(
      'data-main-rotation',
      '90',
    );
  });
});

test.describe('search', () => {
  test('finds matches across pages and steps through them', async ({ page }) => {
    await page.goto('/');
    await openViaButton(page, 'normal/text-10pages.pdf');
    await waitForPage(page, 1);
    await page.keyboard.press('Control+f');
    const find = page.getByRole('searchbox', { name: 'Find in document' });
    await expect(find).toBeFocused();
    await find.fill('fox jumps');
    await expect(page.locator('.phinpdf-search-count')).toHaveText('1 of 400');
    await expect(page.locator('.phinpdf-page[data-page="1"] mark.current')).toHaveCount(1);
    await find.press('Enter');
    await expect(page.locator('.phinpdf-search-count')).toHaveText('2 of 400');
    await find.press('Shift+Enter');
    await find.press('Shift+Enter');
    await expect(page.locator('.phinpdf-search-count')).toHaveText('400 of 400');
    await waitForPage(page, 10);
    await expect(pageInput(page)).toHaveValue('10');
  });

  test('match case and whole words narrow the results', async ({ page }) => {
    await page.goto('/');
    await openViaButton(page, 'normal/text-1page.pdf');
    await waitForPage(page, 1);
    await page.keyboard.press('Control+f');
    const find = page.getByRole('searchbox', { name: 'Find in document' });
    const count = page.locator('.phinpdf-search-count');
    await find.fill('PAGE');
    await expect(count).toHaveText('1 of 1');
    await page.getByRole('checkbox', { name: 'Match case' }).check();
    await expect(count).toHaveText('No matches');
    await page.getByRole('checkbox', { name: 'Match case' }).uncheck();
    await find.fill('qui');
    await expect(count).toHaveText('1 of 40');
    await page.getByRole('checkbox', { name: 'Whole words' }).check();
    await expect(count).toHaveText('No matches');
  });

  test('Escape closes the find bar and removes highlights', async ({ page }) => {
    await page.goto('/');
    await openViaButton(page, 'normal/text-1page.pdf');
    await waitForPage(page, 1);
    await page.keyboard.press('Control+f');
    await page.getByRole('searchbox', { name: 'Find in document' }).fill('fox');
    await expect(page.locator('mark.phinpdf-hit').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('search')).toHaveCount(0);
    await expect(page.locator('mark.phinpdf-hit')).toHaveCount(0);
  });
});

test('prints every page through the system print dialog', async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => {
      (window as { printedPages?: number }).printedPages =
        document.querySelectorAll('#phinpdf-print img').length;
      window.dispatchEvent(new Event('afterprint'));
    };
  });
  await page.goto('/');
  await openViaButton(page, 'normal/outline.pdf');
  await waitForPage(page, 1);
  await page.getByRole('button', { name: 'Print' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as { printedPages?: number }).printedPages))
    .toBe(3);
  await expect(page.locator('#phinpdf-print')).toHaveCount(0);
});

test.describe('password-protected PDFs', () => {
  test('asks for the password, rejects a wrong one, opens with the right one', async ({ page }) => {
    await page.goto('/');
    await openViaButton(page, 'encrypted/aes-256.pdf');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('This PDF is password-protected')).toBeVisible();
    await dialog.getByLabel('Password').fill('nope');
    await dialog.getByRole('button', { name: 'Open' }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toHaveText(
      'The password is incorrect. Try again.',
    );
    await page.getByRole('dialog').getByLabel('Password').fill('user');
    await page.getByRole('dialog').getByRole('button', { name: 'Open' }).click();
    await waitForPage(page, 1);
    await expect(page.getByText('/ 2')).toBeVisible();
  });

  test('accepts a Unicode password', async ({ page }) => {
    await page.goto('/');
    await openViaButton(page, 'encrypted/aes-256-unicode-password.pdf');
    await page.getByRole('dialog').getByLabel('Password').fill('pässwörd');
    await page.getByRole('dialog').getByRole('button', { name: 'Open' }).click();
    await waitForPage(page, 1);
  });
});

test('opens a PDF dropped onto the window', async ({ page }) => {
  await page.goto('/');
  const bytes = [...readCorpus('normal/outline.pdf')];
  const dataTransfer = await page.evaluateHandle((data) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(data)], 'dropped.pdf', { type: 'application/pdf' }));
    return dt;
  }, bytes);
  await page.dispatchEvent('body', 'dragenter', { dataTransfer });
  await expect(page.locator('.drop-overlay')).toBeVisible();
  await page.dispatchEvent('body', 'drop', { dataTransfer });
  await waitForPage(page, 1);
  await expect(page.getByRole('region', { name: 'dropped.pdf, 3 pages' })).toBeVisible();
});

test.describe('errors', () => {
  for (const [file, message] of [
    ['malformed/not-a-pdf.pdf', 'This file is not a PDF.'],
    ['malformed/empty.pdf', 'This file is not a PDF.'],
    ['malformed/truncated.pdf', 'This PDF is damaged and could not be opened.'],
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
    'malicious/js-link.pdf',
    'malicious/uri-openaction.pdf',
    'malicious/launch-action.pdf',
    'malicious/submitform-action.pdf',
    'malicious/image-bomb.pdf',
    'malicious/xfa-form.pdf',
    'malformed/cyclic-page-tree.pdf',
  ]) {
    // The afterEach check fails the test on any dialog, external request, or error.
    test(file, async ({ page }) => {
      await page.goto('/');
      await openViaButton(page, file);
      await waitForPage(page, 1);
    });
  }
});

test('the corpus path helper points at real files', () => {
  expect(corpusFile('normal/text-1page.pdf')).toContain('test-corpus');
});
