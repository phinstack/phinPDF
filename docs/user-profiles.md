# User Profiles

- **Status:** Target users (**office workers** and **students**) and 1.0 feature scope decided on 2026-10-07.
- Details marked *(assumption)* are defaults until research says otherwise. The user
  research rounds in Phase 7 (and the wireframe review in Phase 0) should confirm or
  correct them.

phinPDF 1.0 is designed for these two groups. When a feature or design choice helps one
of them, it wins over one that helps neither.

---

## Profile 1: Office worker

**Example:** Sam, 38, operations coordinator at a 40-person company.

| | |
|---|---|
| **Devices** | Company Windows 11 laptop, often with a second monitor *(assumption)*. Uses Edge or Chrome. Can't always install software without IT approval *(assumption)*. |
| **PDFs they handle** | Contracts, invoices, supplier forms, HR forms, policies, scanned receipts. Mostly 1–30 pages. |
| **How often** | Several times a day, in short bursts between other work. |
| **Tech comfort** | Comfortable with Office apps. Not interested in learning a new tool; expects it to work like ones they know. |

**Main tasks (in order of frequency):**

1. Open a PDF from email or a shared drive, read it, find a clause or number (search).
2. Fill in a form and sign it, then save and send it back.
3. Combine several PDFs into one (for example invoices for an expense claim), or pull
   out a few pages.
4. Add a comment or highlight before forwarding to a colleague.
5. Occasionally remove personal details before sharing (redaction; won't be built).

**Frustrations today:**

- Adobe Reader pushes paid upgrades for basic tasks like combining files.
- The browser's built-in viewer can't sign or merge.
- Free online tools mean uploading company documents to unknown servers, which may
  break company policy.
- Signing usually means print → sign → scan.

**What success looks like:** a form filled and signed in under two minutes, without
printing, without an account, and without the file leaving the computer.

**Implications for phinPDF:**

- The **web version must be fully useful** for people who can't install software. The
  desktop app is a bonus.
- **Form filling and signatures** are central, not secondary.
- **"Files never leave your device"** is a selling point for this group. Say it clearly in
  the UI and on the website.
- Familiar layout and keyboard shortcuts (Ctrl+O, Ctrl+S, Ctrl+F, Ctrl+P, Ctrl+Z).
- Saved files must open correctly in Acrobat and Edge, because colleagues use those.

---

## Profile 2: Student

**Example:** Priya, 20, second-year university student.

| | |
|---|---|
| **Devices** | Personal laptop: Windows, Linux, or a Chromebook/macOS where only the web version applies *(assumption)*. Sometimes a university lab PC where nothing can be installed. Often on battery and on slow or shared Wi-Fi. |
| **PDFs they handle** | Lecture slides, journal papers, textbook chapters (often 100–500 pages), assignment briefs, scanned handouts. |
| **How often** | Long reading sessions of 30–120 minutes, several times a week. |
| **Tech comfort** | Confident with apps, impatient with slow or cluttered ones. Expects keyboard shortcuts and dark mode. |

**Main tasks (in order of frequency):**

1. Read long documents comfortably: jump between sections (bookmarks, page numbers),
   zoom, dark mode, remember where they stopped.
2. Highlight and underline while reading; add short notes in the margin.
3. Search across a long document for a term.
4. Review their own highlights and notes before an exam (a list of all annotations).
5. Combine lecture slides into one file per course; export or print a few pages.
6. Occasionally fill and sign forms (enrolment, internships).

**Frustrations today:**

- Free viewers lag or crash on large textbooks.
- Annotations made in one app don't show up in another, or get lost.
- Many apps are paid, ad-supported, or require an account.
- Bright white pages during late-night reading.

**What success looks like:** a 400-page textbook opens instantly, scrolls smoothly, and
highlights made today are still there and still visible in other apps next month.

**Implications for phinPDF:**

- **Performance on long documents** matters (the 504-page spike results apply directly).
  The Phase 2 memory and smoothness work is a requirement, not polish.
- **Reading comfort:** dark mode for the interface, an optional dark page view
  *(assumption: wanted)*, and reopening at the last page.
- **Highlights and notes** must be fast (one click or shortcut) and saved as standard PDF
  annotations so they work in other apps.
- An **annotations list panel** to review notes.
- Must work on **low-end laptops and in the browser on any OS**.

---

## What both groups share

- Free, no account, no ads, no uploads.
- Fast to open, simple to use, no training needed.
- Saved files must work everywhere else.
- Keyboard-friendly.

## Who phinPDF 1.0 is *not* designed for

These users can still use phinPDF, but their needs don't drive 1.0 decisions:

- Print and prepress professionals (colour management, preflight, PDF/X).
- Legal teams needing certified digital signatures and audit trails (PAdES is v2).
- People editing existing paragraphs of text (deferred until after 1.0).
- Developers needing scripting or batch processing.

---

## Feature priorities for 1.0

**Decided 2026-10-07.** 1.0 is a focused **reader with light annotation**. The middle
columns show how much each profile needs a feature; the last column is the decision.

| Feature | Office worker | Student | Decision |
|---|---|---|---|
| View: open, scroll, page navigation, bookmarks | Must | Must | **1.0** |
| Open password-protected PDFs (part of viewing) | Must | Could | **1.0** |
| Zoom | Must | Must | **1.0** |
| Search | Must | Must | **1.0** |
| Print | Must | Should | **1.0** |
| Highlight | Should | Must | **1.0** |
| Underline | Should | Must | **1.0** |
| Sticky notes | Must | Must | **1.0** |
| Save annotations so other apps can read them (needed for the three above) | Must | Must | **1.0** |
| Dark mode (interface) | Could | Must | **1.0** (already built) |
| Strikethrough | Could | Should | After 1.0 |
| Annotations list panel | Could | Must | After 1.0 |
| Dark page view (inverted pages) | Won't | Should | After 1.0 |
| Reopen at last page / recent files | Should | Must | After 1.0 |
| Fill in forms | Must | Should | After 1.0 |
| Signatures (draw, type, image) | Must | Should | After 1.0 |
| Reorder, rotate, delete pages | Must | Should | After 1.0 |
| Merge and split PDFs | Must | Should | After 1.0 |
| Freehand drawing and shapes | Could | Should | After 1.0 |
| Add text boxes and images | Should | Could | After 1.0 |
| Export pages as images | Could | Could | After 1.0 |
| Add/remove passwords | Could | Won't | After 1.0 |
| Cryptographic digital signatures | Could | Won't | v2 |
| OCR for scanned documents | Should | Should | v2 |
| Edit existing text | Could | Won't | v2 |
| Redaction | Should | Won't | **Won't build** |
| Compress PDFs | Should | Could | **Won't build** |

**What this means for the profiles:** 1.0 fully serves the student's main tasks 1–3 and
the office worker's tasks 1 and 4. Form filling, signing, and merging, the office
worker's tasks 2 and 3, come after 1.0. They are the first candidates for 1.1.

## Test tasks for user research (from these profiles)

Used for the wireframe review in Phase 0 and usability rounds in Phases 2, 3, and 7.
Tasks marked *later* test features planned after 1.0.

| # | Profile | Task |
|---|---|---|
| 1 | Office | Open the supplier contract and find the payment terms. |
| 2 | Office | Highlight the cancellation clause and add a note for a colleague, then save. |
| 3 | Office | Open the password-protected salary report and print page 2. |
| 4 | Office | *(later)* Fill in the expense form, sign it, and save it. |
| 5 | Office | *(later)* Combine three invoices into one PDF and remove the blank last page. |
| 6 | Student | Open the 400-page textbook and go to Chapter 7. |
| 7 | Student | Highlight two key sentences, underline a third, and add a note to one of them. |
| 8 | Student | Find every mention of "photosynthesis". |
| 9 | Student | Zoom so a page fills the screen width, then print pages 10–12. |
| 10 | Student | Save, close, and reopen the file; check the highlights and notes are still there. |
