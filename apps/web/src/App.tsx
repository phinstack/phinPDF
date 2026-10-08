import { useCallback, useEffect, useRef, useState } from 'react';
import type { OpenedFile, Platform } from '@phinpdf/platform';
import { OpenError, type RenderDocument } from '@phinpdf/renderer';
import { PasswordDialog } from '@phinpdf/ui';
import { errorMessage } from './error-message.ts';
import { Icon } from './icons.tsx';
import { Viewer } from './viewer/Viewer.tsx';

export type OpenDocument = (bytes: Uint8Array, password?: string) => Promise<RenderDocument>;

export interface AppProps {
  readonly platform: Platform;
  readonly openDocument: OpenDocument;
}

type Session =
  | { readonly kind: 'empty' }
  | { readonly kind: 'loading'; readonly name: string }
  | { readonly kind: 'password'; readonly file: OpenedFile; readonly incorrect: boolean }
  | { readonly kind: 'ready'; readonly file: OpenedFile; readonly doc: RenderDocument }
  | { readonly kind: 'error'; readonly message: string };

function hasFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes('Files') ?? false;
}

export function App({ platform, openDocument }: AppProps) {
  const [session, setSession] = useState<Session>({ kind: 'empty' });
  const [dragging, setDragging] = useState(false);
  const docRef = useRef<RenderDocument | null>(null);

  const replaceDocument = useCallback((doc: RenderDocument | null) => {
    const previous = docRef.current;
    docRef.current = doc;
    if (previous && previous !== doc) void previous.destroy();
  }, []);

  const load = useCallback(
    async (file: OpenedFile | null, password?: string) => {
      if (!file) return;
      setSession({ kind: 'loading', name: file.name });
      try {
        const doc = await openDocument(file.bytes, password);
        replaceDocument(doc);
        setSession({ kind: 'ready', file, doc });
      } catch (error) {
        if (
          error instanceof OpenError &&
          (error.code === 'password-required' || error.code === 'password-incorrect')
        ) {
          setSession({ kind: 'password', file, incorrect: error.code === 'password-incorrect' });
          return;
        }
        replaceDocument(null);
        setSession({ kind: 'error', message: errorMessage(error) });
      }
    },
    [openDocument, replaceDocument],
  );

  const fail = useCallback((error: unknown) => {
    setSession({ kind: 'error', message: errorMessage(error) });
  }, []);

  const handleOpen = useCallback(() => {
    platform.openFile().then(load, fail);
  }, [platform, load, fail]);

  // Open the file the app was launched with ("Open with" / double-click on desktop).
  useEffect(() => {
    platform.getLaunchFile().then(load, fail);
  }, [platform, load, fail]);

  // Ctrl+O / Cmd+O opens a file from anywhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        handleOpen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [handleOpen]);

  // Drag and drop a PDF anywhere on the window.
  useEffect(() => {
    let depth = 0;
    const onEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth += 1;
      setDragging(true);
    };
    const onLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      const file = event.dataTransfer?.files[0];
      if (file) platform.openDroppedFile(file).then(load, fail);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [platform, load, fail]);

  useEffect(
    () => () => {
      replaceDocument(null);
    },
    [replaceDocument],
  );

  const overlay = dragging && (
    <div className="drop-overlay" aria-hidden="true">
      <p>Drop the PDF to open it</p>
    </div>
  );

  if (session.kind === 'ready') {
    return (
      <>
        <Viewer
          key={session.file.id}
          doc={session.doc}
          fileName={session.file.name}
          platform={platform}
          onOpen={handleOpen}
        />
        {overlay}
      </>
    );
  }

  return (
    <div className="app">
      <header className="toolbar" aria-label="Toolbar">
        <h1 className="brand">phinPDF</h1>
        <button
          type="button"
          className="text-button primary"
          onClick={handleOpen}
          aria-keyshortcuts="Control+O"
        >
          <Icon name="open" size={16} />
          Open
        </button>
        <p className="status" role="status" aria-live="polite">
          {session.kind === 'loading' ? `Opening ${session.name}…` : 'No document open.'}
        </p>
      </header>
      <main className="start">
        {session.kind === 'error' && (
          <p className="error" role="alert">
            {session.message}
          </p>
        )}
        <div className="drop-zone">
          <Icon name="file" size={56} />
          <h2>Open a PDF to start reading</h2>
          <p>Drop a file here, or choose one from your computer.</p>
          <button type="button" className="text-button primary large" onClick={handleOpen}>
            Choose a PDF…
          </button>
          <p className="hint">Shortcut: Ctrl+O</p>
          <p className="privacy">
            <Icon name="lock" size={16} />
            Files never leave your device. No account, no uploads.
          </p>
        </div>
      </main>
      {session.kind === 'password' && (
        <PasswordDialog
          key={`${session.file.id}-${String(session.incorrect)}`}
          fileName={session.file.name}
          incorrect={session.incorrect}
          onSubmit={(password) => {
            void load(session.file, password);
          }}
          onCancel={() => {
            setSession({ kind: 'empty' });
          }}
        />
      )}
      {overlay}
    </div>
  );
}
