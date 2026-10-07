// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebPlatform } from './web-platform.ts';

const PDF = new TextEncoder().encode('%PDF-1.4\n');

function fileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type=file]');
  if (!input) throw new Error('file input not found');
  return input;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('WebPlatform without the File System Access API', () => {
  const platform = (): WebPlatform => new WebPlatform({ window, document });

  it('falls back to a hidden file input limited to PDFs', async () => {
    const opened = platform().openFile();
    const input = fileInput();
    expect(input.accept).toBe('application/pdf,.pdf');
    expect(input.hidden).toBe(true);
    Object.defineProperty(input, 'files', {
      value: [new File([PDF as BlobPart], 'a.pdf', { type: 'application/pdf' })],
    });
    input.dispatchEvent(new Event('change'));
    const file = await opened;
    expect(file?.name).toBe('a.pdf');
    expect(Array.from(file?.bytes ?? [])).toEqual(Array.from(PDF));
    expect(document.querySelector('input[type=file]')).toBeNull();
  });

  it('resolves null and removes the input when the picker is cancelled', async () => {
    const opened = platform().openFile();
    fileInput().dispatchEvent(new Event('cancel'));
    expect(await opened).toBeNull();
    expect(document.querySelector('input[type=file]')).toBeNull();
  });

  it('resolves null when change fires with no file', async () => {
    const opened = platform().openFile();
    const input = fileInput();
    Object.defineProperty(input, 'files', { value: [] });
    input.dispatchEvent(new Event('change'));
    expect(await opened).toBeNull();
  });

  it('has no launch file in a plain browser tab', async () => {
    expect(await platform().getLaunchFile()).toBeNull();
  });
});

describe('WebPlatform picker errors', () => {
  it('rethrows picker errors other than cancellation', async () => {
    const picker = vi.fn(() => Promise.reject(new DOMException('denied', 'SecurityError')));
    const p = new WebPlatform({
      window: Object.assign(Object.create(window) as Window, { showOpenFilePicker: picker }),
      document,
    });
    await expect(p.openFile()).rejects.toThrow('denied');
  });
});

describe('WebPlatform.openExternalLink', () => {
  function setup(confirmed: boolean) {
    const open = vi.fn();
    const confirm = vi.fn(() => confirmed);
    const win = Object.assign(Object.create(window) as Window, { open });
    return { platform: new WebPlatform({ window: win, document, confirm }), open, confirm };
  }

  it('opens safe links in a new tab without an opener after confirmation', async () => {
    const { platform, open, confirm } = setup(true);
    expect(await platform.openExternalLink('https://example.com/x')).toBe(true);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('https://example.com/x'));
    expect(open).toHaveBeenCalledWith('https://example.com/x', '_blank', 'noopener,noreferrer');
  });

  it('does nothing when the user declines', async () => {
    const { platform, open } = setup(false);
    expect(await platform.openExternalLink('https://example.com')).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('never asks about or opens unsafe links', async () => {
    const { platform, open, confirm } = setup(true);
    expect(await platform.openExternalLink('javascript:alert(1)')).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
});
