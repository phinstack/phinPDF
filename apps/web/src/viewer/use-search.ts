import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildPageText,
  findInText,
  firstMatchFrom,
  matchToItemRanges,
  type DocumentMatch,
  type PageText,
  type SearchOptions,
} from '@phinpdf/core';
import type { PageTextItem, RenderDocument } from '@phinpdf/renderer';
import type { PageHighlights } from '@phinpdf/ui';

type TextSource = Pick<RenderDocument, 'getTextItems' | 'numPages'>;

interface PageEntry {
  readonly items: readonly PageTextItem[];
  readonly text: PageText;
}

interface Results {
  readonly matches: readonly DocumentMatch[];
  readonly scanned: number;
  readonly currentIndex: number;
}

const EMPTY: Results = { matches: [], scanned: 0, currentIndex: -1 };
/** Pages scanned between screen updates. */
const BATCH = 16;
const DEBOUNCE_MS = 200;

export interface SearchState {
  readonly query: string;
  readonly options: Required<SearchOptions>;
  readonly matches: readonly DocumentMatch[];
  readonly currentIndex: number;
  readonly current: DocumentMatch | undefined;
  readonly scanned: number;
  readonly highlights: ReadonlyMap<number, PageHighlights>;
  readonly setQuery: (query: string) => void;
  readonly setOptions: (options: Required<SearchOptions>) => void;
  readonly next: () => void;
  readonly previous: () => void;
}

/**
 * Searches the whole document as the user types. Pages are scanned in the background in
 * batches, so matches appear while long documents are still being searched. Page text is
 * cached per document, so changing the query doesn't re-extract text.
 */
export function useSearch(doc: TextSource, startPage: number, active: boolean): SearchState {
  const [query, setQueryState] = useState('');
  const [options, setOptions] = useState<Required<SearchOptions>>({
    caseSensitive: false,
    wholeWord: false,
  });
  const [results, setResults] = useState<Results>(EMPTY);
  const cache = useRef(new Map<number, PageEntry>());
  const startPageRef = useRef(startPage);
  useEffect(() => {
    startPageRef.current = startPage;
  }, [startPage]);

  useEffect(() => {
    cache.current = new Map();
  }, [doc]);

  const setQuery = useCallback((value: string) => {
    setQueryState(value);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // A function, so type narrowing doesn't assume the flag can't change between awaits.
    const aborted = (): boolean => controller.signal.aborted;
    const timer = setTimeout(() => {
      void (async () => {
        if (!active || query.trim() === '') {
          setResults(EMPTY);
          return;
        }
        const from = startPageRef.current;
        let matches: DocumentMatch[] = [];
        let currentIndex = -1;
        setResults({ matches: [], scanned: 0, currentIndex: -1 });
        for (let page = 0; page < doc.numPages; page++) {
          let entry = cache.current.get(page);
          if (!entry) {
            try {
              const items = await doc.getTextItems(page + 1);
              entry = { items, text: buildPageText(items) };
            } catch {
              entry = { items: [], text: buildPageText([]) };
            }
            cache.current.set(page, entry);
          }
          if (aborted()) return;
          const found = findInText(entry.text.text, query, options);
          if (found.length > 0) matches = [...matches, ...found.map((m) => ({ ...m, page }))];
          // Select the first match on or after the page the reader was on, as soon as it appears.
          if (currentIndex === -1) {
            const index = matches.findIndex((m) => m.page >= from);
            if (index !== -1) currentIndex = index;
          }
          const done = page === doc.numPages - 1;
          if (done && currentIndex === -1) currentIndex = firstMatchFrom(matches, from);
          if (done || (page + 1) % BATCH === 0) {
            setResults({ matches, scanned: page + 1, currentIndex });
            await new Promise((r) => setTimeout(r, 0)); // let the page repaint
            if (aborted()) return;
          }
        }
      })();
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [doc, query, options, active]);

  const step = useCallback((delta: number) => {
    setResults((r) =>
      r.matches.length === 0
        ? r
        : { ...r, currentIndex: (r.currentIndex + delta + r.matches.length) % r.matches.length },
    );
  }, []);
  const next = useCallback(() => {
    step(1);
  }, [step]);
  const previous = useCallback(() => {
    step(-1);
  }, [step]);

  const highlights = useMemo(() => {
    const map = new Map<
      number,
      { itemCount: number; matches: PageHighlights['matches'][number][] }
    >();
    results.matches.forEach((match, index) => {
      const entry = cache.current.get(match.page);
      if (!entry) return;
      const page = map.get(match.page) ?? { itemCount: entry.items.length, matches: [] };
      page.matches.push({
        ranges: matchToItemRanges(match, entry.text, entry.items),
        current: index === results.currentIndex,
      });
      map.set(match.page, page);
    });
    return map;
  }, [results]);

  return {
    query,
    options,
    matches: results.matches,
    currentIndex: results.currentIndex,
    current: results.matches[results.currentIndex],
    scanned: query.trim() === '' ? doc.numPages : results.scanned,
    highlights,
    setQuery,
    setOptions,
    next,
    previous,
  };
}
