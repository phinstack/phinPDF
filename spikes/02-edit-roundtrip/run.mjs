// Spike 2: edit -> save -> reopen round-trips with three candidate editing engines.
//
// Engines: pdf-lib 1.17.1 (unmaintained since 2022), @cantoo/pdf-lib (maintained fork),
// @embedpdf/pdfium (PDFium compiled to WebAssembly).
//
// Every output file is checked by tools independent of the engine that wrote it:
//   qpdf --check   structural validity
//   PDF.js         annotations / form values are readable (our own renderer)
//   Poppler        renders the annotation (Poppler powers Okular and Evince on Linux)
//
// Usage: node run.mjs <fixturesDir> <outDir>
import * as pdfLibOld from 'pdf-lib';
import * as pdfLibCantoo from '@cantoo/pdf-lib';
import { init as initPdfium } from '@embedpdf/pdfium';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const [fixtures, outDir] = process.argv.slice(2);
await mkdir(outDir, { recursive: true });
const require = createRequire(import.meta.url);
const SRC = join(fixtures, 'tracemonkey.pdf');
const BIG = join(fixtures, 'real-504p.pdf');
const PASSWORD = 'user-pass';
const ms = (t) => Math.round(performance.now() - t);

// ---------------------------------------------------------------------------
// Fixtures: a fillable form (made with pdf-lib) and an AES-256 encrypted copy.
// ---------------------------------------------------------------------------
const FORM = join(outDir, 'fixture-form.pdf');
{
  const d = await pdfLibOld.PDFDocument.create();
  const page = d.addPage([612, 792]);
  const font = await d.embedFont(pdfLibOld.StandardFonts.Helvetica);
  page.drawText('Name:', { x: 50, y: 700, size: 12, font });
  page.drawText('I agree:', { x: 50, y: 650, size: 12, font });
  const form = d.getForm();
  form.createTextField('name').addToPage(page, { x: 120, y: 690, width: 300, height: 24 });
  form.createCheckBox('agree').addToPage(page, { x: 120, y: 645, width: 18, height: 18 });
  await writeFile(FORM, await d.save());
}
const ENC = join(outDir, 'fixture-encrypted.pdf');
spawnSync('qpdf', ['--encrypt', PASSWORD, 'owner-pass', '256', '--', SRC, ENC]);

// Locate real text on page 1 with PDF.js so annotations sit on actual words.
async function textTargets(path) {
  const task = pdfjs.getDocument({ data: new Uint8Array(await readFile(path)) });
  const doc = await task.promise;
  const page = await doc.getPage(1);
  const items = (await page.getTextContent()).items.filter((i) => i.str.trim().length > 12);
  const box = (i) => {
    const [x, y] = [i.transform[4], i.transform[5]];
    return { str: i.str, x, y: y - i.height * 0.25, w: i.width, h: i.height * 1.25 };
  };
  const title = box(items.reduce((a, b) => (b.transform[5] > a.transform[5] ? b : a)));
  const body = box(items[Math.floor(items.length / 2)]);
  const [, , pw, ph] = page.view;
  await task.destroy();
  return { title, body, pw, ph };
}
const T = await textTargets(SRC);

// ---------------------------------------------------------------------------
// Independent verification
// ---------------------------------------------------------------------------
function qpdfCheck(path, password) {
  const r = spawnSync('qpdf', [...(password ? [`--password=${password}`] : []), '--check', path]);
  return r.status === 0 ? 'ok' : r.status === 3 ? 'warnings' : 'ERRORS';
}

async function pdfjsRead(path, password) {
  try {
    const task = pdfjs.getDocument({ data: new Uint8Array(await readFile(path)), password });
    const doc = await task.promise;
    const all = await (await doc.getPage(1)).getAnnotations();
    const annots = all.map((a) => a.subtype);
    // getFieldObjects() is empty under Node, so read values from the widgets.
    const values = Object.fromEntries(all.filter((a) => a.fieldName).map((a) => [a.fieldName, a.fieldValue]));
    await task.destroy();
    return { annots, values };
  } catch (e) {
    return { error: e.message };
  }
}

// Render page 1 with Poppler at 72 dpi (1 px = 1 pt) and count pixels matching a colour
// test inside a PDF-space rectangle.
function popplerCount(path, rect, test, password) {
  const args = ['-r', '72', '-f', '1', '-l', '1', ...(password ? ['-upw', password] : []), path];
  const r = spawnSync('pdftoppm', args, { maxBuffer: 64 * 2 ** 20 });
  if (r.status !== 0) return -1;
  const buf = r.stdout;
  // Parse binary PPM (P6) header.
  let off = 0;
  const tok = () => {
    while (/\s/.test(String.fromCharCode(buf[off]))) off++;
    let s = '';
    while (!/\s/.test(String.fromCharCode(buf[off]))) s += String.fromCharCode(buf[off++]);
    return s;
  };
  tok(); const W = +tok(); const H = +tok(); tok(); off++;
  let n = 0;
  for (let y = Math.max(0, Math.floor(H - rect.y - rect.h)); y < Math.min(H, Math.ceil(H - rect.y)); y++) {
    for (let x = Math.max(0, Math.floor(rect.x)); x < Math.min(W, Math.ceil(rect.x + rect.w)); x++) {
      const i = off + (y * W + x) * 3;
      if (test(buf[i], buf[i + 1], buf[i + 2])) n++;
    }
  }
  return n;
}
const isYellow = (r, g, b) => r > 200 && g > 200 && b < 140;
const isRed = (r, g, b) => r > 180 && g < 90 && b < 90;
const isDark = (r, g, b) => r < 110 && g < 110 && b < 110;

const pdftotext = (path) => spawnSync('pdftotext', ['-f', '1', '-l', '1', path, '-']).stdout.toString();

const INK_RECT = { x: T.pw - 140, y: T.ph - 140, w: 100, h: 100 };
const NOTE_RECT = { x: 20, y: T.ph - 60, w: 22, h: 22 };
const inkPoints = Array.from({ length: 20 }, (_, i) => [INK_RECT.x + i * 5, INK_RECT.y + 50 + 40 * Math.sin(i / 3)]);

const results = {};
const record = (engine, scenario, data) => ((results[engine] ??= {})[scenario] = data);

// ---------------------------------------------------------------------------
// Engine adapter: pdf-lib (both flavours share the same API)
// No annotation API exists, so annotations are built as raw dictionaries,
// including appearance streams (otherwise many viewers draw nothing).
// ---------------------------------------------------------------------------
function pdfLibAdapter(lib) {
  const { PDFDocument, PDFName, PDFString } = lib;

  function addHighlight(doc, page, b, contents) {
    const ctx = doc.context;
    const rect = [b.x, b.y, b.x + b.w, b.y + b.h];
    const ap = ctx.stream(`/GS0 gs 1 0.92 0 rg ${b.x} ${b.y} ${b.w} ${b.h} re f`, {
      Type: 'XObject', Subtype: 'Form', BBox: rect,
      Resources: { ExtGState: { GS0: { Type: 'ExtGState', BM: 'Multiply' } } },
    });
    const annot = ctx.obj({
      Type: 'Annot', Subtype: 'Highlight', Rect: rect, F: 4, C: [1, 0.92, 0],
      QuadPoints: [b.x, b.y + b.h, b.x + b.w, b.y + b.h, b.x, b.y, b.x + b.w, b.y],
      AP: { N: ctx.register(ap) },
    });
    annot.set(PDFName.of('Contents'), PDFString.of(contents));
    annot.set(PDFName.of('T'), PDFString.of('phinPDF spike'));
    page.node.addAnnot(ctx.register(annot));
  }

  function addNote(doc, page, r, contents) {
    const annot = doc.context.obj({
      Type: 'Annot', Subtype: 'Text', Rect: [r.x, r.y, r.x + r.w, r.y + r.h],
      F: 4, C: [1, 0.8, 0], Name: 'Comment', Open: false,
    });
    annot.set(PDFName.of('Contents'), PDFString.of(contents));
    page.node.addAnnot(doc.context.register(annot));
  }

  function addInk(doc, page, pts) {
    const ctx = doc.context;
    const r = INK_RECT;
    const rect = [r.x, r.y, r.x + r.w, r.y + r.h];
    const path = pts.map(([x, y], i) => `${x} ${y} ${i ? 'l' : 'm'}`).join(' ');
    const ap = ctx.stream(`1 0 0 RG 3 w 1 J 1 j ${path} S`, { Type: 'XObject', Subtype: 'Form', BBox: rect });
    const annot = ctx.obj({
      Type: 'Annot', Subtype: 'Ink', Rect: rect, F: 4, C: [1, 0, 0],
      BS: { W: 3 }, InkList: [pts.flat()], AP: { N: ctx.register(ap) },
    });
    page.node.addAnnot(ctx.register(annot));
  }

  return {
    async annotate(bytes, opts = {}) {
      const doc = await PDFDocument.load(bytes, opts);
      const page = doc.getPage(0);
      addHighlight(doc, page, T.title, 'Highlighted title');
      addNote(doc, page, NOTE_RECT, 'Sticky note from phinPDF');
      addInk(doc, page, inkPoints);
      return doc.save();
    },
    async fillForm(bytes) {
      const doc = await PDFDocument.load(bytes);
      const form = doc.getForm();
      form.getTextField('name').setText('Ada Lovelace');
      form.getCheckBox('agree').check();
      return doc.save();
    },
  };
}

// ---------------------------------------------------------------------------
// Engine adapter: PDFium (WebAssembly)
// ---------------------------------------------------------------------------
const P = await initPdfium({ wasmBinary: await readFile(require.resolve('@embedpdf/pdfium/pdfium.wasm')) });
P.PDFiumExt_Init();
const M = P.pdfium;
const malloc = (n) => M.wasmExports.malloc(n);
const free = (p) => M.wasmExports.free(p);
const floats = (arr) => {
  const p = malloc(arr.length * 4);
  arr.forEach((v, i) => M.setValue(p + i * 4, v, 'float'));
  return p;
};
const wide = (s) => {
  const n = (s.length + 1) * 2;
  const p = malloc(n);
  M.stringToUTF16(s, p, n);
  return p;
};
const ANNOT = { TEXT: 1, HIGHLIGHT: 9, INK: 15, REDACT: 28 };

function pdfiumOpen(bytes, password = '') {
  const ptr = malloc(bytes.length);
  M.HEAPU8.set(bytes, ptr);
  const doc = P.FPDF_LoadMemDocument(ptr, bytes.length, password);
  if (!doc) { free(ptr); throw new Error(`PDFium load failed, error ${P.FPDF_GetLastError()}`); }
  return { doc, close: () => { P.FPDF_CloseDocument(doc); free(ptr); } };
}

function pdfiumSave(doc) {
  const w = P.PDFiumExt_OpenFileWriter();
  if (!P.PDFiumExt_SaveAsCopy(doc, w)) throw new Error('PDFium save failed');
  const size = P.PDFiumExt_GetFileWriterSize(w);
  const p = malloc(size);
  P.PDFiumExt_GetFileWriterData(w, p, size);
  const out = M.HEAPU8.slice(p, p + size);
  free(p);
  P.PDFiumExt_CloseFileWriter(w);
  return out;
}

function pdfiumAnnot(page, subtype, r, { color, contents, quad, ink } = {}) {
  const a = P.FPDFPage_CreateAnnot(page, subtype);
  // FS_RECTF is { left, top, right, bottom }.
  const rp = floats([r.x, r.y + r.h, r.x + r.w, r.y]);
  P.FPDFAnnot_SetRect(a, rp); free(rp);
  if (color) P.FPDFAnnot_SetColor(a, 0, ...color, 255);
  if (quad) {
    const qp = floats([r.x, r.y + r.h, r.x + r.w, r.y + r.h, r.x, r.y, r.x + r.w, r.y]);
    P.FPDFAnnot_AppendAttachmentPoints(a, qp); free(qp);
  }
  if (ink) {
    const pp = floats(ink.flat());
    P.FPDFAnnot_AddInkStroke(a, pp, ink.length); free(pp);
  }
  if (contents) { const s = wide(contents); P.FPDFAnnot_SetStringValue(a, 'Contents', s); free(s); }
  P.FPDFAnnot_SetFlags(a, 4); // Print
  const apOk = P.EPDFAnnot_GenerateAppearance(a);
  P.FPDFPage_CloseAnnot(a);
  return apOk;
}

const pdfiumAdapter = {
  async annotate(bytes, { password } = {}) {
    const { doc, close } = pdfiumOpen(bytes, password);
    const page = P.FPDF_LoadPage(doc, 0);
    pdfiumAnnot(page, ANNOT.HIGHLIGHT, T.title, { color: [255, 235, 0], contents: 'Highlighted title', quad: true });
    pdfiumAnnot(page, ANNOT.TEXT, NOTE_RECT, { color: [255, 204, 0], contents: 'Sticky note from phinPDF' });
    pdfiumAnnot(page, ANNOT.INK, INK_RECT, { color: [255, 0, 0], ink: inkPoints });
    P.FPDF_ClosePage(page);
    const out = pdfiumSave(doc);
    close();
    return out;
  },
  async fillForm(bytes) {
    const { doc, close } = pdfiumOpen(bytes);
    const info = P.PDFiumExt_OpenFormFillInfo();
    const form = P.PDFiumExt_InitFormFillEnvironment(doc, info);
    const page = P.FPDF_LoadPage(doc, 0);
    P.FORM_OnAfterLoadPage(page, form);
    const n = P.FPDFPage_GetAnnotCount(page);
    for (let i = 0; i < n; i++) {
      const a = P.FPDFPage_GetAnnot(page, i);
      const len = P.FPDFAnnot_GetFormFieldName(form, a, 0, 0);
      const np = malloc(len);
      P.FPDFAnnot_GetFormFieldName(form, a, np, len);
      const name = M.UTF16ToString(np); free(np);
      if (name === 'name') {
        // Setting the value directly (EPDFAnnot_SetFormFieldValue, even followed by
        // EPDFAnnot_GenerateFormFieldAP) stores the value but leaves the field's
        // appearance blank, so Poppler-based viewers (Okular, Evince) show it empty.
        // Simulating typing makes PDFium redraw the field.
        const val = wide('Ada Lovelace');
        P.FORM_SetFocusedAnnot(form, a);
        P.FORM_SelectAllText(form, page);
        P.FORM_ReplaceSelection(form, page, val);
        P.FORM_ForceToKillFocus(form);
        free(val);
      } else {
        const val = wide('Yes');
        P.EPDFAnnot_SetFormFieldValue(form, a, val); free(val);
      }
      P.FPDFPage_CloseAnnot(a);
    }
    P.FORM_OnBeforeClosePage(page, form);
    P.FPDF_ClosePage(page);
    P.PDFiumExt_ExitFormFillEnvironment(form);
    P.PDFiumExt_CloseFormFillInfo(info);
    const out = pdfiumSave(doc);
    close();
    return out;
  },
  // True redaction: remove the text under a rectangle from the content stream.
  async redact(bytes) {
    const { doc, close } = pdfiumOpen(bytes);
    const page = P.FPDF_LoadPage(doc, 0);
    const b = T.body;
    const rp = floats([b.x, b.y + b.h, b.x + b.w, b.y]);
    const removed = P.EPDFText_RedactInRect(page, rp, true, true);
    free(rp);
    P.FPDFPage_GenerateContent(page);
    P.FPDF_ClosePage(page);
    const out = pdfiumSave(doc);
    close();
    return { out, removed };
  },
};

// ---------------------------------------------------------------------------
// Run scenarios
// ---------------------------------------------------------------------------
const engines = {
  'pdf-lib@1.17.1': pdfLibAdapter(pdfLibOld),
  '@cantoo/pdf-lib': pdfLibAdapter(pdfLibCantoo),
  pdfium: pdfiumAdapter,
};
const srcBytes = await readFile(SRC);
const NAME_FIELD = { x: 122, y: 692, w: 296, h: 20 }; // inside the border
const CHECKBOX = { x: 122, y: 647, w: 14, h: 14 };
const base = {
  yellow: popplerCount(SRC, T.title, isYellow),
  red: popplerCount(SRC, INK_RECT, isRed),
  nameField: popplerCount(FORM, NAME_FIELD, isDark),
  checkbox: popplerCount(FORM, CHECKBOX, isDark),
};

for (const [name, eng] of Object.entries(engines)) {
  const tag = name.replace(/[^a-z0-9]+/gi, '_');

  // A. Annotations
  try {
    const out = join(outDir, `${tag}-annotated.pdf`);
    await writeFile(out, await eng.annotate(srcBytes));
    record(name, 'annotate', {
      qpdf: qpdfCheck(out),
      pdfjs: await pdfjsRead(out),
      popplerHighlightPx: popplerCount(out, T.title, isYellow) - base.yellow,
      popplerInkPx: popplerCount(out, INK_RECT, isRed) - base.red,
    });
  } catch (e) { record(name, 'annotate', { error: e.message }); }

  // B. Form fill
  try {
    const out = join(outDir, `${tag}-form-filled.pdf`);
    await writeFile(out, await eng.fillForm(await readFile(FORM)));
    record(name, 'fillForm', {
      qpdf: qpdfCheck(out),
      pdfjs: (await pdfjsRead(out)).values,
      popplerNameFieldInkPx: popplerCount(out, NAME_FIELD, isDark) - base.nameField,
      popplerCheckmarkPx: popplerCount(out, CHECKBOX, isDark) - base.checkbox,
    });
  } catch (e) { record(name, 'fillForm', { error: e.message }); }

  // C. Encrypted input (AES-256, user password)
  try {
    const out = join(outDir, `${tag}-encrypted-annotated.pdf`);
    await writeFile(out, await eng.annotate(await readFile(ENC), { password: PASSWORD }));
    const r = await pdfjsRead(out);
    const r2 = r.error ? await pdfjsRead(out, PASSWORD) : r;
    record(name, 'encrypted', {
      outputStillEncrypted: !!r.error,
      qpdf: qpdfCheck(out, PASSWORD),
      pdfjs: r2,
      popplerHighlightPx: popplerCount(out, T.title, isYellow, r.error ? PASSWORD : undefined) - base.yellow,
    });
  } catch (e) { record(name, 'encrypted', { error: e.message.split('\n')[0] }); }

  // D. Large document: open 504 pages / 34.7 MB, annotate page 1, save.
  try {
    const big = await readFile(BIG);
    const t = performance.now();
    const outBytes = await eng.annotate(big);
    const out = join(outDir, `${tag}-big.pdf`);
    await writeFile(out, outBytes);
    record(name, 'bigSave', {
      ms: ms(t),
      inMB: +(big.length / 2 ** 20).toFixed(1),
      outMB: +(outBytes.length / 2 ** 20).toFixed(1),
      qpdf: qpdfCheck(out),
    });
  } catch (e) { record(name, 'bigSave', { error: e.message }); }
}

// E. Redaction (PDFium only: pdf-lib cannot edit content streams)
{
  const { out, removed } = await pdfiumAdapter.redact(srcBytes);
  const path = join(outDir, 'pdfium-redacted.pdf');
  await writeFile(path, out);
  const norm = (s) => s.replace(/\s+/g, '');
  const after = norm(pdftotext(path));
  record('pdfium', 'redact', {
    target: T.body.str,
    apiReportedRemoval: removed,
    targetTextStillExtractable: after.includes(norm(T.body.str)),
    titleStillPresent: after.includes(norm(T.title.str)),
    qpdf: qpdfCheck(path),
  });
}

console.log(JSON.stringify({ baselinePopplerPx: base, targets: { title: T.title.str, body: T.body.str }, results }, null, 2));
