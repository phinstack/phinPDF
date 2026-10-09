import { readFile } from '../files.ts';
import {
  FileTooLargeError,
  MAX_FILE_BYTES,
  NotImplementedError,
  type OpenedFile,
  type Platform,
  type RecentFile,
  type SavedFile,
} from '../types.ts';

/** Metadata returned by the Rust commands. The path stays on the Rust side. */
interface FileMeta {
  readonly id: string;
  readonly name: string;
  readonly size: number;
}

/** Signature of Tauri's `invoke`, injected so this class can be tested without Tauri. */
export type Invoke = <T>(
  command: string,
  args?: Record<string, unknown> | Uint8Array,
  options?: { headers: Record<string, string> },
) => Promise<T>;

/** Signature of Tauri's event `listen`. Resolves to an unlisten function. */
export type Listen = (event: string, handler: () => void) => Promise<() => void>;

/** Emitted by Rust when the window is closed with unsaved changes. */
export const CLOSE_REQUESTED_EVENT = 'phinpdf://close-requested';

/** Tokens issued by Rust for files the user opened or saved (see files.rs). */
const isRustToken = (id: string): boolean => id.startsWith('file-');

export class DesktopPlatform implements Platform {
  readonly kind = 'desktop' as const;
  readonly #invoke: Invoke;
  readonly #listen: Listen | null;
  #unsaved = false;

  constructor(invoke: Invoke, listen: Listen | null = null) {
    this.#invoke = invoke;
    this.#listen = listen;
  }

  async openFile(): Promise<OpenedFile | null> {
    return this.#read(await this.#invoke<FileMeta | null>('pick_file'));
  }

  async getLaunchFile(): Promise<OpenedFile | null> {
    return this.#read(await this.#invoke<FileMeta | null>('launch_file'));
  }

  /** Dropped files come from the webview as File objects; no path reaches it. */
  openDroppedFile(file: File): Promise<OpenedFile> {
    return readFile(file, 'drop');
  }

  async #read(meta: FileMeta | null): Promise<OpenedFile | null> {
    if (!meta) return null;
    if (meta.size > MAX_FILE_BYTES) throw new FileTooLargeError(meta.size);
    const buffer = await this.#invoke<ArrayBuffer>('read_file', { id: meta.id });
    return { id: meta.id, name: meta.name, bytes: new Uint8Array(buffer) };
  }

  /** The bytes go to Rust as the raw request body, with no JSON or base64 step. */
  async saveFile(file: SavedFile, bytes: Uint8Array): Promise<SavedFile | null> {
    // Dropped files have no token (the webview never learns their path), so ask where.
    if (!isRustToken(file.id)) return this.saveFileAs(file.name, bytes);
    const meta = await this.#invoke<FileMeta>('save_file', bytes, {
      headers: { 'x-file-id': file.id },
    });
    return { id: meta.id, name: meta.name };
  }

  async saveFileAs(suggestedName: string, bytes: Uint8Array): Promise<SavedFile | null> {
    const meta = await this.#invoke<FileMeta | null>('save_file_as', bytes, {
      headers: { 'x-file-name': encodeURIComponent(suggestedName) },
    });
    return meta ? { id: meta.id, name: meta.name } : null;
  }

  setUnsavedChanges(unsaved: boolean): void {
    if (unsaved === this.#unsaved) return;
    this.#unsaved = unsaved;
    void this.#invoke('set_unsaved_changes', { unsaved }).catch(() => undefined);
  }

  onCloseRequested(handler: () => Promise<boolean>): () => void {
    if (!this.#listen) return () => undefined;
    let unlisten: (() => void) | null = null;
    let stopped = false;
    void this.#listen(CLOSE_REQUESTED_EVENT, () => {
      void handler().then((close) => {
        if (close) return this.#invoke('close_window');
        return undefined;
      });
    }).then((off) => {
      if (stopped) off();
      else unlisten = off;
    });
    return () => {
      stopped = true;
      unlisten?.();
    };
  }

  print(): Promise<void> {
    // WebView2 and WebKitGTK both show the system print dialog.
    globalThis.print();
    return Promise.resolve();
  }

  openExternalLink(): Promise<boolean> {
    return Promise.reject(new NotImplementedError('Opening links', 'Phase 5'));
  }

  recentFiles(): Promise<RecentFile[]> {
    return Promise.resolve([]);
  }
}
