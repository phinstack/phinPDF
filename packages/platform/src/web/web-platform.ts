import { readFile } from '../files.ts';
import { sanitizeExternalUrl } from '../links.ts';
import type { OpenedFile, Platform, RecentFile, SavedFile } from '../types.ts';

/** Minimal File System Access API types (not yet in TypeScript's DOM lib). */
interface WritableLike {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
}
interface FileSystemFileHandleLike {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable?(): Promise<WritableLike>;
  queryPermission?(options: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(options: { mode: 'readwrite' }): Promise<PermissionState>;
}
interface PickerType {
  description: string;
  accept: Record<string, string[]>;
}
type ShowOpenFilePicker = (options: {
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
  types?: PickerType[];
}) => Promise<FileSystemFileHandleLike[]>;
type ShowSaveFilePicker = (options: {
  suggestedName?: string;
  types?: PickerType[];
}) => Promise<FileSystemFileHandleLike>;

export interface WebPlatformEnv {
  readonly window: Window & {
    showOpenFilePicker?: ShowOpenFilePicker;
    showSaveFilePicker?: ShowSaveFilePicker;
  };
  readonly document: Document;
  /** Asks the user to confirm leaving the app. Defaults to window.confirm. */
  readonly confirm?: (message: string) => boolean;
}

const PDF_TYPES: PickerType[] = [
  { description: 'PDF documents', accept: { 'application/pdf': ['.pdf'] } },
];

const toOpenedFile = (file: File): Promise<OpenedFile> => readFile(file, 'web');

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Adds .pdf unless the name already ends with it. */
function pdfName(name: string): string {
  const trimmed = name.trim() || 'document.pdf';
  return /\.pdf$/i.test(trimmed) ? trimmed : `${trimmed}.pdf`;
}

let nextSaveId = 0;

export class WebPlatform implements Platform {
  readonly kind = 'web' as const;
  readonly #env: WebPlatformEnv;
  /** Writable handles for files opened or saved through the File System Access API. */
  readonly #handles = new Map<string, FileSystemFileHandleLike>();
  #unsaved = false;

  constructor(env: WebPlatformEnv) {
    this.#env = env;
  }

  async openFile(): Promise<OpenedFile | null> {
    const picker = this.#env.window.showOpenFilePicker;
    if (picker) {
      try {
        const [handle] = await picker.call(this.#env.window, { multiple: false, types: PDF_TYPES });
        if (!handle) return null;
        const file = await toOpenedFile(await handle.getFile());
        this.#handles.set(file.id, handle);
        return file;
      } catch (error) {
        if (isAbort(error)) return null;
        throw error;
      }
    }
    return this.#openWithInput();
  }

  /** Fallback for browsers without the File System Access API (Firefox, Safari). */
  #openWithInput(): Promise<OpenedFile | null> {
    const { document } = this.#env;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,.pdf';
    input.hidden = true;
    input.dataset['testid'] = 'file-input';
    document.body.append(input);
    return new Promise<OpenedFile | null>((resolve, reject) => {
      const done = (): void => {
        input.remove();
      };
      input.addEventListener(
        'change',
        () => {
          const file = input.files?.[0];
          done();
          if (!file) {
            resolve(null);
            return;
          }
          toOpenedFile(file).then(resolve, reject);
        },
        { once: true },
      );
      input.addEventListener(
        'cancel',
        () => {
          done();
          resolve(null);
        },
        { once: true },
      );
      input.click();
    });
  }

  getLaunchFile(): Promise<OpenedFile | null> {
    // File handling for the installed PWA (launchQueue) is not supported yet.
    return Promise.resolve(null);
  }

  openDroppedFile(file: File): Promise<OpenedFile> {
    return toOpenedFile(file);
  }

  async saveFile(file: SavedFile, bytes: Uint8Array): Promise<SavedFile | null> {
    const handle = this.#handles.get(file.id);
    if (handle?.createWritable) {
      const permission = handle.requestPermission
        ? await handle.requestPermission({ mode: 'readwrite' })
        : 'granted';
      if (permission === 'granted') {
        await this.#write(handle, bytes);
        return { id: file.id, name: handle.name };
      }
    }
    return this.saveFileAs(file.name, bytes);
  }

  async saveFileAs(suggestedName: string, bytes: Uint8Array): Promise<SavedFile | null> {
    const picker = this.#env.window.showSaveFilePicker;
    if (picker) {
      let handle: FileSystemFileHandleLike;
      try {
        handle = await picker.call(this.#env.window, {
          suggestedName: pdfName(suggestedName),
          types: PDF_TYPES,
        });
      } catch (error) {
        if (isAbort(error)) return null;
        throw error;
      }
      await this.#write(handle, bytes);
      nextSaveId += 1;
      const id = `web-save-${String(nextSaveId)}`;
      this.#handles.set(id, handle);
      return { id, name: handle.name };
    }
    return this.#download(pdfName(suggestedName), bytes);
  }

  async #write(handle: FileSystemFileHandleLike, bytes: Uint8Array): Promise<void> {
    if (!handle.createWritable) throw new Error('This browser cannot write files');
    const writable = await handle.createWritable();
    await writable.write(bytes);
    await writable.close();
  }

  /** Browsers without the File System Access API save through a download. */
  #download(name: string, bytes: Uint8Array): SavedFile {
    const { document, window } = this.#env;
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    // Revoking at once can cancel the download in some browsers.
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60_000);
    nextSaveId += 1;
    return { id: `web-download-${String(nextSaveId)}`, name };
  }

  readonly #onBeforeUnload = (event: BeforeUnloadEvent): void => {
    event.preventDefault();
  };

  setUnsavedChanges(unsaved: boolean): void {
    if (unsaved === this.#unsaved) return;
    this.#unsaved = unsaved;
    if (unsaved) this.#env.window.addEventListener('beforeunload', this.#onBeforeUnload);
    else this.#env.window.removeEventListener('beforeunload', this.#onBeforeUnload);
  }

  onCloseRequested(): () => void {
    // The browser shows its own prompt (see setUnsavedChanges).
    return () => undefined;
  }

  print(): Promise<void> {
    this.#env.window.print();
    return Promise.resolve();
  }

  openExternalLink(url: string): Promise<boolean> {
    const safe = sanitizeExternalUrl(url);
    if (!safe) return Promise.resolve(false);
    const confirm = this.#env.confirm ?? ((m: string) => this.#env.window.confirm(m));
    if (!confirm(`Open this link in a new tab?\n\n${safe}`)) return Promise.resolve(false);
    this.#env.window.open(safe, '_blank', 'noopener,noreferrer');
    return Promise.resolve(true);
  }

  recentFiles(): Promise<RecentFile[]> {
    return Promise.resolve([]);
  }
}
