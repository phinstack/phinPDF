/** A file the user chose to open. Bytes are already read into memory. */
export interface OpenedFile {
  /**
   * Opaque handle for saving back to the same file later. On desktop this is a token
   * issued by the Rust side for a file the user picked; the webview never sees paths.
   */
  readonly id: string;
  readonly name: string;
  readonly bytes: Uint8Array;
}

export interface RecentFile {
  readonly id: string;
  readonly name: string;
  readonly openedAt: Date;
}

/** Where a document was saved. The id can be used to save there again. */
export interface SavedFile {
  readonly id: string;
  readonly name: string;
}

export type PlatformKind = 'web' | 'desktop';

/**
 * Everything that differs between the browser and the desktop app (ADR-0005).
 * UI and core code use this interface and never call Tauri or browser file APIs directly.
 */
export interface Platform {
  readonly kind: PlatformKind;
  /** Ask the user to pick a PDF. Resolves to null if they cancel. */
  openFile(): Promise<OpenedFile | null>;
  /** The file the app was launched with ("Open with", double-click), if any. */
  getLaunchFile(): Promise<OpenedFile | null>;
  /** A file the user dragged onto the window. */
  openDroppedFile(file: File): Promise<OpenedFile>;
  /**
   * Saves over the file the document came from. Where that isn't possible (a dropped
   * file, or a browser without write access) it asks where to save instead. Resolves to
   * null if the user cancels.
   */
  saveFile(file: SavedFile, bytes: Uint8Array): Promise<SavedFile | null>;
  /** Asks where to save a copy. Resolves to null if the user cancels. */
  saveFileAs(suggestedName: string, bytes: Uint8Array): Promise<SavedFile | null>;
  /** Tells the platform whether closing now would lose changes. */
  setUnsavedChanges(unsaved: boolean): void;
  /**
   * Called when the user tries to close the app with unsaved changes (desktop only; the
   * browser shows its own prompt). Resolve to true to close. Returns an unsubscribe.
   */
  onCloseRequested(handler: () => Promise<boolean>): () => void;
  print(bytes: Uint8Array): Promise<void>;
  /** Open a link from a document. Always asks the user first. */
  openExternalLink(url: string): Promise<boolean>;
  recentFiles(): Promise<RecentFile[]>;
}

/** Thrown by platform features that a later phase will implement. */
export class NotImplementedError extends Error {
  constructor(feature: string, phase: string) {
    super(`${feature} is not implemented yet (planned for ${phase}).`);
    this.name = 'NotImplementedError';
  }
}

/** Maximum file size the app will open (matches the desktop limit in Rust). */
export const MAX_FILE_BYTES = 512 * 1024 * 1024;

export class FileTooLargeError extends Error {
  constructor(readonly size: number) {
    super(`File is ${String(size)} bytes; the limit is ${String(MAX_FILE_BYTES)} bytes.`);
    this.name = 'FileTooLargeError';
  }
}
