import { sanitizeExternalUrl } from '../links.ts';
import {
  FileTooLargeError,
  MAX_FILE_BYTES,
  NotImplementedError,
  type OpenedFile,
  type Platform,
  type RecentFile,
} from '../types.ts';

/** Minimal File System Access API types (not yet in TypeScript's DOM lib). */
interface FileSystemFileHandleLike {
  readonly name: string;
  getFile(): Promise<File>;
}
type ShowOpenFilePicker = (options: {
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandleLike[]>;

export interface WebPlatformEnv {
  readonly window: Window & { showOpenFilePicker?: ShowOpenFilePicker };
  readonly document: Document;
  /** Asks the user to confirm leaving the app. Defaults to window.confirm. */
  readonly confirm?: (message: string) => boolean;
}

let nextId = 0;

async function toOpenedFile(file: File): Promise<OpenedFile> {
  if (file.size > MAX_FILE_BYTES) throw new FileTooLargeError(file.size);
  nextId += 1;
  return {
    id: `web-${String(nextId)}`,
    name: file.name,
    bytes: new Uint8Array(await file.arrayBuffer()),
  };
}

export class WebPlatform implements Platform {
  readonly kind = 'web' as const;
  readonly #env: WebPlatformEnv;

  constructor(env: WebPlatformEnv) {
    this.#env = env;
  }

  async openFile(): Promise<OpenedFile | null> {
    const picker = this.#env.window.showOpenFilePicker;
    if (picker) {
      try {
        const [handle] = await picker.call(this.#env.window, {
          multiple: false,
          types: [{ description: 'PDF documents', accept: { 'application/pdf': ['.pdf'] } }],
        });
        return handle ? await toOpenedFile(await handle.getFile()) : null;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return null;
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
    // File handling for the installed PWA (launchQueue) arrives with Phase 2.
    return Promise.resolve(null);
  }

  saveFile(): Promise<void> {
    return Promise.reject(new NotImplementedError('Saving', 'Phase 3'));
  }

  saveFileAs(): Promise<OpenedFile | null> {
    return Promise.reject(new NotImplementedError('Save As', 'Phase 3'));
  }

  print(): Promise<void> {
    return Promise.reject(new NotImplementedError('Printing', 'Phase 2'));
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
