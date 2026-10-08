import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  clampZoom,
  CSS_PIXELS_PER_POINT,
  resolveZoom,
  zoomIn,
  zoomOut,
  type Size,
  type ZoomMode,
} from '@phinpdf/core';
import type { Platform } from '@phinpdf/platform';
import { normalizeRotation, type OutlineNode, type RenderDocument } from '@phinpdf/renderer';
import {
  DocumentView,
  OutlineTree,
  PAGE_GAP,
  SearchBar,
  Thumbnails,
  type ScrollRequest,
} from '@phinpdf/ui';
import { cleanupPrint, printDocument } from './print.ts';
import { Toolbar } from './Toolbar.tsx';
import { useSearch } from './use-search.ts';

export interface ViewerProps {
  readonly doc: RenderDocument;
  readonly fileName: string;
  readonly platform: Platform;
  readonly onOpen: () => void;
}

type SidebarTab = 'pages' | 'bookmarks';

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

/** The document viewer: toolbar, sidebar, find bar, and the scrolling pages. */
export function Viewer({ doc, fileName, platform, onOpen }: ViewerProps) {
  const [baseSizes, setBaseSizes] = useState<Size[] | null>(null);
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
  const printAbort = useRef<AbortController | null>(null);
  const requestKey = useRef(0);
  const pageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = `${fileName} – phinPDF`;
    return () => {
      document.title = 'phinPDF';
    };
  }, [fileName]);

  // Page sizes for the layout, and the bookmarks.
  useEffect(() => {
    const controller = new AbortController();
    doc.getPageSizes(1, 0, controller.signal).then(setBaseSizes, () => undefined);
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
      let handled = true;
      if (mod && event.shiftKey && key === 'n') pageInputRef.current?.focus();
      else if (mod && event.shiftKey && (key === '+' || key === '=')) rotate(90);
      else if (mod && event.shiftKey && (key === '-' || key === '_')) rotate(-90);
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
      } else if (
        !mod &&
        !inTextField(event) &&
        key === 'arrowright' &&
        zoomMode.kind === 'fit-page'
      )
        goToPage(pageIndex + 1);
      else if (!mod && !inTextField(event) && key === 'arrowleft' && zoomMode.kind === 'fit-page')
        goToPage(pageIndex - 1);
      else handled = false;
      if (handled) event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [rotate, openSearch, print, zoomBy, searchOpen, search, goToPage, pageIndex, zoomMode.kind]);

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
      <div className="viewer-body">
        {sidebarOpen && (
          <aside className="sidebar" aria-label="Sidebar">
            <div role="tablist" aria-label="Sidebar panels" className="tabs">
              <button
                type="button"
                role="tab"
                id="tab-pages"
                aria-selected={sidebarTab === 'pages'}
                aria-controls="panel-sidebar"
                onClick={() => {
                  setSidebarTab('pages');
                }}
              >
                Pages
              </button>
              <button
                type="button"
                role="tab"
                id="tab-bookmarks"
                aria-selected={sidebarTab === 'bookmarks'}
                aria-controls="panel-sidebar"
                onClick={() => {
                  setSidebarTab('bookmarks');
                }}
              >
                Bookmarks
              </button>
            </div>
            <div
              role="tabpanel"
              id="panel-sidebar"
              className="tab-panel"
              aria-labelledby={sidebarTab === 'pages' ? 'tab-pages' : 'tab-bookmarks'}
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
          />
        ) : (
          <p className="loading" role="status">
            Loading pages…
          </p>
        )}
      </div>
      <p className="visually-hidden" role="status" aria-live="polite">
        Page {pageIndex + 1} of {pageCount}
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
