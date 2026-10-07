# Contributing to phinPDF

Thanks for helping. phinPDF is Apache-2.0 licensed and every contribution is accepted under
the same license.

## Setup

Requirements:

- **Node 24** (see `.node-version`) and **pnpm 10** (`corepack enable` picks the right version)
- For the desktop app: **Rust** (stable) and the
  [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). On Ubuntu/Debian:
  `sudo apt install libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`
- For regenerating the test corpus only: `qpdf`

```sh
pnpm install
pnpm dev               # web app at http://localhost:5173
pnpm desktop:dev       # desktop app (Tauri) with hot reload
```

## Everyday commands

| Command | What it does |
|---|---|
| `pnpm check` | Everything CI's first job runs: lint, format, typecheck, tests with coverage, licenses |
| `pnpm test` / `pnpm test:watch` | Unit and integration tests (Vitest) |
| `pnpm e2e` | End-to-end tests in Chromium, Firefox, and WebKit (Playwright) |
| `pnpm lint` / `pnpm format` | ESLint / Prettier |
| `pnpm build` | Production web build in `apps/web/dist` |
| `pnpm desktop:build` | Desktop installers for your OS |
| `cargo test` (in `apps/desktop/src-tauri`) | Rust unit tests |

First run of `pnpm e2e`: install browsers with
`pnpm --filter @phinpdf/web exec playwright install --with-deps`.

## Repository layout

| Path | Contents |
|---|---|
| `apps/web` | React app (the UI for both web and desktop) |
| `apps/desktop` | Tauri shell: Rust commands, capabilities, installers |
| `packages/core` | Document model and undo/redo command stack. No DOM |
| `packages/renderer` | PDF.js wrapper with secure defaults |
| `packages/platform` | File open/save, links, printing for web and desktop (ADR-0005) |
| `packages/ui` | Shared React components |
| `test-corpus` | 60 generated test PDFs and their expected behaviour |
| `docs` | Development plan, ADRs, spike reports |

## Rules that CI enforces

- **Tests with every change.** Coverage must stay at or above 80% overall and 85% for
  `packages/core`. Every bug fix needs a regression test; if a PDF triggered it, add the
  file to the corpus.
- **Only permissive licenses** for dependencies (ADR-0001). `pnpm licenses:check` and
  `cargo deny check` fail on anything else.
- **No `eval`, no raw HTML injection, no Tauri imports outside `packages/platform`.**
  ESLint blocks these.
- **Pinned GitHub Actions.** Reference actions by full commit SHA with the version in a comment.

## Commits

- **Sign off every commit** (`git commit -s`). This certifies the
  [Developer Certificate of Origin](https://developercertificate.org/): you wrote the
  change or have the right to submit it under Apache-2.0. There is no CLA.
- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat: …`, `fix: …`,
  `docs: …`, `test: …`, `ci: …`, `chore: …`. A local hook checks this.

## Security issues

Do not open public issues for vulnerabilities. See [SECURITY.md](SECURITY.md).
