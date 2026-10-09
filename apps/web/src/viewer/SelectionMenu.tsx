import { Icon } from '../icons.tsx';

export interface SelectionMenuProps {
  /** Where the selection ends, in viewport coordinates. */
  readonly at: { readonly x: number; readonly y: number };
  readonly onHighlight: () => void;
  readonly onUnderline: () => void;
}

/** Quick actions shown next to selected text, like Acrobat Reader's. */
export function SelectionMenu({ at, onHighlight, onUnderline }: SelectionMenuProps) {
  return (
    <div
      className="selection-menu"
      role="toolbar"
      aria-label="Selected text"
      style={{ left: at.x, top: at.y }}
      // Keep the text selection when the menu is clicked.
      onPointerDown={(e) => {
        e.preventDefault();
      }}
    >
      <button type="button" className="text-button" onClick={onHighlight}>
        <Icon name="highlight" size={16} />
        Highlight
      </button>
      <button type="button" className="text-button" onClick={onUnderline}>
        <Icon name="underline" size={16} />
        Underline
      </button>
    </div>
  );
}
