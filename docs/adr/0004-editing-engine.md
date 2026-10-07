# ADR-0004: Editing Engine

- **Status:** Accepted (supersedes the pdf-lib-first plan in the original development plan)
- **Date:** 2026-10-07
- **Evidence:** [Spike 2](../spikes/phase0-spike-report.md#spike-2-edit-save-and-reopen)

## Context

The original plan picked pdf-lib for editing, with PDFium-WASM as a fallback. Spike 2
tested both, plus a maintained pdf-lib fork, against the 1.0 feature list.

## Decision

Use **PDFium compiled to WebAssembly** (`@embedpdf/pdfium`; MIT wrapper, Apache-2.0 PDFium)
as the **primary** engine for every write: annotations, forms, page operations,
redaction, metadata, and saving.

Keep **PDF.js** for rendering, the text layer, search, and accessibility (ADR-0007).

Do not use pdf-lib.

## Why

| Need | pdf-lib 1.17.1 | @cantoo/pdf-lib | PDFium-WASM |
|---|---|---|---|
| Maintained | No (2022) | Yes | Yes |
| Annotation API with appearances | No | No | Yes |
| Encrypted files | Refuses | Saves decrypted (silent security downgrade) | Keeps encryption |
| True redaction | No | No | Yes |
| Save 33 MB / 504 pages | 3.1 s | 8.3 s | 1.8 s |

Redaction and encrypted-file support are 1.0 requirements, and only PDFium does both.

## Rules for using PDFium

- Wrap it behind interfaces in `packages/core`. No PDFium calls in UI code.
- Run it in a Web Worker. Every `malloc` gets a matching `free`, and handles are closed in
  `finally` blocks. Unit tests check that the heap doesn't grow over 1,000 open/close cycles.
- Fill text fields by simulating typing (`FORM_SetFocusedAnnot`, `FORM_ReplaceSelection`).
  Setting the value directly leaves the field blank in Poppler-based viewers.
- Redact by exact character quads, never padded rectangles.

## Risks

- **Supply chain / bus factor:** `@embedpdf/pdfium` is maintained by a small team. Pin the
  version, check its hash, and keep a CI job that builds PDFium-WASM from upstream source
  so we can switch if needed.
- **Size:** adds about 2.1 MB (gzip) to the web app. Load it lazily, only when the user
  starts editing.
- **Two parsers:** PDF.js and PDFium both parse untrusted files, which doubles the attack
  surface. Both run in workers under the same CSP. Revisit after Phase 2 whether PDFium
  should render too.
