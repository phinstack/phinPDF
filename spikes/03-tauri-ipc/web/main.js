// Runs inside the Tauri webview (WebView2 on Windows, WebKitGTK on Linux).
const { invoke } = window.__TAURI__.core;
const result = { userAgent: navigator.userAgent };
const status = (s) => (document.getElementById('status').textContent = s);

async function loadPdfjs(build) {
  const lib = await import(`./vendor/pdfjs/${build}/pdf.mjs`);
  lib.GlobalWorkerOptions.workerSrc = `./vendor/pdfjs/${build}/pdf.worker.mjs`;
  return lib;
}

async function renderWith(build, bytes) {
  const t = performance.now();
  const pdfjs = await loadPdfjs(build);
  // PDF.js transfers the buffer to its worker, so give it a copy.
  const task = pdfjs.getDocument({ data: bytes.slice(), enableXfa: false });
  const doc = await task.promise;
  const page = await doc.getPage(1);
  const vp = page.getViewport({ scale: 1.5 });
  const canvas = document.getElementById('page');
  canvas.width = vp.width;
  canvas.height = vp.height;
  await page.render({ canvas, viewport: vp }).promise;
  // Check that something was actually drawn.
  const px = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let inked = 0;
  for (let i = 0; i < px.length; i += 4 * 16) if (px[i] < 128) inked++;
  const out = { ok: true, pages: doc.numPages, renderMs: Math.round(performance.now() - t), sampledDarkPixels: inked };
  await task.destroy();
  return out;
}

try {
  // 1. Binary IPC: fetch the file the user opened.
  let t = performance.now();
  const bytes = new Uint8Array(await invoke('opened_file'));
  result.ipc = { bytes: bytes.length, ms: Math.round(performance.now() - t) };

  // 2. Modern build first, then the polyfilled legacy build.
  for (const build of ['build', 'legacy/build']) {
    try { result[build] = await renderWith(build, bytes); }
    catch (e) { result[build] = { ok: false, error: String(e).slice(0, 200) }; }
  }

  // 3. Security lockdown checks: each of these must fail.
  const mustFail = async (name, fn) => {
    try { await fn(); result[name] = 'ALLOWED (bad)'; }
    catch (e) { result[name] = `blocked: ${String(e).slice(0, 100)}`; }
  };
  await mustFail('fsPluginRead', () => invoke('plugin:fs|read_file', { path: '/etc/passwd' }));
  await mustFail('shellPluginExec', () => invoke('plugin:shell|execute', { program: 'sh', args: ['-c', 'id'] }));
  await mustFail('networkFetch', () => fetch('https://example.com/'));
  await mustFail('evalCall', () => { eval('1+1'); });
  status('done');
} catch (e) {
  result.fatal = String(e);
}
await invoke('report', { result });
