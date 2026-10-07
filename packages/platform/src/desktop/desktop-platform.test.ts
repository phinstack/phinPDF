import { describe, expect, it, vi } from 'vitest';
import { NotImplementedError } from '../types.ts';
import { DesktopPlatform, type Invoke } from './desktop-platform.ts';

describe('DesktopPlatform', () => {
  it('reads the launch file by token, never by path', async () => {
    const bytes = new TextEncoder().encode('%PDF-2.0\n');
    const invoke = vi.fn((command: string) =>
      Promise.resolve(
        command === 'launch_file'
          ? { id: 'tok-9', name: 'x.pdf', size: bytes.length }
          : bytes.buffer,
      ),
    );
    const file = await new DesktopPlatform(invoke as Invoke).getLaunchFile();
    expect(file).toEqual({ id: 'tok-9', name: 'x.pdf', bytes });
    expect(invoke.mock.calls).toEqual([['launch_file'], ['read_file', { id: 'tok-9' }]]);
  });

  it('returns null when launched without a file', async () => {
    const invoke = vi.fn(() => Promise.resolve(null));
    expect(await new DesktopPlatform(invoke as Invoke).getLaunchFile()).toBeNull();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('propagates errors from the Rust side', async () => {
    const invoke = vi.fn(() => Promise.reject(new Error('not a PDF')));
    await expect(new DesktopPlatform(invoke as Invoke).openFile()).rejects.toThrow('not a PDF');
  });

  it('does not open links yet', async () => {
    const p = new DesktopPlatform(vi.fn());
    await expect(p.openExternalLink()).rejects.toBeInstanceOf(NotImplementedError);
  });
});
