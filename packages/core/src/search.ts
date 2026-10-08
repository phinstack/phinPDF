export interface SearchOptions {
  readonly caseSensitive?: boolean;
  readonly wholeWord?: boolean;
}

/** A match inside one page's text. */
export interface TextMatch {
  readonly start: number;
  readonly length: number;
}

/** A match in the document. `page` is a 0-based page index. */
export interface DocumentMatch extends TextMatch {
  readonly page: number;
}

/** A piece of text as PDF.js extracts it (one text run on the page). */
export interface TextItem {
  readonly str: string;
  readonly hasEOL?: boolean;
}

/** A page's searchable text and where each text item starts within it. */
export interface PageText {
  readonly text: string;
  readonly itemStarts: readonly number[];
}

/** Joins a page's text items. Items that end a line get a newline after them. */
export function buildPageText(items: readonly TextItem[]): PageText {
  const itemStarts: number[] = [];
  let text = '';
  for (const item of items) {
    itemStarts.push(text.length);
    text += item.str + (item.hasEOL ? '\n' : '');
  }
  return { text, itemStarts };
}

const WORD_CHAR = '[\\p{L}\\p{N}_]';

/**
 * Builds the regular expression for a query. Runs of whitespace in the query match any
 * run of whitespace (or none, where a PDF has split a word across lines). Returns null
 * for an empty query.
 */
export function compileQuery(query: string, options: SearchOptions = {}): RegExp | null {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
  const body = options.wholeWord ? `(?<!${WORD_CHAR})${escaped}(?!${WORD_CHAR})` : escaped;
  // The pattern is built only from escaped user text plus fixed fragments.
  // eslint-disable-next-line security/detect-non-literal-regexp
  return new RegExp(body, `gu${options.caseSensitive ? '' : 'i'}`);
}

/** All non-overlapping matches of `query` in `text`. */
export function findInText(text: string, query: string, options: SearchOptions = {}): TextMatch[] {
  const regex = compileQuery(query, options);
  if (!regex) return [];
  const matches: TextMatch[] = [];
  for (const m of text.matchAll(regex)) {
    if (m[0].length > 0) matches.push({ start: m.index, length: m[0].length });
  }
  return matches;
}

/** The part of a match that falls inside one text item, in that item's own offsets. */
export interface ItemRange {
  readonly item: number;
  readonly start: number;
  readonly end: number;
}

/** Splits a match into per-item ranges so each text-layer span can be highlighted. */
export function matchToItemRanges(
  match: TextMatch,
  page: PageText,
  items: readonly TextItem[],
): ItemRange[] {
  const ranges: ItemRange[] = [];
  const matchEnd = match.start + match.length;
  for (let i = 0; i < items.length; i++) {
    const itemStart = page.itemStarts[i] ?? 0;
    const itemEnd = itemStart + (items[i]?.str.length ?? 0);
    if (itemEnd <= match.start) continue;
    if (itemStart >= matchEnd) break;
    const start = Math.max(match.start, itemStart) - itemStart;
    const end = Math.min(matchEnd, itemEnd) - itemStart;
    if (end > start) ranges.push({ item: i, start, end });
  }
  return ranges;
}

/**
 * Index of the match to select first: the first one on or after `fromPage`, wrapping to
 * the start of the document. Returns -1 when there are no matches.
 */
export function firstMatchFrom(matches: readonly DocumentMatch[], fromPage: number): number {
  if (matches.length === 0) return -1;
  const index = matches.findIndex((m) => m.page >= fromPage);
  return index === -1 ? 0 : index;
}
