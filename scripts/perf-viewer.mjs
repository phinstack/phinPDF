#!/usr/bin/env node
// Measures the built viewer against the Phase 2 performance budgets (docs/DEVELOPMENT_PLAN.md):
// first page < 1 s, memory < 500 MB while scrolling, no long main-thread stalls.
// Usage: pnpm build && pnpm --filter @phinpdf/web preview &   then
//        node scripts/perf-viewer.mjs <file.pdf> [pagesToScroll]
// Set PW_CHROMIUM_PATH to use a pre-installed Chromium.
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';

const [file, pagesArg] = process.argv.slice(2);
const pagesToScroll = Number(pagesArg ?? 9999);
const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
);
const rssMb = () => {
  try {
    return Math.round(
      Number(execSync("ps -eo rss,comm | awk '/chrom/ {s+=$1} END {print s}'").toString()) / 1024,
    );
  } catch {
    return -1;
  }
};
const idlePage = await browser.newPage();
await idlePage.goto('http://localhost:4173/');
await idlePage.waitForTimeout(1000);
const idle = rssMb();
await idlePage.close();

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.addInitScript(() => {
  delete window.showOpenFilePicker;
  window.longTasks = [];
  new PerformanceObserver((l) =>
    l.getEntries().forEach((e) => window.longTasks.push(e.duration)),
  ).observe({
    type: 'longtask',
    buffered: true,
  });
});
await page.goto('http://localhost:4173/');
const chooser = page.waitForEvent('filechooser');
await page.getByRole('button', { name: 'Choose a PDF…' }).click();
const t0 = Date.now();
await (await chooser).setFiles(file);
await page.locator('.phinpdf-page[data-page="1"] canvas').waitFor();
await page.waitForFunction(() => {
  const c = document.querySelector('.phinpdf-page[data-page="1"] canvas');
  return c && c.width > 0;
});
const firstPageMs = Date.now() - t0;
await page.locator('.phinpdf-page[data-page="1"][data-text-ready="true"]').waitFor();
const total = Number((await page.getByText(/^\/ \d+$/).textContent()).replace(/\D/g, ''));
const n = Math.min(total, pagesToScroll);

let peak = 0;
const sampler = setInterval(() => {
  peak = Math.max(peak, rssMb());
}, 250);
const t1 = Date.now();
for (let i = 2; i <= n; i++) {
  await page.getByLabel('Page number').fill(String(i));
  await page.getByLabel('Page number').press('Enter');
  await page
    .locator(`.phinpdf-page[data-page="${i}"][data-text-ready="true"]`)
    .waitFor({ timeout: 30000 });
}
const scrollMs = Date.now() - t1;
clearInterval(sampler);
const longTasks = await page.evaluate(() => window.longTasks);
console.log(
  JSON.stringify(
    {
      file: file.split('/').pop(),
      pages: total,
      pagesVisited: n,
      firstPageMs,
      avgMsPerPage: Math.round(scrollMs / Math.max(1, n - 1)),
      peakMemoryAboveIdleMb: peak - idle,
      longTasksOver50ms: longTasks.length,
      longTasksOver100ms: longTasks.filter((d) => d > 100).length,
      longestTaskMs: Math.round(Math.max(0, ...longTasks)),
      renderedPagesAtEnd: await page.locator('.phinpdf-page').count(),
    },
    null,
    2,
  ),
);
await browser.close();
