# ADR-0002: TypeScript, React, and Vite

- **Status:** Accepted
- **Date:** 2026-10-07

## Context

phinPDF must run in a browser and as a desktop app from one codebase (ADR-0003). The
best PDF libraries for the web (PDF.js, PDFium-WASM) are used from JavaScript.

## Decision

- **TypeScript** in strict mode for all application code. Rust only in the thin Tauri
  shell (ADR-0003).
- **React** for the UI, **Vite** for builds and the dev server, **pnpm** workspaces for
  the monorepo.
- **Zustand** for app state, with all document edits going through a command/undo stack
  in `packages/core`.
- **Vitest** for unit and component tests, **Playwright** for end-to-end and visual tests.

## Alternatives considered

- **Svelte / SolidJS:** smaller bundles, but fewer contributors know them, and the bundle
  is dominated by PDF engines anyway (about 2.6 MB gzip, spike 2).
- **Plain JavaScript:** rejected. Coordinate math and PDF object handling are error-prone
  without types.
- **Native UI (Qt, GTK, WinUI):** rejected. It would need a separate web version.

## Consequences

- Everything in `core` and `renderer` must stay DOM-free so it can run in Web Workers and
  in Node-based tests.
- React re-renders must never touch page canvases directly; rendering is driven by the
  renderer package.
