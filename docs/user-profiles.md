# User Profiles

- **Status:** Draft. Target users decided on 2026-10-07: **office workers** and **students**.
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
5. Occasionally remove personal details before sharing (redaction).

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

## Draft feature priorities for 1.0

Derived from the two profiles. **Please review:** change any rating you disagree with.

| Feature | Office worker | Student | Proposed for 1.0 |
|---|---|---|---|
| View, zoom, scroll, page navigation | Must | Must | **Must** |
| Search | Must | Must | **Must** |
| Print | Must | Should | **Must** |
| Bookmarks/outline panel | Should | Must | **Must** |
| Open password-protected PDFs | Must | Could | **Must** |
| Highlight, underline, strikethrough | Should | Must | **Must** |
| Sticky notes / comments | Must | Must | **Must** |
| Annotations list panel | Could | Must | **Should** |
| Fill in forms | Must | Should | **Must** |
| Signatures (draw, type, image) | Must | Should | **Must** |
| Reorder, rotate, delete pages | Must | Should | **Must** |
| Merge and split PDFs | Must | Should | **Must** |
| Freehand drawing and shapes | Could | Should | **Should** |
| Add text boxes and images | Should | Could | **Should** |
| Redaction | Should | Won't | **Should** |
| Dark mode (interface) | Could | Must | **Must** (done) |
| Dark page view (inverted pages) | Won't | Should | **Could** |
| Reopen at last page / recent files | Should | Must | **Must** |
| Export pages as images | Could | Could | **Could** |
| Compress PDFs | Should | Could | **Could** |
| Add/remove passwords | Could | Won't | **Could** |
| Cryptographic digital signatures | Could | Won't | **Won't** (v2) |
| OCR for scanned documents | Should | Should | **Won't** (v2) |
| Edit existing text | Could | Won't | **Won't** (v2, decided) |

## Test tasks for user research (from these profiles)

Used for the wireframe review in Phase 0 and usability rounds in Phases 2, 4, and 7:

| # | Profile | Task |
|---|---|---|
| 1 | Office | Open the supplier contract and find the payment terms. |
| 2 | Office | Fill in the expense form, sign it, and save it. |
| 3 | Office | Combine three invoices into one PDF and remove the blank last page. |
| 4 | Office | Remove the phone number from this document before sharing it. |
| 5 | Student | Open the 400-page textbook and go to Chapter 7. |
| 6 | Student | Highlight two key sentences and add a note to one of them. |
| 7 | Student | Find every mention of "photosynthesis". |
| 8 | Student | Close and reopen the textbook; continue where you stopped. |
| 9 | Student | Review all your highlights from this chapter. |
