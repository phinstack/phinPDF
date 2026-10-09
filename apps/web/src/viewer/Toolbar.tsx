import { useLayoutEffect, useState, type RefObject, type SyntheticEvent } from 'react';
import { formatZoom, type Rgb, type ZoomMode } from '@phinpdf/core';
import type { AnnotationTool } from '@phinpdf/ui';
import { Icon, type IconName } from '../icons.tsx';
import { ColorPicker } from './ColorPicker.tsx';

const PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

export interface ToolbarProps {
  readonly fileName: string;
  readonly pageIndex: number;
  readonly pageCount: number;
  readonly zoom: number;
  readonly zoomMode: ZoomMode;
  readonly sidebarOpen: boolean;
  readonly searchOpen: boolean;
  readonly pageInputRef: RefObject<HTMLInputElement | null>;
  readonly onOpen: () => void;
  readonly onPrint: () => void;
  readonly onGoToPage: (index: number) => void;
  readonly onZoomMode: (mode: ZoomMode) => void;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onRotate: () => void;
  readonly onToggleSidebar: () => void;
  readonly onToggleSearch: () => void;
  readonly tool: AnnotationTool;
  readonly toolColor: Rgb;
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel?: string | undefined;
  readonly redoLabel?: string | undefined;
  readonly onTool: (tool: AnnotationTool) => void;
  readonly onToolColor: (color: Rgb) => void;
  readonly onSave: () => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
}

const TOOLS: readonly { tool: AnnotationTool; label: string; icon: IconName; hint: string }[] = [
  { tool: 'highlight', label: 'Highlight', icon: 'highlight', hint: 'Select text to highlight it' },
  { tool: 'underline', label: 'Underline', icon: 'underline', hint: 'Select text to underline it' },
  { tool: 'note', label: 'Sticky note', icon: 'note', hint: 'Click the page to add a note' },
];

function zoomValue(mode: ZoomMode): string {
  return mode.kind === 'scale' ? `scale:${String(mode.scale)}` : mode.kind;
}

function parseZoomValue(value: string): ZoomMode {
  if (value === 'auto' || value === 'fit-width' || value === 'fit-page') return { kind: value };
  return { kind: 'scale', scale: Number(value.slice('scale:'.length)) };
}

/** The page number box. Shows the current page; typing a number and Enter jumps there. */
function PageBox({
  pageIndex,
  pageCount,
  inputRef,
  onGoToPage,
}: Pick<ToolbarProps, 'pageIndex' | 'pageCount' | 'onGoToPage'> & {
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  // While the box has focus it shows `draft`, not the live page number, so a scroll that
  // is still settling can't rewrite the field (and lose the selection) as the user types.
  const [draft, setDraft] = useState<string | null>(null);
  // Select the text after React has written the new value (writing it clears a selection).
  const [selectKey, setSelectKey] = useState(0);
  useLayoutEffect(() => {
    if (selectKey > 0) inputRef.current?.select();
  }, [selectKey, inputRef]);
  const go = (): number | null => {
    const n = Number.parseInt(draft ?? '', 10);
    if (!Number.isFinite(n)) return null;
    const page = Math.min(Math.max(n, 1), pageCount);
    onGoToPage(page - 1);
    return page;
  };
  /** Enter: jump, and keep the box focused with the new page selected for the next jump. */
  const submit = (event: SyntheticEvent): void => {
    event.preventDefault();
    const page = go();
    setDraft(String(page ?? pageIndex + 1));
    setSelectKey((k) => k + 1);
  };
  return (
    <form className="page-box" onSubmit={submit}>
      <input
        ref={inputRef}
        className="page-input"
        inputMode="numeric"
        aria-label="Page number"
        aria-keyshortcuts="Control+Shift+N"
        value={draft ?? String(pageIndex + 1)}
        onFocus={(e) => {
          setDraft(String(pageIndex + 1));
          e.target.select();
        }}
        onChange={(e) => {
          setDraft(e.target.value);
        }}
        onBlur={() => {
          if (draft !== String(pageIndex + 1)) go();
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
      />
      <span className="page-count">/ {pageCount}</span>
    </form>
  );
}

/** The viewer toolbar (wireframe 2): file, pages, zoom, rotate, comment tools, search. */
export function Toolbar(props: ToolbarProps) {
  const { pageIndex, pageCount, zoom, zoomMode } = props;
  const custom = zoomMode.kind === 'scale' && !PRESETS.includes(zoomMode.scale);
  return (
    <header className="toolbar" aria-label="Toolbar">
      <button
        type="button"
        className="icon"
        aria-label={props.sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        aria-pressed={props.sidebarOpen}
        onClick={props.onToggleSidebar}
      >
        <Icon name="sidebar" />
      </button>
      <h1 className="brand">phinPDF</h1>
      <div className="group">
        <button
          type="button"
          className="text-button"
          onClick={props.onOpen}
          aria-keyshortcuts="Control+O"
        >
          <Icon name="open" size={16} />
          Open
        </button>
        <button
          type="button"
          className="icon"
          aria-label={props.saving ? 'Saving…' : 'Save'}
          aria-keyshortcuts="Control+S"
          title={props.dirty ? 'Save changes (Ctrl+S)' : 'No unsaved changes'}
          disabled={!props.dirty || props.saving}
          onClick={props.onSave}
        >
          <Icon name="save" />
        </button>
        <button
          type="button"
          className="icon"
          aria-label="Print"
          aria-keyshortcuts="Control+P"
          onClick={props.onPrint}
        >
          <Icon name="print" />
        </button>
      </div>
      <span className="sep" />
      <div className="group" role="group" aria-label="Pages">
        <button
          type="button"
          className="icon"
          aria-label="Previous page"
          disabled={pageIndex <= 0}
          onClick={() => {
            props.onGoToPage(pageIndex - 1);
          }}
        >
          <Icon name="prev" />
        </button>
        <PageBox
          pageIndex={pageIndex}
          pageCount={pageCount}
          inputRef={props.pageInputRef}
          onGoToPage={props.onGoToPage}
        />
        <button
          type="button"
          className="icon"
          aria-label="Next page"
          disabled={pageIndex >= pageCount - 1}
          onClick={() => {
            props.onGoToPage(pageIndex + 1);
          }}
        >
          <Icon name="next" />
        </button>
      </div>
      <span className="sep" />
      <div className="group" role="group" aria-label="Zoom">
        <button
          type="button"
          className="icon"
          aria-label="Zoom out"
          aria-keyshortcuts="Control+-"
          onClick={props.onZoomOut}
        >
          <Icon name="minus" />
        </button>
        <select
          className="zoom-select"
          aria-label={`Zoom level, ${formatZoom(zoom)}`}
          value={zoomValue(zoomMode)}
          onChange={(e) => {
            props.onZoomMode(parseZoomValue(e.target.value));
          }}
        >
          <option value="auto">Automatic ({formatZoom(zoom)})</option>
          <option value="fit-width">Fit width</option>
          <option value="fit-page">Fit page</option>
          {custom && <option value={zoomValue(zoomMode)}>{formatZoom(zoom)}</option>}
          {PRESETS.map((p) => (
            <option key={p} value={`scale:${String(p)}`}>
              {formatZoom(p)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="icon"
          aria-label="Zoom in"
          aria-keyshortcuts="Control+="
          onClick={props.onZoomIn}
        >
          <Icon name="plus" />
        </button>
      </div>
      <button type="button" className="icon" aria-label="Rotate clockwise" onClick={props.onRotate}>
        <Icon name="rotate" />
      </button>
      <span className="sep" />
      <div className="group" role="group" aria-label="Comment tools">
        {TOOLS.map(({ tool, label, icon, hint }) => (
          <button
            key={tool}
            type="button"
            className="icon"
            aria-label={label}
            aria-pressed={props.tool === tool}
            title={`${label}: ${hint}`}
            onClick={() => {
              props.onTool(props.tool === tool ? 'select' : tool);
            }}
          >
            <Icon name={icon} />
          </button>
        ))}
        <ColorPicker
          value={props.toolColor}
          onChange={props.onToolColor}
          label={`${TOOLS.find((t) => t.tool === props.tool)?.label ?? 'Highlight'} colour`}
        />
      </div>
      <div className="group" role="group" aria-label="History">
        <button
          type="button"
          className="icon"
          aria-label={props.undoLabel ? `Undo ${props.undoLabel}` : 'Undo'}
          aria-keyshortcuts="Control+Z"
          disabled={!props.canUndo}
          onClick={props.onUndo}
        >
          <Icon name="undo" />
        </button>
        <button
          type="button"
          className="icon"
          aria-label={props.redoLabel ? `Redo ${props.redoLabel}` : 'Redo'}
          aria-keyshortcuts="Control+Y"
          disabled={!props.canRedo}
          onClick={props.onRedo}
        >
          <Icon name="redo" />
        </button>
      </div>
      <span className="file-name" title={props.fileName}>
        {props.dirty && (
          <span className="dirty" aria-label="Unsaved changes" title="Unsaved changes">
            •{' '}
          </span>
        )}
        {props.fileName}
      </span>
      <button
        type="button"
        className="icon"
        aria-label="Search"
        aria-keyshortcuts="Control+F"
        aria-pressed={props.searchOpen}
        onClick={props.onToggleSearch}
      >
        <Icon name="search" />
      </button>
    </header>
  );
}
