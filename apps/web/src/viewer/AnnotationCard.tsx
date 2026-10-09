import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Annotation, Rgb } from '@phinpdf/core';
import { Icon } from '../icons.tsx';
import { ColorSwatches } from './ColorPicker.tsx';

const TITLES: Readonly<Record<Annotation['kind'], string>> = {
  highlight: 'Highlight',
  underline: 'Underline',
  note: 'Sticky note',
};

export interface AnnotationCardProps {
  readonly annotation: Annotation;
  /** Focus the comment box when the card opens (for a note that was just placed). */
  readonly focusComment: boolean;
  readonly onColor: (color: Rgb) => void;
  readonly onContents: (contents: string) => void;
  readonly onDelete: () => void;
  readonly onClose: () => void;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Details of the selected annotation: colour, comment, delete. The comment is saved as one
 * undo step when the box loses focus, on Ctrl+Enter, or when the card closes.
 */
export function AnnotationCard({
  annotation,
  focusComment,
  onColor,
  onContents,
  onDelete,
  onClose,
}: AnnotationCardProps) {
  const [draft, setDraft] = useState(annotation.contents);
  const textRef = useRef<HTMLTextAreaElement>(null);
  // Commit through a ref so the unmount cleanup sees the latest draft and callback.
  const latest = useRef({ draft, contents: annotation.contents, onContents });
  useLayoutEffect(() => {
    latest.current = { draft, contents: annotation.contents, onContents };
  });
  const commit = (): void => {
    const { draft: text, contents, onContents: save } = latest.current;
    if (text !== contents) save(text);
  };

  // Undo/redo can change the comment underneath the card: show the new text.
  const [shown, setShown] = useState(annotation.contents);
  if (shown !== annotation.contents) {
    setShown(annotation.contents);
    setDraft(annotation.contents);
  }

  useEffect(() => {
    if (focusComment) textRef.current?.focus();
  }, [focusComment, annotation.id]);

  useEffect(
    () => () => {
      const { draft: text, contents, onContents: save } = latest.current;
      if (text !== contents) save(text);
    },
    [],
  );

  const titleId = `card-title-${annotation.id}`;
  const date = formatDate(annotation.modified);
  return (
    <section className="annotation-card" aria-labelledby={titleId}>
      <header>
        <h2 id={titleId}>
          {TITLES[annotation.kind]}
          <span className="card-page">Page {annotation.pageIndex + 1}</span>
        </h2>
        <button
          type="button"
          className="icon"
          aria-label="Delete"
          title="Delete (Del)"
          onClick={onDelete}
        >
          <Icon name="trash" />
        </button>
        <button
          type="button"
          className="icon"
          aria-label="Close"
          title="Close (Esc)"
          onClick={() => {
            commit();
            onClose();
          }}
        >
          <Icon name="close" />
        </button>
      </header>
      {(annotation.author || date) && (
        <p className="card-meta">{[annotation.author, date].filter(Boolean).join(' · ')}</p>
      )}
      <ColorSwatches value={annotation.color} onChange={onColor} label="Colour" />
      <label className="card-comment">
        <span>Comment</span>
        <textarea
          ref={textRef}
          rows={4}
          value={draft}
          placeholder="Add a comment"
          onChange={(e) => {
            setDraft(e.target.value);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              commit();
              onClose();
            }
          }}
        />
      </label>
    </section>
  );
}
