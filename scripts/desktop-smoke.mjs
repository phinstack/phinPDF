#!/usr/bin/env node
// Launches the e2e build of the desktop app with a PDF, waits for its E2E_RESULT line,
// and exits non-zero unless the app rendered the file and every lockdown check held.
// Build first: pnpm --filter @phinpdf/desktop tauri build --debug --features e2e \
//              --config src-tauri/tauri.e2e.conf.json --no-bundle
// Usage: node scripts/desktop-smoke.mjs [file.pdf]
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const TIMEOUT_MS = 120_000;
const root = resolve(import.meta.dirname, '..');
const exe = join(
  root,
  'apps/desktop/src-tauri/target/debug',
  process.platform === 'win32' ? 'phinpdf.exe' : 'phinpdf',
);
const pdf = resolve(process.argv[2] ?? join(root, 'test-corpus/files/normal/text-10pages.pdf'));

if (!existsSync(exe)) {
  console.error(`Desktop e2e build not found at ${exe}`);
  process.exit(2);
}

// Linux CI has no display; run under a virtual X server.
const useXvfb = process.platform === 'linux' && !process.env['DISPLAY'];
const [cmd, args] = useXvfb ? ['xvfb-run', ['-a', exe, pdf]] : [exe, [pdf]];

const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'] });
let output = '';
child.stdout.on('data', (chunk) => {
  output += chunk;
});

const timer = setTimeout(() => {
  console.error(`Timed out after ${TIMEOUT_MS / 1000}s`);
  child.kill();
  process.exit(1);
}, TIMEOUT_MS);

child.on('exit', (code) => {
  clearTimeout(timer);
  const line = output.split(/\r?\n/).find((l) => l.startsWith('E2E_RESULT '));
  if (!line) {
    console.error(`No E2E_RESULT from the app (exit code ${code}). Output:\n${output}`);
    process.exit(1);
  }
  const result = JSON.parse(line.slice('E2E_RESULT '.length));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok === true && code === 0 ? 0 : 1);
});
