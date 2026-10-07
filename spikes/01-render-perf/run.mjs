// Serves the spike folder and drives headless Chromium through the benchmark.
// Usage: node run.mjs <fixturesDir> [file.pdf ...]
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { join, extname, normalize } from 'node:path';

const [fixtures, ...files] = process.argv.slice(2);
const build = process.env.PDFJS_BUILD ?? 'legacy';
const root = new URL('..', import.meta.url).pathname; // spikes/
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.pdf': 'application/pdf' };

const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const file = p.startsWith('/fixtures/') ? join(fixtures, p.slice(10)) : join(root, p);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end(); }
}).listen(0);
const port = server.address().port;

// Total resident memory of all Chromium processes, in MB.
const chromeRssMb = () => {
  try {
    const out = execSync("ps -eo rss,comm | awk '/chrom/ {s+=$1} END {print s}'").toString();
    return Math.round(+out / 1024);
  } catch { return -1; }
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const results = {};
for (const f of files) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${port}/01-render-perf/index.html?build=${build}`);
  await page.waitForFunction(() => window.benchReady);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  let peak = 0;
  const sampler = setInterval(() => { peak = Math.max(peak, chromeRssMb()); }, 250);
  const r = await page.evaluate((u) => window.runBench(u), `/fixtures/${f}`);
  clearInterval(sampler);
  const { metrics } = await cdp.send('Performance.getMetrics');
  r.jsHeapMb = Math.round(metrics.find((m) => m.name === 'JSHeapUsedSize').value / 2 ** 20);
  r.peakChromeRssMb = peak;
  r.cspOrConsoleErrors = errors;
  results[f] = r;
  await page.close();
}
await browser.close();
server.close();
console.log(JSON.stringify(results, null, 2));
