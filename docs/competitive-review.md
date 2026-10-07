# Competitive Review: Adobe Acrobat Reader

- **Date:** 2026-10-07
- **Primary competitor:** Adobe Acrobat Reader (free, Windows and web). Both target
  profiles (office workers and students) most likely use it today.
- **Scope:** only the features in phinPDF 1.0: view, zoom, search, print, highlight,
  underline, sticky notes.
- **Caveat:** written from general knowledge of Reader. Acrobat's interface changes often,
  so check details against the current version during the Phase 0 wireframe review
  (`docs/research/`).

## Why people would switch

| Pain point with Reader | phinPDF answer |
|---|---|
| Large install, background updater and services | Web version needs no install; desktop installer about 4–5 MB |
| Frequent prompts to sign in, try Acrobat Pro, or use the cloud | No account, no upsell, ever |
| Some features route files through Adobe's cloud | Files never leave the device (ADR-0006) |
| Slow to start on modest laptops | Fast start is a measured budget (first page under 1 s) |
| Not available as a native app on Linux | Native Linux app, plus the web version |
| Closed source | Apache-2.0, auditable |

## Where Reader sets the bar (match these)

These are the expectations users will bring. Matching them avoids "it's worse than
Reader" feedback in testing.

| Area | What Reader users expect | phinPDF 1.0 |
|---|---|---|
| Layout | Top toolbar; side panel for thumbnails and bookmarks; comment pane on the right | Same structure: top toolbar, left panel (thumbnails/bookmarks), right panel (notes) |
| Page navigation | Page number box ("3 / 120"), previous/next, thumbnails, bookmarks | Same |
| Zoom | Zoom in/out buttons, percentage box, fit page, fit width | Same |
| Search | Ctrl+F opens a find bar; next/previous; match count; whole word and case options | Same, with matches shown while the search runs (long documents) |
| Print | Ctrl+P; page ranges; fit or actual size | Same, via the system print dialog |
| Highlight/underline | Select text, then pick the tool (or select first, then use a small pop-up menu) | Both ways: toolbar tool, and a pop-up after selecting text |
| Sticky notes | Click to place an icon; note text in a pop-up or the comment pane | Same |
| Saving | Annotations saved into the PDF; visible in other apps | Same, as standard PDF annotations |
| Password-protected PDFs | Prompt for a password on open | Same |

## Keyboard shortcuts to match (Windows defaults)

Reusing Reader's shortcuts lets people keep their habits.

| Action | Shortcut |
|---|---|
| Open | Ctrl+O |
| Save | Ctrl+S |
| Print | Ctrl+P |
| Find | Ctrl+F; next F3 or Enter; previous Shift+F3 or Shift+Enter |
| Zoom in / out | Ctrl+= (Ctrl+Plus) / Ctrl+- |
| Fit page / actual size / fit width | Ctrl+0 / Ctrl+1 / Ctrl+2 |
| Go to page | Ctrl+Shift+N |
| Next / previous page | Page Down / Page Up, or Right / Left arrow when the page fits the window |
| First / last page | Home / End |
| Undo / redo | Ctrl+Z / Ctrl+Y |

## Where phinPDF can do better

1. **No interruptions.** No sign-in prompts, upgrade banners, or "try Pro" buttons in the
   toolbar. This alone is a visible difference.
2. **Faster on long documents.** Students' textbooks are the stress case; keep the
   Phase 2 performance budgets strict.
3. **Annotation speed.** One click from selected text to a highlight, and remembered
   colour per tool.
4. **Honest privacy message.** One clear line in the UI: files never leave your device.
5. **Same app in the browser and on the desktop.** Lab PCs and locked-down work laptops
   can use the web version with the same interface.

## Where we'll be behind in 1.0 (on purpose)

Reader's free version can also fill and sign forms, and has drawing tools. Those are 1.1
candidates in phinPDF. Office workers will notice the missing **Fill & Sign**, so it
should be first in line after 1.0.
