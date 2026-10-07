// License policy from ADR-0001, shared by the checker and its tests.

/** SPDX identifiers allowed for anything we distribute. */
export const ALLOWED = new Set([
  '0BSD',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BlueOak-1.0.0',
  'BSL-1.0',
  'CC0-1.0',
  'ISC',
  'MIT',
  'MIT-0',
  'MPL-2.0',
  'Unicode-3.0',
  'Unicode-DFS-2016',
  'Unlicense',
  'Zlib',
]);

/** Allowed `WITH` exceptions (they only add permissions). */
export const ALLOWED_EXCEPTIONS = new Set(['LLVM-exception']);

/**
 * Evaluates an SPDX license expression. `OR` needs one allowed side, `AND` needs both.
 * Unknown or malformed expressions are not allowed.
 */
export function isAllowed(expression) {
  if (typeof expression !== 'string' || expression.trim() === '') return false;
  const tokens = expression.replace(/[()]/g, ' $& ').trim().split(/\s+/);
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function primary() {
    const tok = next();
    if (tok === '(') {
      const value = or();
      if (next() !== ')') throw new Error('unbalanced parentheses');
      return value;
    }
    if (!tok || ['AND', 'OR', 'WITH', ')'].includes(tok)) throw new Error(`unexpected ${tok}`);
    let ok = ALLOWED.has(tok.replace(/\+$/, ''));
    if (peek() === 'WITH') {
      next();
      ok = ok && ALLOWED_EXCEPTIONS.has(next() ?? '');
    }
    return ok;
  }
  function and() {
    let value = primary();
    while (peek() === 'AND') {
      next();
      value = primary() && value;
    }
    return value;
  }
  function or() {
    let value = and();
    while (peek() === 'OR') {
      next();
      value = and() || value;
    }
    return value;
  }

  try {
    const value = or();
    return pos === tokens.length && value;
  } catch {
    return false;
  }
}
