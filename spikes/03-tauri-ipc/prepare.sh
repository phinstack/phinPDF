#!/usr/bin/env sh
# Copies PDF.js (modern and legacy builds) into the webview's static folder.
set -e
here=$(dirname "$0")
src="$here/../node_modules/pdfjs-dist"
for b in build legacy/build; do
  mkdir -p "$here/web/vendor/pdfjs/$b"
  cp "$src/$b/pdf.mjs" "$src/$b/pdf.worker.mjs" "$here/web/vendor/pdfjs/$b/"
done
