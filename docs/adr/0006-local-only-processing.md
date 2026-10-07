# ADR-0006: Local-Only Processing

- **Status:** Accepted
- **Date:** 2026-10-07

## Context

PDFs often hold contracts, medical records, and financial data. Many online PDF tools
upload files to a server.

## Decision

phinPDF has **no backend**. All parsing, rendering, and editing happens on the user's
device. The web version is static files and a service worker.

- No document data, file names, or text leave the device.
- Documents can't trigger network requests: CSP `connect-src` is limited to the app's own
  origin (web) or IPC (desktop), verified in spikes 1 and 3. External links in a PDF open
  only after the user confirms.
- Optional crash reporting during beta is opt-in and must never include document contents.

## Consequences

- Smaller security surface: no server to breach and no data to store.
- No cloud features in 1.0 (sync, sharing, server-side OCR).
- Performance depends on the user's device, so the budgets in the plan are tested on
  modest hardware.
