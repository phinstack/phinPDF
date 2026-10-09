// @vitest-environment jsdom
/**
 * Contract tests: both platform implementations must behave the same way for the
 * operations the UI relies on. Each harness simulates the user picking a file.
 */
import { describe, expect, it, vi } from 'vitest';
import { DesktopPlatform, type Invoke } from './desktop/desktop-platform.ts';
import { FileTooLargeError, MAX_FILE_BYTES, type Platform } from './types.ts';
import { WebPlatform } from './web/web-platform.ts';

const PDF = new TextEncoder().encode('%PDF-1.7\n%test\n');

interface Harness {
  readonly name: string;
  /** Creates a platform where the next pick returns `file`, or cancels if null. */
  create(file: { name: string; bytes: Uint8Array; size?: number } | null): Platform;
  /** Bytes written by the last save, by file name. */
  readonly written: Map<string, Uint8Array>;
  /** Makes the next "Save as" dialog cancel. */
  cancelNextSaveAs(): void;
}

const written = { web: new Map<string, Uint8Array>(), desktop: new Map<string, Uint8Array>() };
const cancel = { web: false, desktop: false };

/** A File System Access handle whose writes land in `written.web`. */
function webHandle(name: string, getFile: () => Promise<File>) {
  return {
    name,
    getFile,
    requestPermission: () => Promise.resolve('granted' as PermissionState),
    createWritable: () => {
      const chunks: Uint8Array[] = [];
      return Promise.resolve({
        write: (data: Uint8Array) => {
          chunks.push(data);
          return Promise.resolve();
        },
        close: () => {
          written.web.set(name, chunks.at(-1) ?? new Uint8Array());
          return Promise.resolve();
        },
      });
    },
  };
}

const webHarness: Harness = {
  name: 'WebPlatform (File System Access API)',
  written: written.web,
  cancelNextSaveAs: () => {
    cancel.web = true;
  },
  create(file) {
    const picker = vi.fn(() => {
      if (!file) return Promise.reject(new DOMException('cancelled', 'AbortError'));
      const blob = new File([file.bytes as BlobPart], file.name, { type: 'application/pdf' });
      if (file.size !== undefined) Object.defineProperty(blob, 'size', { value: file.size });
      return Promise.resolve([webHandle(file.name, () => Promise.resolve(blob))]);
    });
    const savePicker = vi.fn((options: { suggestedName?: string }) => {
      if (cancel.web) {
        cancel.web = false;
        return Promise.reject(new DOMException('cancelled', 'AbortError'));
      }
      return Promise.resolve(
        webHandle(options.suggestedName ?? 'x.pdf', () => Promise.reject(new Error('unused'))),
      );
    });
    const win = Object.assign(Object.create(window) as Window, {
      showOpenFilePicker: picker,
      showSaveFilePicker: savePicker,
    });
    // Delegate print() to the real window so tests can spy on it.
    Object.defineProperty(win, 'print', {
      value: () => {
        window.print();
      },
    });
    return new WebPlatform({ window: win, document });
  },
};

const desktopHarness: Harness = {
  name: 'DesktopPlatform (Tauri IPC)',
  written: written.desktop,
  cancelNextSaveAs: () => {
    cancel.desktop = true;
  },
  create(file) {
    const invoke = vi.fn(
      (command: string, args?: unknown, options?: { headers: Record<string, string> }) => {
        if (command === 'save_file' && ArrayBuffer.isView(args) && file) {
          if (options?.headers['x-file-id'] !== 'file-1')
            return Promise.reject(new Error('unknown file'));
          written.desktop.set(file.name, args as Uint8Array);
          return Promise.resolve({ id: 'file-1', name: file.name, size: args.byteLength });
        }
        if (command === 'save_file_as' && ArrayBuffer.isView(args)) {
          if (cancel.desktop) {
            cancel.desktop = false;
            return Promise.resolve(null);
          }
          const name = decodeURIComponent(options?.headers['x-file-name'] ?? '');
          written.desktop.set(name, args as Uint8Array);
          return Promise.resolve({ id: 'file-2', name, size: args.byteLength });
        }
        if (command === 'pick_file') {
          return Promise.resolve(
            file ? { id: 'file-1', name: file.name, size: file.size ?? file.bytes.length } : null,
          );
        }
        if (
          command === 'read_file' &&
          (args as { id?: string } | undefined)?.id === 'file-1' &&
          file
        ) {
          return Promise.resolve(file.bytes.slice().buffer);
        }
        return Promise.reject(new Error(`unexpected command ${command}`));
      },
    );
    return new DesktopPlatform(invoke as Invoke);
  },
};

describe.each([webHarness, desktopHarness])('$name contract', (harness) => {
  it('returns the picked file with its name and bytes', async () => {
    const file = await harness.create({ name: 'report.pdf', bytes: PDF }).openFile();
    expect(file?.name).toBe('report.pdf');
    expect(Array.from(file?.bytes ?? [])).toEqual(Array.from(PDF));
    expect(file?.id).toEqual(expect.any(String));
  });

  it('returns null when the user cancels', async () => {
    expect(await harness.create(null).openFile()).toBeNull();
  });

  it('rejects files over the size limit', async () => {
    const platform = harness.create({ name: 'huge.pdf', bytes: PDF, size: MAX_FILE_BYTES + 1 });
    await expect(platform.openFile()).rejects.toBeInstanceOf(FileTooLargeError);
  });

  it('saves over the file it opened', async () => {
    const platform = harness.create({ name: 'report.pdf', bytes: PDF });
    const opened = await platform.openFile();
    if (!opened) throw new Error('not opened');
    const edited = new TextEncoder().encode('%PDF-1.7\nedited');
    const saved = await platform.saveFile(opened, edited);
    expect(saved).toEqual({ id: opened.id, name: 'report.pdf' });
    expect(harness.written.get('report.pdf')).toEqual(edited);
  });

  it('asks where to save a copy, and returns null if cancelled', async () => {
    const platform = harness.create(null);
    const saved = await platform.saveFileAs('copy.pdf', PDF);
    expect(saved?.name).toBe('copy.pdf');
    expect(harness.written.get('copy.pdf')).toEqual(PDF);
    harness.cancelNextSaveAs();
    expect(await platform.saveFileAs('copy.pdf', PDF)).toBeNull();
  });

  it('asks where to save a dropped file, which has no handle to write to', async () => {
    const platform = harness.create(null);
    const dropped = await platform.openDroppedFile(new File([PDF], 'dropped.pdf'));
    const saved = await platform.saveFile(dropped, PDF);
    expect(saved?.name).toBe('dropped.pdf');
    expect(saved?.id).not.toBe(dropped.id);
  });

  it('reads a dropped file', async () => {
    const dropped = new File([PDF], 'dropped.pdf', { type: 'application/pdf' });
    const file = await harness.create(null).openDroppedFile(dropped);
    expect(file.name).toBe('dropped.pdf');
    expect(Array.from(file.bytes)).toEqual(Array.from(PDF));
  });

  it('rejects a dropped file over the size limit', async () => {
    const dropped = new File([PDF], 'huge.pdf');
    Object.defineProperty(dropped, 'size', { value: MAX_FILE_BYTES + 1 });
    await expect(harness.create(null).openDroppedFile(dropped)).rejects.toBeInstanceOf(
      FileTooLargeError,
    );
  });

  it('opens the system print dialog', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    await harness.create(null).print(PDF);
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('starts with no recent files', async () => {
    expect(await harness.create(null).recentFiles()).toEqual([]);
  });
});

describe('WebPlatform specifics', () => {
  const win = (extra: object = {}) => Object.assign(Object.create(window) as Window, extra);

  it('downloads the file where the browser cannot write files', async () => {
    const created = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const platform = new WebPlatform({ window: win(), document });
    const saved = await platform.saveFileAs('report', PDF);
    expect(saved?.name).toBe('report.pdf');
    expect(created).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('falls back to Save As when write permission is refused', async () => {
    const handle = {
      name: 'a.pdf',
      getFile: () => Promise.resolve(new File([PDF], 'a.pdf')),
      requestPermission: () => Promise.resolve('denied' as PermissionState),
      createWritable: vi.fn(),
    };
    const savePicker = vi.fn(() => Promise.reject(new DOMException('no', 'AbortError')));
    const platform = new WebPlatform({
      window: win({
        showOpenFilePicker: () => Promise.resolve([handle]),
        showSaveFilePicker: savePicker,
      }),
      document,
    });
    const opened = await platform.openFile();
    if (!opened) throw new Error('not opened');
    expect(await platform.saveFile(opened, PDF)).toBeNull();
    expect(handle.createWritable).not.toHaveBeenCalled();
    expect(savePicker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: 'a.pdf' }));
  });

  it('rethrows save picker errors other than cancelling', async () => {
    const platform = new WebPlatform({
      window: win({ showSaveFilePicker: () => Promise.reject(new Error('boom')) }),
      document,
    });
    await expect(platform.saveFileAs('a.pdf', PDF)).rejects.toThrow('boom');
  });

  it('asks the browser to confirm leaving only while there are unsaved changes', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const platform = new WebPlatform({ window, document });
    platform.setUnsavedChanges(true);
    platform.setUnsavedChanges(true);
    expect(add.mock.calls.filter(([type]) => type === 'beforeunload')).toHaveLength(1);
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    platform.setUnsavedChanges(false);
    expect(remove.mock.calls.filter(([type]) => type === 'beforeunload')).toHaveLength(1);
    expect(platform.onCloseRequested()).toBeTypeOf('function');
  });
});

describe('DesktopPlatform specifics', () => {
  it('reports unsaved changes to Rust once per change', () => {
    const invoke = vi.fn(() => Promise.resolve());
    const platform = new DesktopPlatform(invoke as Invoke);
    platform.setUnsavedChanges(true);
    platform.setUnsavedChanges(true);
    platform.setUnsavedChanges(false);
    expect(invoke.mock.calls).toEqual([
      ['set_unsaved_changes', { unsaved: true }],
      ['set_unsaved_changes', { unsaved: false }],
    ]);
  });

  it('closes the window when the close handler agrees', async () => {
    const invoke = vi.fn(() => Promise.resolve());
    let fire: () => void = () => undefined;
    const unlisten = vi.fn();
    const listen = vi.fn((_event: string, handler: () => void) => {
      fire = handler;
      return Promise.resolve(unlisten);
    });
    const platform = new DesktopPlatform(invoke as Invoke, listen);
    const answers = [false, true];
    const stop = platform.onCloseRequested(() => Promise.resolve(answers.shift() ?? false));
    await Promise.resolve();
    expect(listen).toHaveBeenCalledWith('phinpdf://close-requested', expect.any(Function));
    fire();
    await vi.waitFor(() => {
      expect(answers).toHaveLength(1);
    });
    expect(invoke).not.toHaveBeenCalledWith('close_window');
    fire();
    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('close_window');
    });
    stop();
    expect(unlisten).toHaveBeenCalled();
  });

  it('stops listening even if unsubscribed before the listener is ready', async () => {
    const unlisten = vi.fn();
    const platform = new DesktopPlatform(vi.fn(), () => Promise.resolve(unlisten));
    platform.onCloseRequested(() => Promise.resolve(true))();
    await vi.waitFor(() => {
      expect(unlisten).toHaveBeenCalled();
    });
    expect(new DesktopPlatform(vi.fn() as unknown as Invoke).onCloseRequested(vi.fn())).toBeTypeOf(
      'function',
    );
  });
});
