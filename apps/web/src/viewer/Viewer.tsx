import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  clampZoom,
  CSS_PIXELS_PER_POINT,
  DEFAULT_COLOR,
  resolveZoom,
  zoomIn,
  zoomOut,
  type Annotation,
  type AnnotationKind,
  type NoteAnnotation,
  type PageGeometry,
  type PdfRect,
  type Rgb,
  type Size,
  type ViewTransform,
  type ZoomMode,
} from '@phinpdf/core';
import type { Editor } from '@phinpdf/editor';
import type { OpenedFile, Platform } from '@phinpdf/platform';
import { normalizeRotation, type OutlineNode, type RenderDocument } from '@phinpdf/renderer';
import {
  DocumentView,
  OutlineTree,
  PAGE_GAP,
  SearchBar,
  selectionToPageRects,
  Thumbnails,
  type AnnotationHandlers,
  type AnnotationTool,
  type ScrollRequest,
} from '@phinpdf/ui';
import { saveErrorMessage } from '../error-message.ts';
import { AnnotationCard } from './AnnotationCard.tsx';
import { CommentsPanel } from './CommentsPanel.tsx';
import { cleanupPrint, printDocument } from './print.ts';
import { SelectionMenu } from './SelectionMenu.tsx';
import { Toolbar } from './Toolbar.tsx';
import { useAnnotations } from './use-annotations.ts';
import { useSearch } from './use-search.ts';

/** Saves the document; resolves to true once it is written (false if cancelled or failed). */
export type SaveDocument = (options?: { readonly as?: boolean }) => Promise<boolean>;

export interface ViewerProps {
  readonly doc: RenderDocument;
  readonly file: OpenedFile;
  /** The password the file was opened with, needed to save an encrypted file. */
  readonly password?: string | undefined;
  readonly platform: Platform;
  readonly editor: Editor;
  readonly onOpen: () => void;
  /** Called after a save with the file as it now is (its name may change with Save As). */
  readonly onSaved: (file: OpenedFile) => void;
  readonly onDirtyChange?: ((dirty: boolean) => void) | undefined;
  /** Receives the save function, so the app can save before closing the document. */
  readonly saveRef?: RefObject<SaveDocument | null> | undefined;
}

type SidebarTab = 'pages' | 'bookmarks' | 'comments';

/** Pages of travel between cache cleanups (see RenderDocument.cleanupWhenIdle). */
const CLEANUP_EVERY_PAGES = 10;

function rotateSizes(sizes: readonly Size[], rotation: number): Size[] {
  return rotation % 180 === 0
    ? [...sizes]
    : sizes.map((s) => ({ width: s.height, height: s.width }));
}

/** True when a key event comes from a text field, where shortcuts must not fire. */
function inTextField(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  return (
    !!target &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  );
}

/** True if the current selection is text inside a page's text layer. */
function hasPageTextSelection(): boolean {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;
  const node = selection.getRangeAt(0).commonAncestorContainer;
  const element = node instanceof Element ? node : node.parentElement;
  return !!element?.closest('.phinpdf-scroller');
}

function newAnnotationId(): string {
  return `phinpdf-${crypto.randomUUID()}`;
}

const now = (): string => new Date().toISOString();

/** The document viewer: toolbar, sidebar, find bar, the scrolling pages, and comments. */
export function Viewer({
  doc,
  file,
  password,
  platform,
  editor,
  onOpen,
  onSaved,
  onDirtyChange,
  saveRef,
}: ViewerProps) {
  const fileName = file.name;
  const [baseSizes, setBaseSizes] = useState<Size[] | null>(null);
  const [geometries, setGeometries] = useState<PageGeometry[] | null>(null);
  const [rotation, setRotation] = useState(0);
  const [zoomMode, setZoomMode] = useState<ZoomMode>({ kind: 'auto' });
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [scrollRequest, setScrollRequest] = useState<ScrollRequest | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 900);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('pages');
  const [outline, setOutline] = useState<OutlineNode[] | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFocusKey, setSearchFocusKey] = useState(0);
  const [printing, setPrinting] = useState<{ done: number } | null>(null);
  const [renderError, setRenderError] = useState(false);
  const [tool, setTool] = useState<AnnotationTool>('select');
  const [toolColors, setToolColors] = useState<Record<AnnotationKind, Rgb>>(DEFAULT_COLOR);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusComment, setFocusComment] = useState(false);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const printAbort = useRef<AbortController | null>(null);
  const requestKey = useRef(0);
  const pageInputRef = useRef<HTMLInputElement>(null);
  const annotations = useAnnotations(doc);

  useEffect(() => {
    document.title = `${annotations.dirty ? '• ' : ''}${fileName} – phinPDF`;
    return () => {
      document.title = 'phinPDF';
    };
  }, [fileName, annotations.dirty]);

  // Page sizes and boxes for the layout, and the bookmarks.
  useEffect(() => {
    const controller = new AbortController();
    doc.getPageSizes(1, 0, controller.signal).then(setBaseSizes, () => undefined);
    doc.getPageGeometries(controller.signal).then(setGeometries, () => undefined);
    doc.getOutline().then(setOutline, () => {
      setOutline([]);
    });
    return () => {
      controller.abort();
    };
  }, [doc]);

  useEffect(
    () => () => {
      printAbort.current?.abort();
      cleanupPrint();
    },
    [],
  );

  const sizes = useMemo(
    () => (baseSizes ? rotateSizes(baseSizes, rotation) : null),
    [baseSizes, rotation],
  );
  const pageCount = doc.numPages;
  const refPage = sizes?.[pageIndex] ?? sizes?.[0];
  // Fit modes need the window size; an explicit zoom applies even before it is known.
  let zoom = zoomMode.kind === 'scale' ? clampZoom(zoomMode.scale) : 1;
  if (viewport && refPage) {
    zoom = resolveZoom(
      zoomMode,
      {
        width: refPage.width * CSS_PIXELS_PER_POINT,
        height: refPage.height * CSS_PIXELS_PER_POINT,
      },
      viewport,
      PAGE_GAP,
    );
  }
  const cssScale = zoom * CSS_PIXELS_PER_POINT;

  const goToPage = useCallback(
    (index: number) => {
      requestKey.current += 1;
      setScrollRequest({
        page: Math.min(Math.max(index, 0), pageCount - 1),
        key: requestKey.current,
      });
    },
    [pageCount],
  );

  const search = useSearch(doc, pageIndex, searchOpen);
  const { current: currentMatch } = search;
  const pageIndexRef = useRef(pageIndex);
  useEffect(() => {
    pageIndexRef.current = pageIndex;
  }, [pageIndex]);
  // Bring the selected match's page into view; the page then centres the match itself.
  useEffect(() => {
    if (currentMatch && currentMatch.page !== pageIndexRef.current) goToPage(currentMatch.page);
  }, [currentMatch, goToPage]);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    setSearchFocusKey((k) => k + 1);
  }, []);

  // --- Annotations -------------------------------------------------------------------

  const { add, update, remove, items } = annotations;
  const selected = useMemo(
    () => items.find((a) => a.id === selectedId) ?? null,
    [items, selectedId],
  );

  const transformFor = useCallback(
    (index: number): ViewTransform | null => {
      const geometry = geometries?.[index];
      return geometry ? { geometry, scale: cssScale, rotation } : null;
    },
    [geometries, cssScale, rotation],
  );

  /** Turns the selected text into highlights or underlines (one per page it spans). */
  const markSelection = useCallback(
    (kind: 'highlight' | 'underline'): boolean => {
      const byPage = selectionToPageRects(window.getSelection(), transformFor);
      if (byPage.size === 0) return false;
      for (const [page, rects] of byPage) {
        add({
          id: newAnnotationId(),
          kind,
          pageIndex: page,
          color: toolColors[kind],
          contents: '',
          author: '',
          modified: now(),
          rects,
        });
      }
      window.getSelection()?.removeAllRanges();
      setMenuAt(null);
      setStatus(kind === 'highlight' ? 'Highlight added' : 'Underline added');
      return true;
    },
    [add, toolColors, transformFor],
  );

  const chooseTool = useCallback(
    (next: AnnotationTool) => {
      // With text selected, the highlight and underline buttons apply to it at once.
      if ((next === 'highlight' || next === 'underline') && markSelection(next)) return;
      setTool(next);
      setMenuAt(null);
    },
    [markSelection],
  );

  const handlers = useMemo<AnnotationHandlers>(
    () => ({
      tool,
      selectedId,
      onSelect: (id) => {
        setSelectedId(id);
        setFocusComment(false);
      },
      onMoveNote: (note: NoteAnnotation, rect: PdfRect) => {
        update(note, { ...note, rect, modified: now() }, 'Move Note');
      },
      onPlaceNote: (page, rect) => {
        const note: NoteAnnotation = {
          id: newAnnotationId(),
          kind: 'note',
          pageIndex: page,
          color: toolColors.note,
          contents: '',
          author: '',
          modified: now(),
          rect,
        };
        add(note);
        setSelectedId(note.id);
        setFocusComment(true);
        // Like Acrobat Reader, the note tool is used once and then put away.
        setTool('select');
        setStatus('Note added');
      },
    }),
    [tool, selectedId, update, add, toolColors.note],
  );

  // After a mouse selection in the pages: apply the active markup tool, or offer the
  // quick actions next to the selection.
  useEffect(() => {
    const onPointerUp = (event: PointerEvent): void => {
      const target = event.target as Element | null;
      if (!target?.closest('.phinpdf-scroller')) return;
      // The selection settles after pointerup.
      window.setTimeout(() => {
        if (!hasPageTextSelection()) {
          setMenuAt(null);
          return;
        }
        if (tool === 'highlight' || tool === 'underline') {
          markSelection(tool);
          return;
        }
        const box = window.getSelection()?.getRangeAt(0).getBoundingClientRect();
        if (!box) return;
        setMenuAt({
          x: Math.min(Math.max(box.left + box.width / 2, 100), window.innerWidth - 100),
          y: Math.min(box.bottom + 8, window.innerHeight - 48),
        });
      }, 0);
    };
    const onSelectionChange = (): void => {
      if (!hasPageTextSelection()) setMenuAt(null);
    };
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('selectionchange', onSelectionChange);
    };
  }, [tool, markSelection]);

  const setColor = useCallback(
    (color: Rgb) => {
      const kind: AnnotationKind = tool === 'select' ? 'highlight' : tool;
      setToolColors((c) => ({ ...c, [kind]: color }));
    },
    [tool],
  );

  const deleteSelected = useCallback(() => {
    if (!selected) return;
    remove(selected);
    setSelectedId(null);
    setStatus('Deleted');
  }, [remove, selected]);

  const selectFromList = useCallback(
    (a: Annotation) => {
      goToPage(a.pageIndex);
      setSelectedId(a.id);
      setFocusComment(false);
    },
    [goToPage],
  );

  // --- Saving --------------------------------------------------------------------------

  const savingRef = useRef(false);
  const save = useCallback<SaveDocument>(
    async ({ as = false } = {}) => {
      if (savingRef.current) return false;
      savingRef.current = true;
      setSaving(true);
      setSaveError(null);
      // Snapshot now: edits made while saving stay unsaved.
      const snapshot = annotations.items;
      const changes = annotations.pendingChanges();
      try {
        const result =
          changes.length > 0
            ? await editor.save({ bytes: file.bytes, password, changes })
            : { bytes: file.bytes, keys: [] };
        const target = as
          ? await platform.saveFileAs(file.name, result.bytes)
          : await platform.saveFile(file, result.bytes);
        if (!target) return false;
        annotations.markSaved(snapshot, new Map(result.keys));
        onSaved({ id: target.id, name: target.name, bytes: result.bytes });
        setStatus(`Saved ${target.name}`);
        return true;
      } catch (error) {
        setSaveError(saveErrorMessage(error));
        return false;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [annotations, editor, file, password, platform, onSaved],
  );

  useEffect(() => {
    if (saveRef) saveRef.current = save;
  }, [save, saveRef]);
  useEffect(() => {
    onDirtyChange?.(annotations.dirty);
  }, [annotations.dirty, onDirtyChange]);

  // --- Printing ------------------------------------------------------------------------

  const byPageRef = useRef(annotations.byPage);
  useEffect(() => {
    byPageRef.current = annotations.byPage;
  }, [annotations.byPage]);

  const print = useCallback(() => {
    if (printAbort.current) return;
    const controller = new AbortController();
    printAbort.current = controller;
    setPrinting({ done: 0 });
    printDocument(
      doc,
      () => platform.print(new Uint8Array()),
      (done) => {
        setPrinting({ done });
      },
      controller.signal,
      (index) => byPageRef.current.get(index) ?? [],
    )
      .catch(() => undefined)
      .finally(() => {
        printAbort.current = null;
        setPrinting(null);
      });
  }, [doc, platform]);

  const zoomBy = useCallback(
    (direction: 1 | -1) => {
      setZoomMode({ kind: 'scale', scale: direction === 1 ? zoomIn(zoom) : zoomOut(zoom) });
    },
    [zoom],
  );
  const rotate = useCallback((delta: number) => {
    setRotation((r) => normalizeRotation(r + delta));
  }, []);

  // Keyboard shortcuts, matching Acrobat Reader where possible (docs/competitive-review.md).
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const typing = inTextField(event);
      let handled = true;
      if (mod && event.shiftKey && key === 'n') pageInputRef.current?.focus();
      else if (mod && event.shiftKey && (key === '+' || key === '=')) rotate(90);
      else if (mod && event.shiftKey && (key === '-' || key === '_')) rotate(-90);
      else if (mod && key === 's') void save({ as: event.shiftKey });
      else if (mod && !typing && ((key === 'z' && event.shiftKey) || key === 'y')) {
        annotations.redo();
      } else if (mod && !typing && key === 'z') annotations.undo();
      else if (mod && key === 'f') openSearch();
      else if (mod && key === 'p') print();
      else if (mod && (key === '=' || key === '+')) zoomBy(1);
      else if (mod && key === '-') zoomBy(-1);
      else if (mod && key === '0') setZoomMode({ kind: 'fit-page' });
      else if (mod && key === '1') setZoomMode({ kind: 'scale', scale: 1 });
      else if (mod && key === '2') setZoomMode({ kind: 'fit-width' });
      else if (key === 'f3' && searchOpen) {
        if (event.shiftKey) search.previous();
        else search.next();
      } else if (!mod && !typing && (key === 'delete' || key === 'backspace') && selected) {
        deleteSelected();
      } else if (!mod && !typing && key === 'escape' && (selected || tool !== 'select')) {
        setSelectedId(null);
        setTool('select');
      } else if (!mod && !typing && key === 'arrowright' && zoomMode.kind === 'fit-page')
        goToPage(pageIndex + 1);
      else if (!mod && !typing && key === 'arrowleft' && zoomMode.kind === 'fit-page')
        goToPage(pageIndex - 1);
      else handled = false;
      if (handled) event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [
    rotate,
    openSearch,
    print,
    zoomBy,
    searchOpen,
    search,
    goToPage,
    pageIndex,
    zoomMode.kind,
    save,
    annotations,
    selected,
    deleteSelected,
    tool,
  ]);

  // Free cached fonts and images after travelling through a long document.
  const cleanedAt = useRef(0);
  useEffect(() => {
    if (Math.abs(pageIndex - cleanedAt.current) >= CLEANUP_EVERY_PAGES) {
      cleanedAt.current = pageIndex;
      doc.cleanupWhenIdle();
    }
  }, [doc, pageIndex]);

  const onRenderError = useCallback(() => {
    setRenderError(true);
  }, []);

  const toolKind: AnnotationKind = tool === 'select' ? 'highlight' : tool;
  const tabs: { id: SidebarTab; label: string }[] = [
    { id: 'pages', label: 'Pages' },
    { id: 'bookmarks', label: 'Bookmarks' },
    { id: 'comments', label: 'Comments' },
  ];

  return (
    <div className="viewer-shell">
      <Toolbar
        fileName={fileName}
        pageIndex={pageIndex}
        pageCount={pageCount}
        zoom={zoom}
        zoomMode={zoomMode}
        sidebarOpen={sidebarOpen}
        searchOpen={searchOpen}
        pageInputRef={pageInputRef}
        onOpen={onOpen}
        onPrint={print}
        onGoToPage={goToPage}
        onZoomMode={setZoomMode}
        onZoomIn={() => {
          zoomBy(1);
        }}
        onZoomOut={() => {
          zoomBy(-1);
        }}
        onRotate={() => {
          rotate(90);
        }}
        onToggleSidebar={() => {
          setSidebarOpen((open) => !open);
        }}
        onToggleSearch={() => {
          if (searchOpen) setSearchOpen(false);
          else openSearch();
        }}
        tool={tool}
        toolColor={toolColors[toolKind]}
        dirty={annotations.dirty}
        saving={saving}
        canUndo={annotations.canUndo}
        canRedo={annotations.canRedo}
        undoLabel={annotations.undoLabel}
        redoLabel={annotations.redoLabel}
        onTool={chooseTool}
        onToolColor={setColor}
        onSave={() => void save()}
        onUndo={annotations.undo}
        onRedo={annotations.redo}
      />
      {searchOpen && (
        <SearchBar
          query={search.query}
          caseSensitive={search.options.caseSensitive}
          wholeWord={search.options.wholeWord}
          currentIndex={search.currentIndex}
          total={search.matches.length}
          scanned={search.scanned}
          pageCount={pageCount}
          onQueryChange={search.setQuery}
          onOptionsChange={search.setOptions}
          onNext={search.next}
          onPrevious={search.previous}
          onClose={() => {
            setSearchOpen(false);
          }}
          focusKey={searchFocusKey}
        />
      )}
      {renderError && (
        <p className="banner" role="alert">
          Some parts of this document could not be displayed.
        </p>
      )}
      {saveError && (
        <div className="banner error-banner" role="alert">
          <span>{saveError}</span>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setSaveError(null);
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      <div className="viewer-body">
        {sidebarOpen && (
          <aside className="sidebar" aria-label="Sidebar">
            <div role="tablist" aria-label="Sidebar panels" className="tabs">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`tab-${t.id}`}
                  aria-selected={sidebarTab === t.id}
                  aria-controls="panel-sidebar"
                  onClick={() => {
                    setSidebarTab(t.id);
                  }}
                >
                  {t.label}
                  {t.id === 'comments' && items.length > 0 && (
                    <span className="tab-count"> ({items.length})</span>
                  )}
                </button>
              ))}
            </div>
            <div
              role="tabpanel"
              id="panel-sidebar"
              className="tab-panel"
              aria-labelledby={`tab-${sidebarTab}`}
            >
              {sidebarTab === 'pages' && sizes && (
                <Thumbnails
                  document={doc}
                  sizes={sizes}
                  currentPage={pageIndex}
                  onSelect={goToPage}
                  rotation={rotation}
                />
              )}
              {sidebarTab === 'bookmarks' &&
                (outline ? (
                  <OutlineTree nodes={outline} onSelect={goToPage} />
                ) : (
                  <p className="phinpdf-empty">Loading…</p>
                ))}
              {sidebarTab === 'comments' && (
                <CommentsPanel
                  annotations={items}
                  selectedId={selectedId}
                  loaded={annotations.loaded}
                  onSelect={selectFromList}
                />
              )}
            </div>
          </aside>
        )}
        {sizes ? (
          <DocumentView
            document={doc}
            sizes={sizes}
            zoom={zoom}
            rotation={rotation}
            highlights={searchOpen ? search.highlights : undefined}
            scrollRequest={scrollRequest}
            onCurrentPageChange={setPageIndex}
            onViewportChange={setViewport}
            onRenderError={onRenderError}
            onWheelZoom={zoomBy}
            label={`${fileName}, ${String(pageCount)} ${pageCount === 1 ? 'page' : 'pages'}`}
            geometries={geometries ?? undefined}
            annotations={annotations.byPage}
            annotationHandlers={handlers}
          />
        ) : (
          <p className="loading" role="status">
            Loading pages…
          </p>
        )}
        {selected && (
          <AnnotationCard
            key={selected.id}
            annotation={selected}
            focusComment={focusComment}
            onColor={(color) => {
              update(selected, { ...selected, color, modified: now() }, 'Change Colour');
              setToolColors((c) => ({ ...c, [selected.kind]: color }));
            }}
            onContents={(contents) => {
              const current = items.find((a) => a.id === selected.id);
              if (current)
                update(current, { ...current, contents, modified: now() }, 'Edit Comment');
            }}
            onDelete={deleteSelected}
            onClose={() => {
              setSelectedId(null);
            }}
          />
        )}
      </div>
      {menuAt && (
        <SelectionMenu
          at={menuAt}
          onHighlight={() => void markSelection('highlight')}
          onUnderline={() => void markSelection('underline')}
        />
      )}
      <p className="visually-hidden" role="status" aria-live="polite">
        Page {pageIndex + 1} of {pageCount}
      </p>
      <p className="visually-hidden" role="status" aria-live="polite" data-testid="edit-status">
        {status}
      </p>
      {printing && (
        <div className="print-progress" role="dialog" aria-label="Preparing to print">
          <p>
            Preparing pages for printing: {printing.done} of {pageCount}
          </p>
          <button
            type="button"
            onClick={() => {
              printAbort.current?.abort();
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
