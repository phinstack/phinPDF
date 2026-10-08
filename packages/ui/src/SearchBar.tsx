import { useEffect, useRef, type KeyboardEvent } from 'react';

export interface SearchBarProps {
  readonly query: string;
  readonly caseSensitive: boolean;
  readonly wholeWord: boolean;
  /** 0-based index of the selected match, or -1. */
  readonly currentIndex: number;
  readonly total: number;
  /** Pages scanned so far, and the page count. */
  readonly scanned: number;
  readonly pageCount: number;
  readonly onQueryChange: (query: string) => void;
  readonly onOptionsChange: (options: { caseSensitive: boolean; wholeWord: boolean }) => void;
  readonly onNext: () => void;
  readonly onPrevious: () => void;
  readonly onClose: () => void;
  /** Changes whenever the bar should take focus (for example on Ctrl+F). */
  readonly focusKey: number;
}

/** The find bar: query, match count, next/previous, and options. */
export function SearchBar({
  query,
  caseSensitive,
  wholeWord,
  currentIndex,
  total,
  scanned,
  pageCount,
  onQueryChange,
  onOptionsChange,
  onNext,
  onPrevious,
  onClose,
  focusKey,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusKey]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) onPrevious();
      else onNext();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  const searching = query.trim() !== '' && scanned < pageCount;
  let status = '';
  if (query.trim() !== '') {
    status =
      total === 0
        ? searching
          ? 'Searching…'
          : 'No matches'
        : `${String(currentIndex + 1)} of ${String(total)}`;
  }

  return (
    <div role="search" className="phinpdf-searchbar">
      <label className="phinpdf-field">
        <span>Find</span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          aria-label="Find in document"
          spellCheck={false}
          onChange={(e) => {
            onQueryChange(e.target.value);
          }}
          onKeyDown={onKeyDown}
        />
      </label>
      <span className="phinpdf-search-count" aria-live="polite">
        {status}
      </span>
      <button
        type="button"
        className="icon"
        aria-label="Previous match"
        onClick={onPrevious}
        disabled={total === 0}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 15l-6-6-6 6" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>
      <button
        type="button"
        className="icon"
        aria-label="Next match"
        onClick={onNext}
        disabled={total === 0}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>
      <label className="phinpdf-check">
        <input
          type="checkbox"
          checked={caseSensitive}
          onChange={(e) => {
            onOptionsChange({ caseSensitive: e.target.checked, wholeWord });
          }}
        />
        Match case
      </label>
      <label className="phinpdf-check">
        <input
          type="checkbox"
          checked={wholeWord}
          onChange={(e) => {
            onOptionsChange({ caseSensitive, wholeWord: e.target.checked });
          }}
        />
        Whole words
      </label>
      {searching && (
        <span className="phinpdf-search-progress">
          Searching page {scanned + 1} of {pageCount}…
        </span>
      )}
      <button type="button" className="icon" aria-label="Close search" onClick={onClose}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>
    </div>
  );
}
