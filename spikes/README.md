# Phase 0 Spikes

Throwaway prototypes that test the tech stack before Phase 1. **Not production code.**
Results and decisions: [docs/spikes/phase0-spike-report.md](../docs/spikes/phase0-spike-report.md).

| Folder | Question |
|---|---|
| `01-render-perf/` | Can PDF.js render 500–1,000 page PDFs fast enough, under a strict CSP? |
| `02-edit-roundtrip/` | Which editing engine (pdf-lib, @cantoo/pdf-lib, PDFium-WASM) saves files other viewers read? |
| `03-tauri-ipc/` | Can a locked-down Tauri app open a PDF and hand it to PDF.js on Linux? |

Test PDFs are not committed. See the report for how to rebuild them.
