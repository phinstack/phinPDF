// Builds large test PDFs for the render-performance spike.
// Usage: node make-fixtures.mjs <tracemonkey.pdf> <outDir>
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const [src, outDir] = process.argv.slice(2);

// 1. Real-world content: tracemonkey.pdf (14 pages) copied 36x = 504 pages.
const srcDoc = await PDFDocument.load(await readFile(src));
const big = await PDFDocument.create();
for (let i = 0; i < 36; i++) {
  const pages = await big.copyPages(srcDoc, srcDoc.getPageIndices());
  pages.forEach((p) => big.addPage(p));
}
await writeFile(join(outDir, 'real-504p.pdf'), await big.save());

// 2. Synthetic text-heavy document: 1,000 pages x 60 lines.
const syn = await PDFDocument.create();
const font = await syn.embedFont(StandardFonts.Helvetica);
const line = 'The quick brown fox jumps over the lazy dog. Lorem ipsum dolor sit amet, consectetur.';
for (let p = 0; p < 1000; p++) {
  const page = syn.addPage([612, 792]);
  page.drawText(`Page ${p + 1}`, { x: 50, y: 750, size: 16, font });
  for (let l = 0; l < 60; l++) {
    page.drawText(`${l + 1}. ${line}`, { x: 50, y: 720 - l * 11.5, size: 9, font, color: rgb(0.1, 0.1, 0.1) });
  }
}
await writeFile(join(outDir, 'synthetic-1000p.pdf'), await syn.save());
console.log('fixtures written to', outDir);
