import { readFileSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import {
  corpusFile,
  disableFileSystemAccess,
  expect,
  openViaButton,
  test,
  waitForPage,
} from './fixtures.ts';

test.beforeEach(async ({ page }) => {
  await disableFileSystemAccess(page);
  // Save through a download in every browser, so the saved bytes can be checked.
  await page.addInitScript(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
});

test.afterEach(({ problems }) => {
  expect(problems).toEqual([]);
});

const pageEl = (page: Page, n = 1): Locator =>
  page.locator(`.phinpdf-page[data-page="${String(n)}"]`);
const word = (page: Page, text: string, n = 1): Locator =>
  pageEl(page, n).locator('.textLayer span', { hasText: text }).first();

/** Selects a word by double-clicking it. */
async function selectWord(page: Page, text: string): Promise<void> {
  await word(page, text).dblclick();
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString().trim()))
    .toBeTruthy();
}

/**
 * Drags across part of a text span to select it. Without the text layer's endOfContent
 * cover, the selection could jump across many lines when the pointer crossed a gap.
 */
async function dragAcross(page: Page, target: Locator): Promise<void> {
  const box = await target.boundingBox();
  if (!box) throw new Error('no box');
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
}

/** Saves with Ctrl+S and returns the downloaded file. */
async function saveAndDownload(page: Page): Promise<{ name: string; buffer: Buffer }> {
  const download = page.waitForEvent('download');
  await page.keyboard.press('ControlOrMeta+s');
  const file = await download;
  const path = await file.path();
  return { name: file.suggestedFilename(), buffer: readFileSync(path) };
}

async function reopen(page: Page, file: { name: string; buffer: Buffer }): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await (
    await chooser
  ).setFiles({ name: file.name, mimeType: 'application/pdf', buffer: file.buffer });
}

const comments = (page: Page): Locator =>
  page.getByRole('list', { name: 'Comments' }).getByRole('button');

async function showComments(page: Page): Promise<void> {
  const tab = page.getByRole('tab', { name: /Comments/ });
  if (!(await tab.isVisible())) await page.getByRole('button', { name: 'Show sidebar' }).click();
  await page.getByRole('tab', { name: /Comments/ }).click();
}

test('highlights selected text from the quick menu, with undo and redo', async ({ page }) => {
  await page.goto('/');
  await openViaButton(page, 'normal/text-10pages.pdf');
  await waitForPage(page, 1);
  await selectWord(page, 'quick');
  await page
    .getByRole('toolbar', { name: 'Selected text' })
    .getByRole('button', { name: 'Highlight' })
    .click();

  const highlight = pageEl(page).locator('.phinpdf-highlight rect');
  await expect(highlight).toHaveCount(1);
  const box = await highlight.boundingBox();
  const wordBox = await word(page, 'quick').boundingBox();
  // The highlight covers the selected word and stays on its line.
  expect(
    box && wordBox && box.y < wordBox.y + wordBox.height && box.y + box.height > wordBox.y,
  ).toBe(true);
  await expect(page).toHaveTitle('• text-10pages.pdf – phinPDF');
  await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();

  await page.keyboard.press('ControlOrMeta+z');
  await expect(highlight).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  await page.keyboard.press('ControlOrMeta+y');
  await expect(highlight).toHaveCount(1);
});

test('the underline tool marks text as soon as it is selected', async ({ page }) => {
  await page.goto('/');
  await openViaButton(page, 'normal/text-10pages.pdf');
  await waitForPage(page, 1);
  await page.getByRole('button', { name: 'Underline', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Underline', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await dragAcross(page, word(page, 'quick'));
  await expect(pageEl(page).locator('.phinpdf-underline rect')).toHaveCount(1);
  // The tool stays on for the next selection, like a marker.
  await expect(page.getByRole('button', { name: 'Underline', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('places, edits, moves, and deletes a sticky note', async ({ page }) => {
  await page.goto('/');
  await openViaButton(page, 'normal/text-10pages.pdf');
  await waitForPage(page, 1);
  await page.getByRole('button', { name: 'Sticky note', exact: true }).click();
  const box = await pageEl(page).boundingBox();
  if (!box) throw new Error('no page box');
  await page.mouse.click(box.x + 200, box.y + 300);

  const comment = page.getByRole('textbox', { name: 'Comment' });
  await expect(comment).toBeFocused();
  await comment.fill('Check this paragraph');
  await page.getByRole('button', { name: 'Close' }).click();
  const note = page.getByRole('button', { name: 'Note: Check this paragraph' });
  await expect(note).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sticky note', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );

  // Drag it 80 px to the right.
  const before = await note.boundingBox();
  if (!before) throw new Error('no note box');
  await page.mouse.move(before.x + 12, before.y + 12);
  await page.mouse.down();
  await page.mouse.move(before.x + 92, before.y + 12, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await note.boundingBox())?.x).toBeCloseTo(before.x + 80, -1);

  // Arrow keys nudge a focused note.
  await note.focus();
  await page.keyboard.press('Shift+ArrowDown');
  await expect.poll(async () => (await note.boundingBox())?.y).toBeGreaterThan(before.y + 5);

  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(note).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(note).toBeVisible();
});

test('saves annotations into the PDF and reads them back', async ({ page }) => {
  await page.goto('/');
  await openViaButton(page, 'normal/text-10pages.pdf');
  await waitForPage(page, 1);
  await selectWord(page, 'quick');
  await page
    .getByRole('toolbar', { name: 'Selected text' })
    .getByRole('button', { name: 'Highlight' })
    .click();

  // Add a comment to the highlight by clicking it.
  const hl = pageEl(page).locator('.phinpdf-highlight rect').first();
  const hb = await hl.boundingBox();
  if (!hb) throw new Error('no highlight box');
  await page.mouse.click(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.getByRole('textbox', { name: 'Comment' }).fill('Highlighted with phinPDF');
  await page.getByRole('radio', { name: 'Green' }).click();
  await page.getByRole('button', { name: 'Close' }).click();

  await selectWord(page, 'brown');
  await page
    .getByRole('toolbar', { name: 'Selected text' })
    .getByRole('button', { name: 'Underline' })
    .click();

  const saved = await saveAndDownload(page);
  expect(saved.name).toBe('text-10pages.pdf');
  expect(saved.buffer.subarray(0, 5).toString()).toBe('%PDF-');
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  await expect(page).toHaveTitle('text-10pages.pdf – phinPDF');

  await reopen(page, saved);
  await waitForPage(page, 1);
  await showComments(page);
  await expect(comments(page)).toHaveCount(2);
  await expect(comments(page).first()).toContainText('Highlighted with phinPDF');
  await expect(pageEl(page).locator('.phinpdf-highlight rect')).toHaveCount(1);
  await expect(pageEl(page).locator('.phinpdf-underline rect')).toHaveCount(1);
  // Reopened annotations are editable and not counted as changes.
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
});

test('edits and deletes annotations made by other apps', async ({ page }) => {
  await page.goto('/');
  await openViaButton(page, 'normal/annotations.pdf');
  await waitForPage(page, 1);
  await showComments(page);
  await expect(comments(page)).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Note: A note' })).toBeVisible();

  await comments(page).filter({ hasText: 'Highlight' }).click();
  await expect(page.getByRole('heading', { name: /Highlight/ })).toBeVisible();
  await page.keyboard.press('Delete');
  await expect(comments(page)).toHaveCount(1);

  const saved = await saveAndDownload(page);
  await reopen(page, saved);
  await waitForPage(page, 1);
  await showComments(page);
  await expect(comments(page)).toHaveCount(1);
  await expect(comments(page).first()).toContainText('A note');
});

test('keeps a password-protected file protected after saving', async ({ page }) => {
  await page.goto('/');
  await openViaButton(page, 'encrypted/aes-256.pdf');
  await page.getByRole('textbox', { name: 'Password' }).fill('user');
  await page.getByRole('button', { name: 'Open' }).last().click();
  await waitForPage(page, 1);
  await page.getByRole('button', { name: 'Sticky note', exact: true }).click();
  const box = await pageEl(page).boundingBox();
  if (!box) throw new Error('no page box');
  await page.mouse.click(box.x + 100, box.y + 100);
  await page.getByRole('textbox', { name: 'Comment' }).fill('Secret note');
  await page.getByRole('button', { name: 'Close' }).click();

  const saved = await saveAndDownload(page);
  await reopen(page, saved);
  await expect(page.getByRole('heading', { name: 'This PDF is password-protected' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Password' }).fill('user');
  await page.getByRole('button', { name: 'Open' }).last().click();
  await waitForPage(page, 1);
  await expect(page.getByRole('button', { name: 'Note: Secret note' })).toBeVisible();
});

test('asks before discarding unsaved changes', async ({ page }) => {
  await page.goto('/');
  await openViaButton(page, 'normal/text-10pages.pdf');
  await waitForPage(page, 1);
  await selectWord(page, 'quick');
  await page
    .getByRole('toolbar', { name: 'Selected text' })
    .getByRole('button', { name: 'Highlight' })
    .click();

  await page.getByRole('button', { name: 'Open', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Save changes?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(pageEl(page).locator('.phinpdf-highlight rect')).toHaveCount(1);

  await page.getByRole('button', { name: 'Open', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: "Don't save" }).click();
  await (await chooser).setFiles(corpusFile('normal/text-1page.pdf'));
  await waitForPage(page, 1);
  await expect(page).toHaveTitle('text-1page.pdf – phinPDF');
});
