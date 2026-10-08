import { useState } from 'react';
import type { OutlineNode } from '@phinpdf/renderer';

export interface OutlineTreeProps {
  readonly nodes: readonly OutlineNode[];
  readonly onSelect: (pageIndex: number) => void;
}

function OutlineItem({
  node,
  onSelect,
  level,
}: {
  node: OutlineNode;
  onSelect: (pageIndex: number) => void;
  level: number;
}) {
  const [open, setOpen] = useState(level === 0);
  const hasChildren = node.children.length > 0;
  return (
    <li role="none">
      <div className="phinpdf-outline-row" style={{ paddingLeft: level * 14 }}>
        {hasChildren ? (
          <button
            type="button"
            className="phinpdf-outline-toggle"
            aria-expanded={open}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${node.title}`}
            onClick={() => {
              setOpen(!open);
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              aria-hidden="true"
              style={{ transform: open ? 'rotate(90deg)' : undefined }}
            >
              <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.5" />
            </svg>
          </button>
        ) : (
          <span className="phinpdf-outline-spacer" />
        )}
        <button
          type="button"
          className="phinpdf-outline-link"
          disabled={node.pageIndex === null}
          onClick={() => {
            if (node.pageIndex !== null) onSelect(node.pageIndex);
          }}
        >
          {node.title}
        </button>
      </div>
      {hasChildren && open && (
        <ul role="group" className="phinpdf-outline-list">
          {node.children.map((child, i) => (
            <OutlineItem key={i} node={child} onSelect={onSelect} level={level + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** The document's bookmarks. Clicking one goes to its page. */
export function OutlineTree({ nodes, onSelect }: OutlineTreeProps) {
  if (nodes.length === 0) return <p className="phinpdf-empty">This document has no bookmarks.</p>;
  return (
    <ul className="phinpdf-outline-list" aria-label="Bookmarks">
      {nodes.map((node, i) => (
        <OutlineItem key={i} node={node} onSelect={onSelect} level={0} />
      ))}
    </ul>
  );
}
