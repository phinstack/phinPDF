# ADR-0001: License and Dependency Policy

- **Status:** Accepted
- **Date:** 2026-10-07

## Context

phinPDF must be fully open source and free for anyone to use and redistribute, including
inside commercial products, without forcing those users to open-source their own code.
Many PDF libraries are copyleft: MuPDF and Ghostscript are AGPL, and Poppler is GPL.
Using any of them would force the whole application under that license, or require a
commercial license.

## Decision

1. **Project license: Apache-2.0.**
   - Lets anyone use, modify, and redistribute the code for free, including commercially.
   - Includes an explicit **patent grant**, which matters in the document-format space.
   - Matches PDF.js (Apache-2.0) and PDFium (Apache-2.0), our main dependencies. Tauri
     (MIT/Apache-2.0) is also compatible.
2. **Dependencies must be permissively licensed.** Allowed: MIT, MIT-0, BSD-2-Clause,
   BSD-3-Clause, Apache-2.0 (including `WITH LLVM-exception`), ISC, Zlib, 0BSD, BSL-1.0,
   BlueOak-1.0.0, Unlicense, Unicode-DFS/Unicode-3.0, CC0-1.0, and MPL-2.0 (only if its
   files are used unmodified). The machine-readable list is `scripts/licenses.mjs` (npm)
   and `apps/desktop/src-tauri/deny.toml` (Rust); keep them in sync.
   A dual-licensed package is fine when at least one of its options is allowed. Fonts: SIL OFL-1.1 or Apache-2.0.
   **Not allowed:** GPL, LGPL, AGPL, SSPL, BUSL, "non-commercial" licenses, and
   unlicensed code.
3. **Editing engine:** PDFium-WASM (MIT wrapper, Apache-2.0 PDFium). See ADR-0004.
   MuPDF.js is rejected because it is AGPL.
4. **Enforcement:**
   - CI fails on any dependency outside the allowlist (`license-checker` for npm,
     `cargo deny` for Rust).
   - Each release ships an SBOM (CycloneDX) and a generated `THIRD_PARTY_NOTICES.md`.
   - Third-party test PDFs are recorded with source and license in
     `test-corpus/SOURCES.md`.
5. **Contributions:** inbound = outbound under Apache-2.0, certified with the Developer
   Certificate of Origin (`git commit -s`). No CLA, so the project can't later be
   relicensed as closed source by a single party.

## Consequences

- Some features that copyleft libraries offer for free (for example MuPDF's text
  editing and Ghostscript's optimization) must be built ourselves or taken from
  permissive alternatives. This may cost extra effort in Phase 4 and later.
- Anyone, including companies, can fork, embed, or resell phinPDF. That is intended.
- Adding any exception to the allowlist requires a new ADR.
