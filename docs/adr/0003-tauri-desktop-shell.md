# ADR-0003: Tauri for the Desktop App

- **Status:** Accepted
- **Date:** 2026-10-07
- **Evidence:** [Spike 3](../spikes/phase0-spike-report.md#spike-3-tauri-desktop-shell-linux)

## Context

The desktop app (Windows and Linux for 1.0) wraps the same web app. The two main options
are Electron (bundles Chromium) and Tauri (uses the OS webview: WebView2 on Windows,
WebKitGTK on Linux).

## Decision

Use **Tauri 2** (stable, currently 2.12). Tauri 3 is in alpha and will be evaluated after 1.0.

Required security pattern, confirmed in spike 3:

1. Declare every custom command in `build.rs` with `AppManifest::commands`, so each one
   must be granted in a capability file. **Without this, Tauri allows all custom commands.**
2. Capabilities grant `core:default` plus named app commands only. No `fs`, `shell`, or
   `http` plugins. File access goes through commands that only read files the user picked.
3. Strict CSP: no `unsafe-eval`, no `unsafe-inline`, `connect-src` limited to IPC.
4. Validate in Rust before returning a file: regular file, size limit, `%PDF-` header.
5. Use a custom Linux desktop template with `Exec=... %F` so double-click opens the file.
   Tauri's default template omits it.

## Why not Electron

| | Tauri (measured) | Electron (typical) |
|---|---|---|
| Linux installer | 2.5 MB `.deb` | 80–150 MB |
| Security model | Deny-by-default capabilities, Rust backend | Node in main process; needs careful hardening |
| Rendering engine | Differs per OS | Same Chromium everywhere |

## Consequences

- The app runs on two different engines: Chromium-based WebView2 on Windows, and
  WebKitGTK on Linux. WebKit must be in the required E2E test matrix.
- WebKitGTK version depends on the user's Linux distribution. Ship the polyfilled PDF.js
  build (ADR-0007) and set a minimum WebKitGTK version in Phase 5.
- Windows is not yet verified. It is the first job in the Phase 1 CI matrix.
