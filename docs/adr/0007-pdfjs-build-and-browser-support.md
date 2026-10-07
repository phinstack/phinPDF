# ADR-0007: PDF.js Build and Browser Support

- **Status:** Accepted
- **Date:** 2026-10-07
- **Evidence:** [Spikes 1 and 3](../spikes/phase0-spike-report.md)

## Context

PDF.js 6 ships a "modern" build that uses very new JavaScript (for example
`Map.prototype.getOrInsertComputed`), and a "legacy" build with polyfills. In spike 1 the
modern build **crashed on Chromium 141**. Both builds worked on WebKitGTK 2.52.

PDF.js 6 also removed the `isEvalSupported` option and contains no `eval` or
`new Function`. The original plan's instruction to set `isEvalSupported: false` no longer
applies.

## Decision

1. Ship the **legacy build** of `pdfjs-dist`. The cost is about 36 KB extra (gzip) and no
   measurable speed difference.
2. Supported browsers for 1.0, each tested in CI:
   - Chrome and Edge: current and previous 2 major versions
   - Firefox: current and ESR
   - Safari: current (best effort)
   - WebKitGTK: 2.44 or newer (Linux desktop; confirm the minimum in Phase 5)
3. Security controls, replacing `isEvalSupported`:
   - CSP with no `unsafe-eval` (verified in spikes 1 and 3)
   - `enableXfa: false`
   - Never load `pdf.sandbox.mjs`, so PDF JavaScript is never run
   - Set `maxImageSize` to limit decompression bombs
4. Pin `pdfjs-dist` to an exact version and update it within 7 days of a security release.

## Consequences

- When PDF.js changes what the legacy build covers, CI on older engines will catch it.
- Revisit switching to the modern build once the minimum supported Chrome and WebKitGTK
  versions include the needed features.
