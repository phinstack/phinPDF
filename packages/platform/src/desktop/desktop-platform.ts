import { readFile } from '../files.ts';
import {
  FileTooLargeError,
  MAX_FILE_BYTES,
  NotImplementedError,
  type OpenedFile,
  type Platform,
  type RecentFile,
} from '../types.ts';

/** Metadata returned by the Rust commands. The path stays on the Rust side. */
interface FileMeta {
  readonly id: string;
  readonly name: string;
  readonly size: number;
}

/** Signature of Tauri's `invoke`, injected so this class can be tested without Tauri. */
export type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export class DesktopPlatform implements Platform {
  readonly kind = 'desktop' as const;
  readonly #invoke: Invoke;

  constructor(invoke: Invoke) {
    this.#invoke = invoke;
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

  saveFile(): Promise<void> {
    return Promise.reject(new NotImplementedError('Saving', 'Phase 3'));
  }

  saveFileAs(): Promise<OpenedFile | null> {
    return Promise.reject(new NotImplementedError('Save As', 'Phase 3'));
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
