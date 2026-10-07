# ADR-0005: Platform Abstraction Layer

- **Status:** Accepted
- **Date:** 2026-10-07

## Context

The same UI runs in browsers and in Tauri. File access, printing, and OS integration
differ between them.

## Decision

All platform-specific behaviour goes through `packages/platform`, one interface with two
implementations:

```ts
interface Platform {
  openFile(): Promise<OpenedFile | null>;           // picker or "Open with"
  getLaunchFile(): Promise<OpenedFile | null>;      // file passed at startup (desktop)
  saveFile(file: OpenedFile, bytes: Uint8Array): Promise<void>;
  saveFileAs(name: string, bytes: Uint8Array): Promise<OpenedFile | null>;
  print(bytes: Uint8Array): Promise<void>;
  openExternalLink(url: string): Promise<void>;     // always asks the user first
  recentFiles(): Promise<RecentFile[]>;
}
```

| | Web | Desktop (Tauri) |
|---|---|---|
| Open | File System Access API; `<input type=file>` fallback (Firefox, Safari) | Native dialog through a Rust command |
| Save | File System Access API; download fallback | Rust command writing only to a file the user picked |
| Launch file | `launchQueue` (installed PWA) | Command-line path (spike 3) |

UI and `core` code never import Tauri or browser file APIs directly. A lint rule enforces this.

## Consequences

- Each implementation needs its own tests. The interface gets a shared contract test suite
  that runs against both.
- Features missing on one platform must degrade gracefully (for example "Save" becomes
  "Download" in Firefox).
