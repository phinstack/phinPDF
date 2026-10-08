import { describe, expect, it } from 'vitest';
import {
  buildPageText,
  compileQuery,
  findInText,
  firstMatchFrom,
  matchToItemRanges,
} from './search.ts';

describe('findInText', () => {
  const text = 'Photosynthesis. The rate of photosynthesis varies; PHOTOSYNTHESIS!';

  it('is case-insensitive by default', () => {
    expect(findInText(text, 'photosynthesis')).toHaveLength(3);
  });

  it('can match case exactly', () => {
    expect(findInText(text, 'photosynthesis', { caseSensitive: true })).toEqual([
      { start: 28, length: 14 },
    ]);
  });

  it('can require whole words', () => {
    expect(findInText('cat category bobcat cat.', 'cat', { wholeWord: true })).toEqual([
      { start: 0, length: 3 },
      { start: 20, length: 3 },
    ]);
  });

  it('treats whole words with accented letters correctly', () => {
    expect(findInText('café cafés', 'café', { wholeWord: true })).toEqual([
      { start: 0, length: 4 },
    ]);
  });

  it('matches across line breaks and extra spaces', () => {
    expect(findInText('the quick\nbrown   fox', 'quick brown fox')).toEqual([
      { start: 4, length: 17 },
    ]);
  });

  it('matches words a PDF ran together', () => {
    expect(findInText('thequickbrown', 'quick brown')).toEqual([{ start: 3, length: 10 }]);
  });

  it('escapes regular-expression characters in the query', () => {
    expect(findInText('cost (a+b) is $5.00 [approx]', '(a+b)')).toEqual([{ start: 5, length: 5 }]);
    expect(findInText('cost $5.00', '$5.00')).toHaveLength(1);
    expect(findInText('aaaa', '.*')).toEqual([]);
  });

  it('returns nothing for an empty query', () => {
    expect(findInText(text, '   ')).toEqual([]);
    expect(compileQuery('')).toBeNull();
  });

  it('finds non-overlapping matches', () => {
    expect(findInText('aaaa', 'aa')).toEqual([
      { start: 0, length: 2 },
      { start: 2, length: 2 },
    ]);
  });
});

describe('buildPageText and matchToItemRanges', () => {
  const items = [
    { str: 'The quick ', hasEOL: false },
    { str: 'brown', hasEOL: true },
    { str: 'fox jumps', hasEOL: false },
  ];
  const page = buildPageText(items);

  it('joins items, adding newlines at line ends', () => {
    expect(page.text).toBe('The quick brown\nfox jumps');
    expect(page.itemStarts).toEqual([0, 10, 16]);
  });

  it('splits a match that spans several items', () => {
    const [match] = findInText(page.text, 'quick brown fox');
    expect(match).toBeDefined();
    if (!match) return;
    expect(matchToItemRanges(match, page, items)).toEqual([
      { item: 0, start: 4, end: 10 },
      { item: 1, start: 0, end: 5 },
      { item: 2, start: 0, end: 3 },
    ]);
  });

  it('maps a match inside one item', () => {
    expect(matchToItemRanges({ start: 20, length: 5 }, page, items)).toEqual([
      { item: 2, start: 4, end: 9 },
    ]);
  });

  it('ignores the added newline characters', () => {
    expect(matchToItemRanges({ start: 15, length: 1 }, page, items)).toEqual([]);
  });
});

describe('firstMatchFrom', () => {
  const matches = [
    { page: 1, start: 0, length: 1 },
    { page: 4, start: 0, length: 1 },
    { page: 4, start: 5, length: 1 },
  ];

  it('picks the first match on or after the current page', () => {
    expect(firstMatchFrom(matches, 0)).toBe(0);
    expect(firstMatchFrom(matches, 2)).toBe(1);
    expect(firstMatchFrom(matches, 4)).toBe(1);
  });

  it('wraps to the start when no match is later', () => {
    expect(firstMatchFrom(matches, 9)).toBe(0);
  });

  it('returns -1 with no matches', () => {
    expect(firstMatchFrom([], 0)).toBe(-1);
  });
});
