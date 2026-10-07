// @vitest-environment jsdom
/**
 * Contract tests: both platform implementations must behave the same way for the
 * operations the UI relies on. Each harness simulates the user picking a file.
 */
import { describe, expect, it, vi } from 'vitest';
import { DesktopPlatform, type Invoke } from './desktop/desktop-platform.ts';
import { FileTooLargeError, MAX_FILE_BYTES, NotImplementedError, type Platform } from './types.ts';
import { WebPlatform } from './web/web-platform.ts';

const PDF = new TextEncoder().encode('%PDF-1.7\n%test\n');

interface Harness {
  readonly name: string;
  /** Creates a platform where the next pick returns `file`, or cancels if null. */
  create(file: { name: string; bytes: Uint8Array; size?: number } | null): Platform;
}

const webHarness: Harness = {
  name: 'WebPlatform (File System Access API)',
  create(file) {
    const picker = vi.fn(() => {
      if (!file) return Promise.reject(new DOMException('cancelled', 'AbortError'));
      const blob = new File([file.bytes as BlobPart], file.name, { type: 'application/pdf' });
      if (file.size !== undefined) Object.defineProperty(blob, 'size', { value: file.size });
      return Promise.resolve([{ name: file.name, getFile: () => Promise.resolve(blob) }]);
    });
    return new WebPlatform({
      window: Object.assign(Object.create(window) as Window, { showOpenFilePicker: picker }),
      document,
    });
  },
};

const desktopHarness: Harness = {
  name: 'DesktopPlatform (Tauri IPC)',
  create(file) {
    const invoke = vi.fn((command: string, args?: Record<string, unknown>) => {
      if (command === 'pick_file') {
        return Promise.resolve(
          file ? { id: 'tok-1', name: file.name, size: file.size ?? file.bytes.length } : null,
        );
      }
      if (command === 'read_file' && args?.['id'] === 'tok-1' && file) {
        return Promise.resolve(file.bytes.slice().buffer);
      }
      return Promise.reject(new Error(`unexpected command ${command}`));
    });
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

  it('marks later-phase features as not implemented', async () => {
    const platform = harness.create(null);
    const file = { id: 'x', name: 'x.pdf', bytes: PDF };
    await expect(platform.saveFile(file, PDF)).rejects.toBeInstanceOf(NotImplementedError);
    await expect(platform.saveFileAs('x.pdf', PDF)).rejects.toBeInstanceOf(NotImplementedError);
    await expect(platform.print(PDF)).rejects.toBeInstanceOf(NotImplementedError);
  });

  it('starts with no recent files', async () => {
    expect(await harness.create(null).recentFiles()).toEqual([]);
  });
});
