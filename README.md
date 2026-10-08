# phinPDF

A free, open-source PDF viewer and editor that runs in a web browser and as a desktop app
(Windows and Linux) from a single codebase. On macOS, use the web version.

**Status:** Phase 2 (viewer) built: open, scroll, page navigation, zoom, rotate, thumbnails,
bookmarks, search, text selection, print, password-protected files, and drag and drop, in
the browser and on the desktop. Next: Phase 3, highlights, underlines, and sticky notes. See
[docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md) for the roadmap.

## Quick start

```sh
corepack enable        # uses the pnpm version pinned in package.json
pnpm install
pnpm dev               # http://localhost:5173
```

Desktop app, tests, and repository layout: see [CONTRIBUTING.md](CONTRIBUTING.md).
CI and repository settings: see [docs/ci.md](docs/ci.md).

## License

phinPDF is licensed under the [Apache License 2.0](LICENSE). You can use, modify, and
redistribute it for free, including commercially. phinPDF only uses dependencies with
permissive licenses, so everything built from this repository stays free to distribute.
See [ADR-0001](docs/adr/0001-license-and-dependency-policy.md).

## Contributing

Contributions are welcome. Sign off your commits (`git commit -s`) to certify the
[Developer Certificate of Origin](https://developercertificate.org/). No CLA is required.
