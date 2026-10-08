# Viewer Performance

Measured with [`scripts/perf-viewer.mjs`](../scripts/perf-viewer.mjs): the production build
in headless Chromium 141 (software rendering, 4 vCPU Linux container, 1280 x 900 window,
sidebar open, Automatic zoom = 125%). The script opens a file, then jumps to every page in
turn and waits for each one to be drawn with its text layer.

Memory is the summed RSS of all Chromium processes minus the app with no document open.
Summed RSS counts shared memory more than once, so it overstates real use.

## Phase 2 results (2026-10-08)

| File | Pages | First page | Avg per page | Peak memory | Main-thread tasks > 50 ms / > 100 ms (longest) |
|---|---|---|---|---|---|
| real-504p (34.7 MB, fonts repeated 36x) | 504 | **0.94 s** | 146 ms | **+623 MB** | 179 / 7 (174 ms) |
| synthetic-1000p (1.5 MB, text) | 300 of 1,000 | **0.84 s** | 80 ms | **+390 MB** | 22 / 1 (113 ms) |

Phase 0 spike for comparison (rendering only, no text layer or UI): real-504p +549 MB,
25 tasks over 50 ms, longest 252 ms.

### Against the budgets

| Budget | Status |
|---|---|
| First page under 1 s | ✅ Met, even on the 34.7 MB stress file |
| Smooth scrolling on 1,000 pages | ✅ Only nearby pages are rendered (2–3 in the DOM at any time) |
| Memory under 500 MB | ⚠️ Met on a normal long document (+390 MB); **over by about 120 MB** on the worst-case stress file |
| No main-thread stall over 100 ms | ⚠️ Rare: 7 of 504 pages on the stress file, 1 of 300 on the text file |

### What we learned

- **Memory plateaus instead of growing.** Renderer memory reaches about 630 MB by page 100
  and rises only about 80 MB over the next 400 pages. The JS heap stays near 10 MB, only
  5 fonts remain loaded, and live canvases hold under 3 million pixels. The rest is the
  PDF.js worker and the browser's allocator keeping freed memory.
- **Cache cleanup matters for long documents.** PDF.js keeps every loaded font until
  cleanup. The viewer now cleans up after every 10 pages of travel, once rendering is idle
  (`RenderDocument.cleanupWhenIdle`). That cut peak memory from +742 MB to +623 MB on the
  stress file, at the cost of re-loading fonts when returning to earlier pages.
- **The remaining stalls are page drawing on the main thread**, mostly font-heavy pages.

### Follow-ups

1. Draw pages off the main thread (OffscreenCanvas in a worker). This is the main fix for
   both the stalls and part of the memory, and is the larger change; schedule before the
   beta (Phase 7) rather than block Phase 2.
2. Re-measure on real hardware with GPU rasterization, and in Firefox and WebKitGTK
   (software rendering in CI overstates draw time).
3. Free the original file bytes held by the app once Phase 3 decides what saving needs.
