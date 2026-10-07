#!/usr/bin/env node
// Fails if any production npm dependency has a license outside the ADR-0001 allowlist.
// Development-only tools are reported but don't fail the check: they are never shipped.
// Rust dependencies are checked separately by `cargo deny` (apps/desktop/src-tauri/deny.toml).
import { execFileSync } from 'node:child_process';
import { isAllowed } from './licenses.mjs';

function list(prod) {
  const out = execFileSync('pnpm', ['licenses', 'list', '--json', prod ? '--prod' : '--dev'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const byLicense = JSON.parse(out);
  return Object.entries(byLicense).flatMap(([license, pkgs]) =>
    pkgs.map((p) => ({ name: p.name, versions: p.versions ?? [p.version], license })),
  );
}

const prod = list(true).filter((p) => !isAllowed(p.license));
const dev = list(false).filter((p) => !isAllowed(p.license));

for (const p of dev) {
  console.warn(`warning (dev only): ${p.name}@${p.versions.join(',')} is "${p.license}"`);
}
if (prod.length > 0) {
  for (const p of prod) {
    console.error(`NOT ALLOWED: ${p.name}@${p.versions.join(',')} is "${p.license}"`);
  }
  console.error('\nSee docs/adr/0001-license-and-dependency-policy.md');
  process.exit(1);
}
console.log('All production dependencies use allowed licenses.');
