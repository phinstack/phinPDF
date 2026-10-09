import { rgbToCss, type Annotation } from '@phinpdf/core';
import { Icon, type IconName } from '../icons.tsx';

const ICONS: Readonly<Record<Annotation['kind'], IconName>> = {
  highlight: 'highlight',
  underline: 'underline',
  note: 'note',
};
const NAMES: Readonly<Record<Annotation['kind'], string>> = {
  highlight: 'Highlight',
  underline: 'Underline',
  note: 'Note',
};

export interface CommentsPanelProps {
  readonly annotations: readonly Annotation[];
  readonly selectedId: string | null;
  readonly loaded: boolean;
  readonly onSelect: (annotation: Annotation) => void;
}

/** Every highlight, underline, and note in page order: the keyboard path to each one. */
export function CommentsPanel({ annotations, selectedId, loaded, onSelect }: CommentsPanelProps) {
  const sorted = annotations.toSorted((a, b) => a.pageIndex - b.pageIndex);
  if (sorted.length === 0) {
    return <p className="phinpdf-empty">{loaded ? 'No comments yet.' : 'Loading…'}</p>;
  }
  return (
    <ul className="comments" aria-label="Comments">
      {sorted.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            aria-current={a.id === selectedId ? 'true' : undefined}
            onClick={() => {
              onSelect(a);
            }}
          >
            <span className="comment-kind" style={{ color: rgbToCss(a.color) }}>
              <Icon name={ICONS[a.kind]} size={16} />
            </span>
            <span className="comment-text">
              <span className="comment-title">
                {NAMES[a.kind]} · Page {a.pageIndex + 1}
              </span>
              <span className="comment-body">{a.contents.trim() || 'No comment'}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
