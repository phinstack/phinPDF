import { describe, expect, it } from 'vitest';
import { isAllowed } from './licenses.mjs';

describe('isAllowed (ADR-0001 license policy)', () => {
  it.each([
    'MIT',
    'Apache-2.0',
    'Apache-2.0 OR MIT',
    '(MIT OR Apache-2.0) AND Unicode-3.0',
    'MIT AND Zlib',
    'Apache-2.0 WITH LLVM-exception',
    'MIT OR GPL-3.0-only',
    'LGPL-2.1-or-later OR MIT OR Apache-2.0',
    'BSD-3-Clause',
  ])('allows %s', (expr) => {
    expect(isAllowed(expr)).toBe(true);
  });

  it.each([
    'GPL-3.0-only',
    'AGPL-3.0-or-later',
    'LGPL-2.1-only',
    'MIT AND GPL-2.0-only',
    'SSPL-1.0',
    'BUSL-1.1',
    'CC-BY-NC-4.0',
    'GPL-2.0-only WITH Classpath-exception-2.0',
    'MIT WITH Some-unknown-exception',
    'UNLICENSED',
    'Unknown',
    '',
    '(MIT',
    'MIT OR',
  ])('rejects %s', (expr) => {
    expect(isAllowed(expr)).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isAllowed(undefined)).toBe(false);
    expect(isAllowed(null)).toBe(false);
  });
});
