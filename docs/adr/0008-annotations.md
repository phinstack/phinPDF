# ADR-0008: How Annotations Are Shown, Edited, and Saved

- **Status:** Accepted
- **Date:** 2026-10-09

## Context

Phase 3 adds highlights, underlines, and sticky notes (1.0 scope). PDF.js renders pages,
and PDFium writes files (ADR-0004). Annotations must:

- be editable whether phinPDF or another app made them,
- support undo and redo, and
- be saved so other viewers show them.

## Decisions

1. **phinPDF draws the annotations it can edit.** When a page loads, the renderer reads
   its Highlight, Underline, and Text (note) annotations through PDF.js.
   - It then tells PDF.js not to draw them. It does this by setting `noView`/`noPrint` in
     the document's `annotationStorage` and rendering with
     `AnnotationMode.ENABLE_STORAGE`.
   - The UI draws them itself, in a layer over the canvas. Highlights use
     `mix-blend-mode: multiply`.
   - Every other annotation type (ink, shapes, stamps, links, forms) is still drawn by
     PDF.js and left untouched.
   - Hidden annotations and replies are also left untouched.
2. **The model is plain data in `@phinpdf/core`.** An annotation has an id, page, colour,
   comment, author, and date. A markup has one rectangle per text line; a note has an icon
   rectangle. All coordinates are in PDF user space.
   - Edits are `Command`s on a `CommandStack`, which gives undo and redo.
   - Annotations read from the file are merged in with `amend()`, so they don't create
     undo steps. This works because commands find items by id.
3. **Saving writes only the differences.** The app keeps a *baseline*: the annotations as
   they are in the saved file. `diffAnnotations` compares it with the current state and
   produces create, update, and delete changes.
   - PDFium applies these in a Web Worker and saves **incrementally**: the original bytes
     are kept and the changes appended. This keeps encryption, signatures' byte ranges, and
     anything phinPDF doesn't understand.
   - If an incremental save of a damaged file doesn't reopen cleanly, PDFium rewrites the
     whole file instead.
4. **Finding an annotation again in the file.** Each changed annotation has a key: its
   subtype, its /Rect, and its /NM (unique name) if it has one.
   - phinPDF writes /NM on every annotation it creates or edits.
   - Others are matched by subtype and /Rect, within 0.05 pt. Notes match on their
     top-left corner only, because PDF.js resizes notes that have no appearance stream.
   - Object numbers can't be used: many files store annotations as direct objects, and so
     does PDFium.
   - An edit whose original is no longer in the file is written as a new annotation, so
     the edit isn't lost.
5. **What is written.**
   - Highlights get QuadPoints in Acrobat's order and a multiply-blended appearance.
   - Underlines get QuadPoints.
   - Notes get Acrobat's default /Comment icon, with flags Print, NoZoom, and NoRotate.
   - All of them get /Contents, /T (if set), /M, /NM, and /C, plus a generated appearance
     stream so viewers that don't build their own still show them.
   - Deleting an annotation also deletes its pop-up.
6. **The editing engine loads lazily.** The PDFium WebAssembly file (about 2.1 MB gzip) is
   fetched the first time the user saves. No new CSP exceptions are needed:
   `wasm-unsafe-eval` and `worker-src 'self'` were already allowed.
7. **Saving to disk goes through the platform layer (ADR-0005).**
   - **Web:** the File System Access API writes back to a file opened with it. Otherwise,
     and in Firefox and Safari, the browser downloads the file.
   - **Desktop:** Rust writes the file. The webview sends raw bytes with a file token,
     never a path. Rust checks the bytes start like a PDF, are within the size limit, and
     only then writes atomically (a temporary file, then a rename).
   - **Desktop Save as:** the native dialog is shown from Rust, so the webview still has no
     dialog or file-system permissions.
   - **Desktop unsaved changes:** a window close while changes are unsaved is held back,
     and the webview is asked first.

## Consequences

- Highlights and notes from other apps are redrawn by phinPDF from their geometry. A custom
  appearance (for example a hand-drawn-looking highlight) shows as phinPDF's standard look
  in phinPDF, until the user edits it. Other viewers still see the original appearance.
- QuadPoints of existing markup are never rewritten. Rotated or skewed quads keep their
  exact shape in the file. phinPDF shows them as their bounding rectangles.
- Two engines parse every file that is saved (PDF.js to show it, PDFium to write it). Both
  run in workers under the same CSP. This is the trade-off ADR-0004 accepted.
