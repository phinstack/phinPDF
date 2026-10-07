import { useCallback, useEffect, useRef, useState } from 'react';
import type { OpenedFile, Platform } from '@phinpdf/platform';
import type { RenderDocument } from '@phinpdf/renderer';
import { PageCanvas } from '@phinpdf/ui';
import { errorMessage } from './error-message.ts';

export type OpenDocument = (bytes: Uint8Array) => Promise<RenderDocument>;

export interface AppProps {
  readonly platform: Platform;
  readonly openDocument: OpenDocument;
}

type View =
  | { readonly kind: 'empty' }
  | { readonly kind: 'loading'; readonly name: string }
  | { readonly kind: 'loaded'; readonly name: string; readonly doc: RenderDocument }
  | { readonly kind: 'error'; readonly message: string };

const SCALE = 1.25;

export function App({ platform, openDocument }: AppProps) {
  const [view, setView] = useState<View>({ kind: 'empty' });
  const [rendered, setRendered] = useState(false);
  const docRef = useRef<RenderDocument | null>(null);

  const replaceDocument = useCallback((doc: RenderDocument | null) => {
    const previous = docRef.current;
    docRef.current = doc;
    if (previous && previous !== doc) void previous.destroy();
  }, []);

  const load = useCallback(
    async (file: OpenedFile | null) => {
      if (!file) return;
      setRendered(false);
      setView({ kind: 'loading', name: file.name });
      try {
        const doc = await openDocument(file.bytes);
        replaceDocument(doc);
        setView({ kind: 'loaded', name: file.name, doc });
      } catch (error) {
        replaceDocument(null);
        setView({ kind: 'error', message: errorMessage(error) });
      }
    },
    [openDocument, replaceDocument],
  );

  const handleOpen = useCallback(() => {
    platform.openFile().then(load, (error: unknown) => {
      setView({ kind: 'error', message: errorMessage(error) });
    });
  }, [platform, load]);

  // Open the file the app was launched with ("Open with" / double-click on desktop).
  useEffect(() => {
    platform.getLaunchFile().then(load, (error: unknown) => {
      setView({ kind: 'error', message: errorMessage(error) });
    });
  }, [platform, load]);

  // Ctrl+O / Cmd+O opens a file.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        handleOpen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [handleOpen]);

  useEffect(
    () => () => {
      replaceDocument(null);
    },
    [replaceDocument],
  );

  const onRendered = useCallback(() => {
    setRendered(true);
  }, []);
  const onRenderError = useCallback(() => {
    setView({ kind: 'error', message: 'This page could not be displayed.' });
  }, []);

  return (
    <div className="app">
      <header className="toolbar">
        <h1 className="brand">phinPDF</h1>
        <button type="button" onClick={handleOpen} aria-keyshortcuts="Control+O">
          Open PDF…
        </button>
        <p className="status" role="status" aria-live="polite" data-rendered={rendered}>
          {view.kind === 'empty' && 'No document open.'}
          {view.kind === 'loading' && `Opening ${view.name}…`}
          {view.kind === 'loaded' &&
            `${view.name} — ${String(view.doc.numPages)} ${view.doc.numPages === 1 ? 'page' : 'pages'}`}
        </p>
      </header>
      <main className="viewer">
        {view.kind === 'error' && (
          <p className="error" role="alert">
            {view.message}
          </p>
        )}
        {view.kind === 'empty' && (
          <p className="hint">Open a PDF to view it. Files never leave your device.</p>
        )}
        {view.kind === 'loaded' && (
          <PageCanvas
            document={view.doc}
            pageNumber={1}
            scale={SCALE}
            label={`Page 1 of ${String(view.doc.numPages)}`}
            onRendered={onRendered}
            onError={onRenderError}
          />
        )}
      </main>
    </div>
  );
}
