# CI and Repository Settings

## Workflows

| Workflow | Runs on | Jobs |
|---|---|---|
| `ci.yml` | Every push and PR | Lint, format, typecheck, unit tests + coverage (including interop checks with qpdf and Poppler), license policy, `pnpm audit`, web build · E2E in Chromium, Firefox, WebKit · Rust fmt, clippy, tests, `cargo deny` · Desktop smoke test and installers on Linux and Windows · gitleaks secret scan · dependency review (PRs) |
| `codeql.yml` | Push, PR, weekly | CodeQL `security-extended` for TypeScript, Rust, and the workflows themselves |
| `dco.yml` | PRs | Every commit has a `Signed-off-by` line |
| `pages.yml` | Push to the default branch | Builds and deploys the web app to GitHub Pages, once Pages is enabled |
| `dependabot.yml` | Weekly | Update PRs for npm, Cargo, and GitHub Actions |

All third-party actions are pinned to a commit SHA. Every job starts with read-only
permissions and is granted more only where needed.

### Desktop smoke test

CI builds the desktop app with the `e2e` Cargo feature, launches it with a test PDF, and
waits for a report from inside the webview (`apps/web/src/e2e/desktop-smoke.ts`). It fails
unless the PDF rendered and each of these was blocked: the fs and shell plugins, calling
the dialog plugin from the webview, reading a file without an issued token, network
access, and `eval`. A second run with a non-PDF must fail. The `e2e` feature and its
capability are never part of release builds.

## Settings to change on GitHub (manual)

These can't be set from the repository:

1. **Default branch.** Create `main` from the current default branch and make it the
   default (Settings → General). The workflows already run on `main`.
2. **Branch protection / ruleset for `main`** (Settings → Rules → Rulesets):
   require a pull request with 1 approval, require status checks to pass (all jobs in
   `CI`, `CodeQL`, and `DCO`), block force pushes, and require linear history if preferred.
3. **GitHub Pages** (Settings → Pages → Source: **GitHub Actions**). The deploy job
   skips itself until this is on. The app will be at
   `https://phinstack.github.io/phinPDF/`.
4. **Security** (Settings → Code security): enable Dependabot alerts, secret scanning
   with push protection, and private vulnerability reporting (used by `SECURITY.md`).
5. **Windows code signing.** Apply to the [SignPath Foundation](https://signpath.org/)
   open-source program. Until then Windows installers are unsigned and SmartScreen will
   warn on first run.

## PR previews

Each CI run uploads the built web app as the `web-dist` artifact and the installers as
`phinpdf-Linux` / `phinpdf-Windows`. Download them from the run's summary page. Hosted
per-PR preview URLs would need a third-party host and are not set up.
