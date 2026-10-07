// Render benchmark: open a PDF, render page 1, then "scroll" through every page
// with a virtualized window of WINDOW live canvases (like the real viewer will).
// ?build=legacy selects the polyfilled build for older engines (e.g. WebKitGTK).
const build = new URLSearchParams(location.search).get('build') === 'legacy' ? 'legacy/build' : 'build';
const pdfjs = await import(`/node_modules/pdfjs-dist/${build}/pdf.mjs`);

pdfjs.GlobalWorkerOptions.workerSrc = `/node_modules/pdfjs-dist/${build}/pdf.worker.mjs`;

const SCALE = 1.5; // ~918 px wide for US Letter: a typical desktop viewer width
const WINDOW = 5;  // live canvases kept around the visible page

const longTasks = [];
new PerformanceObserver((l) => l.getEntries().forEach((e) => longTasks.push(e.duration)))
  .observe({ type: 'longtask', buffered: true });

const pct = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return +s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))].toFixed(1);
};

async function renderPage(doc, n) {
  const page = await doc.getPage(n);
  const vp = page.getViewport({ scale: SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  document.getElementById('viewport').append(canvas);
  await page.render({ canvas, viewport: vp }).promise;
  page.cleanup();
  return canvas;
}

window.runBench = async (url, { maxPages = Infinity } = {}) => {
  longTasks.length = 0;
  const t0 = performance.now();
  const task = pdfjs.getDocument({
    url,
    enableXfa: false,       // never render XFA forms
    stopAtErrors: false,    // render what we can from damaged files
    maxImageSize: 64 * 1024 * 1024, // guard against decompression bombs (pixels)
  });
  const doc = await task.promise;
  const openMs = performance.now() - t0;

  const live = [];
  const times = [];
  const n = Math.min(doc.numPages, maxPages);
  let firstPageMs = 0;
  for (let i = 1; i <= n; i++) {
    const s = performance.now();
    live.push(await renderPage(doc, i));
    times.push(performance.now() - s);
    if (i === 1) firstPageMs = performance.now() - t0;
    while (live.length > WINDOW) {
      const c = live.shift();
      c.width = c.height = 0; // release the backing store immediately
      c.remove();
    }
  }
  const scrollTotalMs = times.reduce((a, b) => a + b, 0);

  // Text extraction for every page: what full-text search needs.
  const ts = performance.now();
  let chars = 0;
  for (let i = 1; i <= n; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    chars += tc.items.reduce((a, it) => a + (it.str?.length ?? 0), 0);
  }
  const textAllMs = performance.now() - ts;

  live.forEach((c) => c.remove());
  await task.destroy();

  return {
    pages: n,
    openMs: +openMs.toFixed(0),
    firstPageMs: +firstPageMs.toFixed(0),
    renderP50: pct(times, 50),
    renderP95: pct(times, 95),
    renderMax: pct(times, 100),
    pagesPerSec: +(n / (scrollTotalMs / 1000)).toFixed(1),
    longTasksOver50ms: longTasks.length,
    longestTaskMs: longTasks.length ? Math.max(...longTasks).toFixed(0) : 0,
    textAllMs: +textAllMs.toFixed(0),
    textChars: chars,
  };
};

window.benchReady = true;
