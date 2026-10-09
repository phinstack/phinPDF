# phinPDF

A free, open-source PDF viewer and editor that runs in a web browser and as a desktop app
(Windows and Linux) from a single codebase. On macOS, use the web version.

**Status:** Phases 2 and 3 built, so the 1.0 feature set is complete. You can open, scroll,
navigate, zoom, rotate, search, select text, print, and open password-protected files. You
can also highlight and underline text, add sticky notes, edit comments, undo and redo, and
save. Annotations are saved as standard PDF annotations that Acrobat, Edge, Okular, Evince,
Chrome, and Firefox can read. Next: hardening, security assessment, and user testing. See
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
