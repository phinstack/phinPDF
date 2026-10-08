# phinPDF Development Plan

## 1. Goals

Build a PDF viewer and editor that:

- Runs in a **web browser** (no install, works offline as a PWA) and as a **desktop app**
  (Windows and Linux) from **one shared codebase**. macOS users can use the web version.
  A native macOS app is deferred until after 1.0.
- **1.0 scope (decided 2026-10-07):** **view** (open, scroll, navigate, bookmarks,
  password-protected files), **zoom**, **search**, **print**, and **annotate** with
  highlight, underline, and sticky notes, saved as standard PDF annotations.
- After 1.0: forms, signatures, page organizing, merging and splitting, drawing, text
  boxes and images, passwords, and the rest of the editing features (see Phase 9).
  Redaction and compression won't be built.
- Processes documents **locally**. Files never leave the user's device unless the user
  chooses to share them. This is both a privacy feature and a smaller security surface.
- Treats every PDF as **untrusted input**.
- Is **fully open source** under Apache-2.0: free to use, modify, and redistribute,
  including commercially.

### Non-goals for v1

- Editing existing text in a PDF (changing or reflowing body text, like a word processor).
  This is very hard in PDF. **Confirmed** as post-1.0 work (see Phase 9).
- Cloud storage, accounts, real-time collaboration.
- OCR of scanned documents (candidate for v2).
- A native macOS desktop app (Apple Developer account and notarization are not funded for
  1.0). The web version works in Safari and other browsers on macOS.
- Mobile-native apps. The web build should still be usable on tablets.

---

## 2. Recommended Tech Stack

The key decision is **web technologies + a thin desktop shell**. That gives one codebase
for both targets.

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** (strict mode) | Runs natively in browsers, strong typing, best PDF library ecosystem for the web |
| UI framework | **React** + **Vite** | Mature, fast builds, large hiring/help pool |
| Rendering | **PDF.js** (Mozilla, Apache-2.0), legacy build (ADR-0007) | Battle-tested (powers Firefox's viewer), text layer, search, forms, accessibility |
| Editing / writing | **PDFium-WASM** (`@embedpdf/pdfium`: MIT wrapper, Apache-2.0 PDFium) for annotations, forms, page ops, passwords, and saving (ADR-0004) | Chrome's PDF engine. In the spikes it was the only option that kept encryption, had a real annotation API, and saved fastest. pdf-lib is unmaintained since 2022 |
| State | **Zustand** + a command/undo stack | Simple, testable, makes undo/redo easy |
| Desktop shell | **Tauri 2** (Rust) | ~10 MB installers vs ~150 MB for Electron, locked-down IPC, OS webview |
| Web deployment | Static hosting + **PWA** (service worker) | Offline use, "install" from the browser, no backend needed |
| Unit tests | **Vitest** + Testing Library | Fast, Vite-native |
| E2E / visual tests | **Playwright** | Cross-browser, screenshot diffing, can drive the Tauri webview |
| Desktop-side tests | `cargo test` | For the small Rust layer |
| Repo layout | **pnpm workspaces** monorepo | Shared packages between web and desktop |

> **Licensing (decided):** phinPDF is licensed under **Apache-2.0**, so anyone can use,
> modify, and redistribute it for free, including commercially. To keep that true, every
> dependency must be under a **permissive license** (MIT, BSD, Apache-2.0, ISC, Zlib, MPL-2.0
> for unmodified files, or similar). **Copyleft libraries (GPL, LGPL, AGPL) are not allowed.**
> That rules out MuPDF (AGPL), Ghostscript (AGPL), and Poppler (GPL). See
> [ADR-0001](adr/0001-license-and-dependency-policy.md).

### Proposed repository structure

```
phinPDF/
├── apps/
│   ├── web/              # React app, PWA build
│   └── desktop/          # Tauri shell (src-tauri/ Rust + wraps the web build)
├── packages/
│   ├── core/             # Document model, edit commands, undo/redo. No UI, no DOM
│   ├── renderer/         # PDF.js wrapper: page rendering, text layer, search
│   ├── ui/               # Shared React components (toolbar, thumbnails, panels)
│   └── platform/         # Platform abstraction: file open/save, print, clipboard
│                         #   web impl (File System Access API) / desktop impl (Tauri IPC)
├── test-corpus/          # Curated PDFs: normal, edge-case, malformed, malicious
├── docs/
│   ├── adr/              # Architecture Decision Records
│   └── security/         # Threat model, assessment reports
└── .github/workflows/    # CI
```

The **platform abstraction** is what makes "web or desktop" work. UI and core code call
`platform.openFile()` / `platform.saveFile()` and never touch Tauri or browser APIs directly.

---

## 3. Phased Roadmap

Estimates assume 1–2 developers. Each phase ends with an **exit gate** that must pass before
the next phase starts. Unit tests, security checks, and user feedback run in **every** phase,
not only in the dedicated phases.

| Phase | Name | Est. duration |
|---|---|---|
| 0 | Planning & Discovery | 2 weeks (done) |
| 1 | Foundation & Infrastructure | 1–2 weeks (done) |
| 2 | Viewer MVP | 3–4 weeks (built) |
| 3 | Annotations: highlight, underline, sticky notes | 2–3 weeks |
| 4 | Page & Content Editing | *after 1.0* |
| 5 | Desktop App | 2–3 weeks |
| 6 | Security Assessment & Hardening | 2–3 weeks (runs alongside 5) |
| 7 | User Testing (Alpha → Beta) | 4–6 weeks |
| 8 | Release 1.0 | 1–2 weeks |
| 9 | Post-release / v2 | Ongoing |

**Total to 1.0: roughly 3–4½ months from now** (Phases 2, 3, 5–8), after the 1.0 scope
was narrowed on 2026-10-07. Previously 5–7 months.

---

### Phase 0 — Planning & Discovery (2 weeks)

**Goal:** Know exactly what we're building, for whom, and how.

1. **Define users and use cases.** **Done (draft):** target users are **office workers**
   and **students**. See [user profiles](user-profiles.md), including draft feature
   priorities and user-research test tasks.
2. **Competitive review.** **Done:** primary competitor is **Adobe Acrobat Reader**. See
   the [competitive review](competitive-review.md) (expectations to match, shortcuts,
   where phinPDF can do better).
3. **Requirements.** Write a prioritized feature list using MoSCoW (Must / Should /
   Could / Won't). Each feature gets user stories with acceptance criteria.
4. **Architecture Decision Records (ADRs)** in `docs/adr/`:
   - ADR-0001: License and dependency policy (**decided:** Apache-2.0, permissive deps only)
   - ADR-0002: TypeScript + React + Vite (**done**)
   - ADR-0003: Tauri for desktop (**done**)
   - ADR-0004: Editing engine: PDFium-WASM (**done**, changed from pdf-lib after spike 2)
   - ADR-0005: Platform abstraction layer design (**done**)
   - ADR-0006: Local-only processing, no server (**done**)
   - ADR-0007: PDF.js legacy build and browser support (**done**)
5. **Technical spikes** (**done**, see the
   [spike report](spikes/phase0-spike-report.md)):
   - Render 504- and 1,000-page PDFs with PDF.js and measure memory and speed.
   - Add annotations, fill forms, and redact with pdf-lib, @cantoo/pdf-lib, and
     PDFium-WASM; check the output with qpdf, PDF.js, and Poppler.
   - Open a file through IPC in a locked-down Tauri app on Linux.
6. **Initial threat model.** First draft of the STRIDE analysis (see §5) so security
   shapes the architecture from the start.
7. **UX wireframes.** Low-fidelity layouts for the 1.0 screens: start screen, viewer,
   search, annotation tools, sticky note, password prompt, print. **Layout decided:** a top
   toolbar (like Acrobat Reader) with a left panel for thumbnails and bookmarks.
   **Draft clickable wireframes:** https://claude.ai/artifact/RiBmPCbjx9rkhJonbbY6NN
   (private to the project owner). **Approved 2026-10-07.**
8. **Test strategy and PDF corpus plan.** Decide which PDFs we will collect (see §4).

**Exit gate:** Requirements signed off, ADRs merged, spikes show the stack works,
wireframes reviewed by the project owner (the only tester for now; see §6).

**Status (2026-10-07): Phase 0 complete.** Scope, user profiles, competitive review, ADRs,
spikes, and wireframes are all signed off.

---

### Phase 1 — Foundation & Infrastructure (1–2 weeks)

1. Scaffold the pnpm monorepo with the structure above.
2. Tooling: TypeScript strict, ESLint (including `eslint-plugin-security`), Prettier,
   Husky pre-commit hooks, Conventional Commits.
3. **CI pipeline (GitHub Actions)** on every PR:
   - lint → typecheck → unit tests with coverage → build web → build desktop (Windows + Linux)
   - **CodeQL** static analysis
   - **Dependency scanning** (Dependabot + `pnpm audit`, `cargo audit`)
   - **Secret scanning**
   - **License check** against an allowlist of permissive licenses: `license-checker`
     for npm, `cargo deny` for Rust. Any GPL/LGPL/AGPL or unknown license fails the build
   - **DCO check:** contributors sign off commits (`git commit -s`). No CLA, so the
     project can't later be relicensed as closed source
4. Branch protection: PRs required, CI must pass, at least 1 review.
5. Set up the Vitest and Playwright harnesses with one passing example test each.
6. Seed `test-corpus/` with roughly 50 PDFs.
7. Implement `packages/platform` interfaces with stub web and desktop implementations.

**Exit gate:** A "hello world" app builds and deploys to a preview URL from CI, and a
desktop build artifact is produced for Windows and Linux.

**Status (2026-10-07): built.** See [CONTRIBUTING.md](../CONTRIBUTING.md) and
[docs/ci.md](ci.md). What was delivered, and what changed from the plan above:

- The "hello world" goes further than planned: it opens a PDF and renders page 1 in the
  browser and in the desktop app, through the real `platform` → `renderer` → `ui` stack.
- **Node 24 LTS** is required (current tooling needs Node ≥ 22.22). **TypeScript 6.0** for
  now, because typescript-eslint doesn't support TypeScript 7 yet.
- License checks use `pnpm licenses` with our own SPDX evaluator (`scripts/licenses.mjs`)
  instead of `license-checker`, plus `cargo deny` (which also replaces `cargo audit`) and
  GitHub dependency review on PRs.
- Secret scanning uses the MIT-licensed gitleaks CLI; the gitleaks GitHub Action is not
  open source.
- The test corpus has **60 generated PDFs** (Apache-2.0, no third-party files) with
  expected outcomes, checked by 120+ renderer tests.
- The desktop app is tested in CI on Linux and Windows by launching it with a PDF and
  checking that it renders and that fs, shell, dialog, forged file tokens, network, and
  `eval` are all blocked.
- The CSP adds `'wasm-unsafe-eval'` (WebAssembly compilation only, needed by PDF.js
  image decoders and later PDFium). JavaScript `eval` stays blocked.
- **Found and fixed:** Prettier was corrupting the Linux `.desktop` template, which
  breaks "Open with". CI now validates the packaged desktop entry.
- **Still manual** (repository settings): `main` branch, branch protection, GitHub Pages,
  security features, SignPath application. See [docs/ci.md](ci.md).
- PR previews are CI artifacts, not hosted URLs. The web app deploys to GitHub Pages from
  the default branch once Pages is enabled.

---

### Phase 2 — Viewer MVP (3–4 weeks)

**Features (Must):**
- Open a PDF by file picker, drag and drop, or URL (web) / OS file association (desktop)
- Render pages with virtualized scrolling (only visible pages rendered)
- Zoom (fit width, fit page, custom %), rotate view
- Page thumbnails sidebar, outline/bookmarks panel
- Text selection and copy (PDF.js text layer)
- Full-text search with highlight and next/previous
- Go to page, keyboard navigation
- Print
- Password-protected PDF support (prompt for password)
- Dark mode (interface; already built)

**Technical tasks:**
- Run PDF.js in a **Web Worker** so parsing never blocks the UI
- Configure PDF.js securely (ADR-0007): legacy build, strict CSP with no `unsafe-eval`,
  `enableXfa: false`, `maxImageSize` set, never load the PDF.js scripting sandbox,
  exact version pinned (see §5)
- Render cache with memory limits, and `OffscreenCanvas` rendering in the worker. The
  spike measured +549 MB and 252 ms main-thread stalls on a 504-page file without these
- Incremental search: show results while pages are scanned (extracting text from
  1,000 pages took about 6 s in the spike)
- Accessibility: keyboard-only operation, ARIA roles, screen-reader text layer

**Unit tests:** renderer wrapper (open, page count, render calls, error handling for
corrupt files), search logic, zoom math, navigation state, password flow.
**E2E tests:** open → scroll → search → zoom → print-preview in Chromium (Chrome/Edge),
Firefox, and WebKit. All three must pass. WebKit is required because the Linux desktop app
runs on WebKitGTK, even though Safari itself is not a focus.
**Performance budgets:** first page visible in under 1 s for a 10 MB PDF; smooth scrolling
on a 1,000-page document; memory under 500 MB.

**Exit gate:** All corpus PDFs open without crashes (malformed ones show a friendly error),
coverage ≥ 80% in `core` and `renderer`, performance budgets met.

**Status (2026-10-08): built.** All Must features above are in, except "open by URL"
(dropped: it would make the app fetch remote content, against ADR-0006). Also added:
rotate view, Automatic zoom, drag and drop on desktop and web, and Acrobat-style shortcuts.
Results against the performance budgets are in [docs/performance.md](performance.md):
first page under 1 s met; memory and main-thread stalls are within budget on normal long
documents but slightly over on the worst-case stress file. Moving page drawing off the main
thread is the follow-up, scheduled before the beta.

Found and fixed while testing: a damaged page tree (cyclic-page-tree.pdf) left the viewer
on "Loading pages…" forever, and the page-number box could be rewritten by a settling
scroll while the user typed, sending them to the wrong page.

---

### Phase 3 — Annotations (2–3 weeks)

**Features (1.0 scope):**
- **Highlight** and **underline** selected text (text-anchored, choice of colour)
- **Sticky notes**: place, edit, move, and delete
- Show existing annotations from other apps, and edit or delete the ones phinPDF supports
- Undo/redo for every action (command pattern in `core`)
- **Save** as standard PDF annotations so Acrobat, Edge, Okular, and others can read them.
  Saving keeps a file's existing encryption (ADR-0004).

**Unit tests:** every edit command (apply / undo / redo / serialize), coordinate
transforms (screen ↔ PDF user space, including rotated pages), save → reopen round-trip
tests that assert annotations survive.
**Interoperability tests:** save in phinPDF, then check the file in Acrobat Reader,
Microsoft Edge, Okular/Evince (Linux), Chrome, and Firefox (manual checklist plus automated
reopen in PDF.js).

**Exit gate:** Annotated files round-trip without loss and render correctly in at least
3 other viewers. **1.0 is feature-complete at this point.**

---

### Phase 4 — Page & Content Editing (moved after 1.0)

**Not in 1.0** (decided 2026-10-07). Kept here as the plan for 1.1+. Phases 5–8 follow
Phase 3 directly.

**Features:**
- Page organizer: reorder (drag and drop), rotate, delete, duplicate, insert blank page
- Merge multiple PDFs, split or extract pages
- Insert images and new text blocks
- Edit document metadata (title, author)
- **Add or remove a password** (AES-256 only when adding; removing requires the current
  password)
- Export pages as images (PNG/JPEG)
- *Not in 1.0 (decided 2026-10-07):* redaction and compression

**Unit tests:** page-operation commands, merge/split correctness (page counts, content
preserved, bookmarks fixed up), password tests (files encrypted by phinPDF open in
Acrobat, Edge, and qpdf with the password and not without it; removing a password needs
the old one), metadata edits.

**Exit gate:** All tests green, encrypted output verified by qpdf and at least two other
viewers.

---

### Phase 5 — Desktop App (2–3 weeks)

1. Wrap `apps/web` in Tauri 2. Implement the `platform` desktop adapter: native open/save
   dialogs, file associations (`.pdf`), "Open with", drag onto the taskbar icon,
   native print, native menus and shortcuts.
2. **Lock down Tauri** (ADR-0003): declare commands in `build.rs` so each needs an explicit
   capability, no fs/shell/http plugins, file access only to files the user picks, strict
   CSP, no remote content loaded into the webview.
3. **Linux desktop entry:** use a custom template with `Exec=... %F`. Tauri's default
   omits it, which breaks double-click opening (found in spike 3).
4. Auto-updater with **signed updates**.
5. **Code signing:** Windows (Authenticode) through the **SignPath Foundation** program,
   which is free for open-source projects. Linux packages signed with GPG (free). Without
   Windows signing, SmartScreen warns users on first install, so apply early (Phase 1).
   Flathub and winget are free distribution channels.
6. Installers: Windows `.msi`/`.exe`; Linux `.AppImage`/`.deb`/`.rpm` and Flatpak.

**Tests:** `cargo test` for Rust commands, Playwright E2E against the desktop build,
manual smoke tests on Windows 10/11 (x64 and ARM) and major Linux desktops (Ubuntu/GNOME,
Fedora, KDE Plasma; X11 and Wayland).

**Exit gate:** Signed Windows and Linux installers install, open files by double-click,
and auto-update from a test release.

---

### Phase 6 — Security Assessment & Hardening (2–3 weeks, alongside Phase 5)

See §5 for the full program. In short: finalize the threat model, run fuzzing, SAST/DAST,
dependency and license audit, a focused manual review of the riskiest areas, an external
penetration test if budget allows, and fix every Critical/High finding before beta.

**Exit gate:** No open Critical or High findings. Medium findings are triaged with owners
and dates. Security report published in `docs/security/`.

---

### Phase 7 — User Testing (4–6 weeks)

See §6 for the full program. Rounds: moderated usability tests → closed alpha →
public beta → accessibility audit.

**Exit gate:** SUS score ≥ 75, task success ≥ 90% on core tasks, no open P0/P1 bugs,
crash-free sessions ≥ 99.5% in beta.

---

### Phase 8 — Release 1.0 (1–2 weeks)

- Release candidate build, full regression run (unit + E2E + manual checklist)
- Docs: user guide, keyboard shortcut reference, FAQ, privacy policy, security policy
  (`SECURITY.md` with a vulnerability disclosure process)
- Publish: web (production URL), desktop (GitHub Releases + website; optionally Microsoft
  Store, winget, Flathub)
- Changelog, release notes, launch announcement
- On-call / triage rota for launch week

---

### Phase 9 — Post-release / v2 candidates

- **1.1 candidates** (cut from 1.0 on 2026-10-07, in rough priority order for the two user
  profiles): form filling, signatures (draw/type/image), page organizing (Phase 4),
  merge and split, reopen at last page and recent files, annotations list panel,
  strikethrough, freehand drawing and shapes, text boxes and images, dark page view,
  export pages as images, add/remove passwords
- **Won't build:** redaction, compression
- Cryptographic digital signatures (PAdES) and signature validation
- OCR for scanned PDFs (Tesseract-WASM)
- True editing of existing body text (reflow)
- PDF/A export and validation
- Compare two PDFs (visual diff)
- Plugin / scripting API
- Optional cloud sync / sharing
- Native macOS desktop app (needs an Apple Developer account for signing and notarization)

---

## 4. Unit Test & Quality Strategy

### Test pyramid

| Level | Tool | Scope | Target |
|---|---|---|---|
| **Unit** | Vitest | Pure functions, edit commands, document model, coordinate math, platform adapters (mocked) | ≥ 85% line coverage in `core`, ≥ 80% overall. Required on every PR |
| **Component** | Vitest + Testing Library | React components (toolbar, dialogs, panels) and accessibility assertions (`jest-axe`) | Every interactive component |
| **Integration** | Vitest (Node + real PDF.js/PDFium-WASM), checked with qpdf and Poppler as in spike 2 | Open → edit → save → reopen round-trips against the corpus | Every edit feature |
| **E2E** | Playwright | Real user flows in Chromium, Firefox, and WebKit (needed for the Linux desktop app's WebKitGTK), and the Tauri build on Windows and Linux | Every user story's acceptance criteria |
| **Visual regression** | Playwright screenshots | Rendered pages and UI compared to baselines | Corpus sample + key screens |
| **Fuzz** | jazzer.js / custom mutator | Feed mutated PDFs to the parser and editor | Runs nightly, see §5 |
| **Performance** | Playwright + custom benchmarks | Load time, scroll FPS, memory | Budgets enforced in CI |

### Practices

- **Write tests with the feature.** A PR without tests for new logic does not merge.
- **Every bug fix includes a regression test**, and the PDF that triggered it goes into
  the corpus.
- **Round-trip tests are the core safety net:** for every edit command,
  `open(save(apply(doc)))` must equal the expected state.
- **Mutation testing** (Stryker) on `core` each month, to make sure tests actually catch bugs.
- **Flaky-test policy:** fix the flaky test or its root cause right away. Never skip it.

### Test PDF corpus (`test-corpus/`)

- **Normal:** text-heavy, image-heavy, scanned, forms (AcroForm), large (1,000+ pages),
  multilingual/RTL/CJK, various PDF versions (1.3–2.0)
- **Edge cases:** rotated pages, odd page sizes, encrypted (RC4, AES-128, AES-256),
  linearized, incremental updates, broken xref tables
- **Malicious/malformed:** PDFs with embedded JavaScript, launch actions, embedded files,
  oversized images (decompression bombs), deeply nested objects, known CVE reproducers
  (for example the PDF.js font CVE-2024-4367)
- Sources: PDF.js test suite, Mozilla pdf.js-corpus, the qpdf test suite, plus our own.
  Only commit third-party PDFs whose license allows redistribution, and record each
  file's source and license in `test-corpus/SOURCES.md`. Bundled fonts must also be
  permissive (for example SIL OFL or Apache-2.0).

---

## 5. Security Assessment Plan

PDF is one of the most-attacked file formats. Our main threats are **malicious PDFs**
and **data leaks**.

### 5.1 Threat model (STRIDE). Start in Phase 0 and update every phase.

| Threat | Example | Mitigations |
|---|---|---|
| **Code execution via malicious PDF** | Exploit in a font, image codec, or JS engine (for example CVE-2024-4367 in PDF.js) | Keep PDF.js and PDFium patched and pinned, **never execute PDF-embedded JavaScript** (no PDF.js scripting sandbox), parse in a Web Worker, strict CSP with no `unsafe-eval` and no `unsafe-inline` |
| **Desktop sandbox escape** | Webview compromise reaches the file system or shell through IPC | Tauri capability allowlist, no shell/exec commands, FS scope limited to files the user picked, validate all IPC input on the Rust side |
| **Information disclosure** | PDF "phones home" through links, remote fonts/images, or form submit actions | Local-only processing, block automatic network requests from documents, confirm before opening external links, ignore `SubmitForm`/`Launch` actions |
| **Weak or broken encryption** | User adds a password but the file is weakly encrypted, or saving silently drops encryption | AES-256 only for new passwords; save keeps existing encryption (spike 2 showed one library silently decrypts); round-trip tests with qpdf and other viewers |
| **Denial of service** | Decompression bombs, recursive objects, huge pages | Resource limits (memory, page size, recursion depth), timeouts, worker that can be killed and restarted |
| **Tampering / supply chain** | Compromised npm/crates dependency or update server | Lockfiles, dependency review, `pnpm audit`/`cargo audit`, SBOM (CycloneDX), signed releases, signed auto-updates, pinned GitHub Actions |
| **Spoofing** | Fake update, unsigned installer | Code signing on all platforms, update signature verification |
| **Web-specific** | XSS through document text, filenames, or metadata | React auto-escaping, no `dangerouslySetInnerHTML`, Trusted Types, strict CSP, security headers (HSTS, COOP/COEP, X-Content-Type-Options) |

### 5.2 Assessment activities

| Activity | When | Tooling |
|---|---|---|
| Static analysis (SAST) | Every PR | CodeQL, Semgrep, `eslint-plugin-security`, `cargo clippy` |
| Dependency and license scanning | Every PR + daily | Dependabot, `pnpm audit`, `cargo audit`, `cargo deny`, license checker |
| Secret scanning | Every push | GitHub secret scanning / gitleaks |
| **Fuzzing** | Nightly from Phase 2 | Mutated corpus fed to open/render/edit/save paths; crashes and hangs filed as bugs automatically |
| Dynamic scanning (DAST) | Phase 6, before each release | OWASP ZAP against the web deployment (headers, CSP, misconfig) |
| Malicious-PDF test suite | Every PR (in E2E) | Corpus of malicious PDFs must open safely, or be rejected, with no network calls and no script execution |
| Manual secure code review | Phase 6 | Focus on IPC handlers, file handling, encryption, save/serialize, CSP |
| Tauri config review | Phase 5/6 | Capabilities, CSP, updater keys, FS scopes |
| **External penetration test** | Phase 6 (if budget allows) | Third-party firm or bug-bounty style review of desktop + web |
| SBOM generation | Every release | CycloneDX |

### 5.3 Policies

- Severity uses CVSS. **Critical/High block release.** Medium must be fixed within
  30 days, Low tracked in the backlog.
- `SECURITY.md` explains how to report vulnerabilities privately (GitHub private
  advisories), with a 90-day disclosure timeline.
- Monitor PDF.js, PDFium, and Tauri security advisories, and ship patches within
  7 days for Critical issues.

---

## 6. User Testing Plan

### 6.1 Rounds

**Current tester: the project owner only** (decided 2026-10-07). Until more testers are
recruited, each round below is run as a **structured self-test**: work through the task
list in §6.2 and the profile tasks in [user profiles](user-profiles.md), time each task,
and log every problem as a GitHub issue labelled `ux-research` with a severity. Because
one person who knows the app can't stand in for new users, two things make up for it:

- **Automated checks** in CI: axe accessibility scans in the E2E tests, keyboard-only E2E
  flows, and the performance budgets.
- **Recruit 3–5 outside testers before the public beta** (Phase 7), for example classmates
  or colleagues matching the two profiles. The public beta itself is the main source of
  outside feedback.

The table shows the full plan for when testers are available.

| Round | When | Who | Method | Goal |
|---|---|---|---|---|
| **Concept / wireframe test** | Phase 0 | 3–5 target users | Clickable Figma prototype, think-aloud | Validate layout and feature priorities before coding |
| **Usability round 1** | End of Phase 2 | 5–6 users | Moderated remote sessions (45 min), task-based | Viewer usability |
| **Usability round 2** | End of Phase 3 | 5–6 *new* users | Moderated, task-based | Annotation usability (highlight, underline, notes, save) |
| **Closed alpha** | Phase 7, weeks 1–2 | 15–30 invited users | Real-world use, in-app feedback button, weekly survey | Find bugs and workflow gaps |
| **Accessibility audit** | Phase 7 | Users of screen readers (NVDA and JAWS on Windows, Orca on Linux) and keyboard-only users + automated axe scans | Task-based + WCAG 2.2 AA checklist | Accessibility compliance |
| **Public beta** | Phase 7, weeks 3–6 | Open sign-up | Opt-in, privacy-respecting crash reporting and anonymous usage metrics; feedback forum | Scale testing, stability, compatibility with real-world PDFs |

### 6.2 Core test tasks (examples)

1. Open a PDF and find the paragraph that mentions "invoice total".
2. Highlight two sentences and add a comment to one.
3. Underline a sentence, save, close, and reopen the file.
4. Print pages 2–3 of a long document.
5. Open a password-protected PDF.
6. Zoom to fit the page width and jump to a bookmark.

### 6.3 Metrics and success criteria

- **Task success rate** ≥ 90% on core tasks
- **Time on task** compared to a baseline (for example Acrobat Reader / the Edge PDF viewer)
- **System Usability Scale (SUS)** ≥ 75 (above-average usability)
- **Error rate** and number of times users ask for help
- **Crash-free sessions** ≥ 99.5% in beta
- **Net Promoter Score** collected in beta (informational)

### 6.4 Feedback loop

Findings from each round are logged as GitHub issues labelled `ux-research` with a severity
(P0 blocker → P3 cosmetic). P0/P1 issues are fixed before the next round. Each round ends
with a 1-page summary in `docs/research/`.

---

## 7. Process & Workflow

- **Methodology:** 2-week sprints, backlog in GitHub Projects, a demo at the end of each sprint.
- **Branching:** trunk-based. Short-lived feature branches, PRs into `main`.
- **Definition of Done** (every feature):
  - [ ] Acceptance criteria met
  - [ ] Unit + integration tests written, coverage thresholds met
  - [ ] E2E test for the user flow
  - [ ] Works in web (Chromium/Edge and Firefox; Safari best effort) **and** desktop
        (Windows and Linux)
  - [ ] Keyboard-accessible, passes axe checks
  - [ ] No new CodeQL/Semgrep/audit findings
  - [ ] Docs/changelog updated
  - [ ] Code reviewed and approved
- **Environments:** PR preview deployments (web), nightly desktop builds, staging, production.

---

## 8. Key Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Editing existing text is much harder than expected | Scope slip | Kept out of 1.0 scope (confirmed). Prototype in a spike before starting it in v2 |
| `@embedpdf/pdfium` is maintained by a small team (supply chain, bus factor) | Editing engine stalls or is compromised | Pin and hash-check it, build PDFium-WASM from upstream source in CI as a fallback, `core` hides the engine behind interfaces (ADR-0004) |
| Two PDF parsers (PDF.js for viewing, PDFium for editing) | Twice the attack surface; the two may disagree on a file | Both run in workers under the same CSP; fuzz both; round-trip tests render with both. Revisit after Phase 2 |
| PDF.js security vulnerabilities | User compromise | Pin and patch quickly, disable eval/JS, fuzzing, CSP |
| Real-world PDFs break the app | Bad reviews | Large corpus, fuzzing, beta crash reports, graceful error UI |
| Browser API gaps (for example File System Access API missing in Firefox/Safari) | Worse web UX | Fallback to download/upload in the `platform` adapter |
| The desktop app uses a different web engine on each OS: WebView2 (Chromium) on Windows, WebKitGTK on Linux. WebKitGTK is often older and slower | Rendering or performance bugs only on Linux | WebKit runs in the required E2E suite, Linux desktop smoke tests every release, performance budgets checked on Linux too |
| Code-signing cost and setup time | Release delay | Apply to SignPath Foundation (free for OSS) in Phase 1 |
| A copyleft dependency slips in (including through sub-dependencies) | Can't be distributed under Apache-2.0 | License allowlist enforced in CI, SBOM reviewed each release (ADR-0001) |

---

## 9. Immediate Next Steps

1. ~~Confirm the 1.0 scope~~ **Done:** editing existing text is deferred until after 1.0.
2. ~~Decide the project license~~ **Done:** Apache-2.0, permissive dependencies only
   (ADR-0001).
3. ~~Decide on macOS~~ **Done:** no native macOS app for 1.0. Focus on Windows, Linux,
   and the browser. Apply to SignPath Foundation for free Windows code signing.
4. ~~Run the technical spikes and write the ADRs~~ **Done:** see the
   [spike report](spikes/phase0-spike-report.md) and ADR-0002 to ADR-0007.
5. Finish Phase 0: personas, competitive review, requirements backlog, wireframes.
6. Scaffold the monorepo and CI (Phase 1), with Windows in the CI matrix from day one.
