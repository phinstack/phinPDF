/**
 * Interoperability: files saved by phinPDF are checked by tools that share no code with
 * it. qpdf checks the file structure and encryption; Poppler (the engine behind Okular
 * and Evince) must draw the annotations. PDF.js (Firefox) is covered by engine.test.ts
 * and PDFium (Chrome, Edge) wrote the file. CI installs both tools and sets
 * PHINPDF_REQUIRE_INTEROP=1 so these tests can't be skipped there.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { init, type WrappedPdfiumModule } from '@embedpdf/pdfium';
import type { Annotation } from '@phinpdf/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyChanges } from './engine.ts';

function hasTool(name: string): boolean {
  try {
    execFileSync(name, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    // pdftoppm prints its version and exits non-zero on some builds.
    try {
      execFileSync(name, ['-v'], { stdio: 'ignore' });
      return true;
    } catch (error) {
      return (error as { status?: number }).status !== undefined;
    }
  }
}

const tools = hasTool('qpdf') && hasTool('pdftoppm');
if (!tools && process.env['PHINPDF_REQUIRE_INTEROP'] === '1') {
  throw new Error('qpdf and pdftoppm (poppler-utils) are required for interop tests');
}

const CORPUS = join(import.meta.dirname, '../../../test-corpus/files');
let pdfium: WrappedPdfiumModule;
let dir: string;

const base = { contents: 'Interop', author: 'phinPDF', modified: '2026-10-09T12:00:00.000Z' };
// Blank area at the bottom of text-1page.pdf, so colours can be sampled without text.
const ANNOTATIONS: Annotation[] = [
  {
    ...base,
    id: 'i-h',
    kind: 'highlight',
    pageIndex: 0,
    color: { r: 255, g: 235, b: 59 },
    rects: [{ x0: 72, y0: 40, x1: 300, y1: 60 }],
  },
  {
    ...base,
    id: 'i-u',
    kind: 'underline',
    pageIndex: 0,
    color: { r: 229, g: 57, b: 53 },
    rects: [{ x0: 72, y0: 80, x1: 300, y1: 100 }],
  },
  {
    ...base,
    id: 'i-n',
    kind: 'note',
    pageIndex: 0,
    color: { r: 100, g: 181, b: 246 },
    rect: { x0: 400, y0: 40, x1: 420, y1: 60 },
  },
];

/** Renders page 1 at 72 dpi with Poppler and returns a pixel reader in PDF coordinates. */
function renderWithPoppler(pdf: string, password?: string) {
  const out = join(dir, 'render');
  const args = ['-r', '72', '-f', '1', '-l', '1', '-singlefile'];
  if (password) args.push('-upw', password);
  execFileSync('pdftoppm', [...args, pdf, out]);
  const ppm = readFileSync(`${out}.ppm`);
  // P6 header: "P6\n<w> <h>\n<max>\n"
  const header = ppm.subarray(0, 50).toString('latin1').split(/\s+/);
  const width = Number(header[1]);
  const height = Number(header[2]);
  const offset = ppm.indexOf(Buffer.from(`${header[3] ?? ''}\n`), 2) + (header[3]?.length ?? 0) + 1;
  return (x: number, y: number) => {
    const i = offset + ((height - Math.round(y)) * width + Math.round(x)) * 3;
    return { r: ppm[i] ?? 0, g: ppm[i + 1] ?? 0, b: ppm[i + 2] ?? 0 };
  };
}

describe.skipIf(!tools)('interoperability (qpdf, Poppler)', () => {
  beforeAll(async () => {
    const require = createRequire(import.meta.url);
    const wasm = readFileSync(require.resolve('@embedpdf/pdfium/pdfium.wasm'));
    pdfium = await init({ wasmBinary: new Uint8Array(wasm).buffer });
    pdfium.PDFiumExt_Init();
    dir = mkdtempSync(join(tmpdir(), 'phinpdf-interop-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function save(file: string, password?: string): string {
    const { bytes } = applyChanges(pdfium, {
      bytes: new Uint8Array(readFileSync(join(CORPUS, file))),
      password,
      changes: ANNOTATIONS.map((annotation) => ({ op: 'create', annotation })),
    });
    const path = join(dir, file.replace('/', '-'));
    writeFileSync(path, bytes);
    return path;
  }

  it('writes files that qpdf finds structurally valid', () => {
    const path = save('normal/text-1page.pdf');
    expect(execFileSync('qpdf', ['--check', path]).toString()).toMatch(
      /No syntax or stream encoding errors/,
    );
  });

  it('keeps AES-256 encryption, as qpdf reports it', () => {
    const path = save('encrypted/aes-256.pdf', 'user');
    const report = execFileSync('qpdf', ['--show-encryption', '--password=user', path]).toString();
    expect(report).toMatch(/R = 6/);
    expect(report).toMatch(/AESv3/);
  });

  it('draws highlights, underlines, and notes in Poppler', () => {
    const pixel = renderWithPoppler(save('normal/text-1page.pdf'));
    // Highlight: yellow over white.
    const yellow = pixel(150, 50);
    expect(yellow.r).toBeGreaterThan(230);
    expect(yellow.b).toBeLessThan(120);
    // Underline: red at the bottom of its line, white above.
    const line = [80, 80.5, 81, 81.5, 82].map((y) => pixel(150, y));
    expect(line.some((p) => p.r > 180 && p.g < 120 && p.b < 120)).toBe(true);
    expect(pixel(150, 95)).toEqual({ r: 255, g: 255, b: 255 });
    // Note icon: not plain white where the icon is drawn.
    const icon = [44, 48, 52, 56].flatMap((y) => [403, 408, 413].map((x) => pixel(x, y)));
    expect(icon.some((p) => !(p.r === 255 && p.g === 255 && p.b === 255))).toBe(true);
  });

  it('draws annotations in encrypted files with the password', () => {
    const pixel = renderWithPoppler(save('encrypted/aes-256.pdf', 'user'), 'user');
    expect(pixel(150, 50).b).toBeLessThan(120);
  });
});
