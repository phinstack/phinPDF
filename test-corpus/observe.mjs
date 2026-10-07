#!/usr/bin/env node
// Records how the renderer handles each corpus file that has no hand-written expectation.
// Review the output before committing: it becomes the regression baseline.
// Usage: CORPUS_OBSERVE=1 node test-corpus/generate.mjs
//        node --experimental-transform-types test-corpus/observe.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDocument, OpenError } from '../packages/renderer/src/index.ts';

const ROOT = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const observed = {};
for (const entry of manifest.filter((e) => e.expect === null || e.expect === undefined)) {
  const bytes = new Uint8Array(readFileSync(join(ROOT, 'files', entry.file)));
  const started = performance.now();
  let result;
  try {
    const doc = await openDocument(bytes);
    result = { opens: true, pages: doc.numPages };
    await doc.destroy();
  } catch (error) {
    result = { opens: error instanceof OpenError ? error.code : `unexpected: ${String(error)}` };
  }
  const ms = Math.round(performance.now() - started);
  observed[entry.file] = result;
  console.log(entry.file.padEnd(38), JSON.stringify(result), `${ms} ms`);
}
writeFileSync(join(ROOT, 'observed.json'), `${JSON.stringify(observed, null, 2)}\n`);
