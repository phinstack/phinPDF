// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SaveError } from './engine.ts';

const applyChanges = vi.fn();
vi.mock('./engine.ts', async (original) => ({
  ...(await original<typeof import('./engine.ts')>()),
  applyChanges: (...args: unknown[]) => applyChanges(...args) as unknown,
}));
const init = vi.fn();
vi.mock('@embedpdf/pdfium', () => ({ init: (...args: unknown[]) => init(...args) as unknown }));
vi.mock('@embedpdf/pdfium/pdfium.wasm?url', () => ({ default: '/assets/pdfium.wasm' }));

afterEach(() => {
  vi.unstubAllGlobals();
});

async function send(id: number) {
  const posted = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
  posted.mockClear();
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { id, type: 'save', request: { bytes: new Uint8Array(), changes: [] } },
    }),
  );
  await vi.waitFor(() => {
    expect(posted).toHaveBeenCalled();
  });
  return posted.mock.calls[0];
}

describe('editor worker', () => {
  it('loads PDFium once, saves, and reports errors by code', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(new Uint8Array([0, 97, 115, 109]))));
    vi.stubGlobal('fetch', fetchMock);
    const module = { PDFiumExt_Init: vi.fn() };
    init.mockResolvedValue(module);
    await import('./worker.ts');

    const result = { bytes: new Uint8Array([1]), keys: [] };
    applyChanges.mockReturnValueOnce(result);
    expect(await send(1)).toEqual([{ id: 1, ok: true, result }, [result.bytes.buffer]]);
    expect(fetchMock).toHaveBeenCalledWith('/assets/pdfium.wasm');
    expect(module.PDFiumExt_Init).toHaveBeenCalledTimes(1);

    applyChanges.mockImplementationOnce(() => {
      throw new SaveError('password', 'needs password');
    });
    expect((await send(2))?.[0]).toEqual({
      id: 2,
      ok: false,
      error: { code: 'password', message: 'needs password' },
    });

    applyChanges.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    expect((await send(3))?.[0]).toMatchObject({
      ok: false,
      error: { code: 'internal', message: 'boom' },
    });

    applyChanges.mockImplementationOnce(() => {
      // Non-Error throws are reported as text.
      throw 'odd' as unknown as Error;
    });
    expect((await send(4))?.[0]).toMatchObject({ error: { code: 'internal', message: 'odd' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
