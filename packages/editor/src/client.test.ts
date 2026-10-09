import { describe, expect, it, vi } from 'vitest';
import { createEditor } from './client.ts';
import { SaveError } from './engine.ts';
import type { WorkerRequest, WorkerResponse } from './protocol.ts';

/** A Worker stand-in that answers each request with `respond`. */
class FakeWorker extends EventTarget {
  terminated = false;
  readonly sent: WorkerRequest[] = [];
  constructor(private readonly respond: (r: WorkerRequest) => WorkerResponse | 'crash' | null) {
    super();
  }
  postMessage(message: WorkerRequest, transfer: Transferable[]): void {
    expect(transfer).toHaveLength(1);
    this.sent.push(message);
    const reply = this.respond(message);
    queueMicrotask(() => {
      if (reply === 'crash') {
        const event = new Event('error', { cancelable: true });
        Object.assign(event, { message: 'worker died' });
        this.dispatchEvent(event);
      } else if (reply) {
        this.dispatchEvent(new MessageEvent('message', { data: reply }));
      }
    });
  }
  terminate(): void {
    this.terminated = true;
  }
}

const request = { bytes: new Uint8Array([1, 2, 3]), changes: [] };

describe('createEditor', () => {
  it('starts the worker on the first save and resolves with its result', async () => {
    const result = { bytes: new Uint8Array([9]), keys: [] };
    const worker = new FakeWorker((m) => ({ id: m.id, ok: true, result }));
    const spawn = vi.fn(() => worker as unknown as Worker);
    const editor = createEditor(spawn);
    expect(spawn).not.toHaveBeenCalled();
    await expect(editor.save(request)).resolves.toBe(result);
    await editor.save(request);
    expect(spawn).toHaveBeenCalledTimes(1);
    // The caller's bytes are copied, not transferred away.
    expect(Array.from(request.bytes)).toEqual([1, 2, 3]);
    expect(worker.sent[0]?.request.bytes).not.toBe(request.bytes);
  });

  it('turns worker errors into SaveError or Error', async () => {
    const replies: WorkerResponse['ok'][] = [];
    const worker = new FakeWorker((m) =>
      m.id === 1
        ? { id: 1, ok: false, error: { code: 'password', message: 'needs password' } }
        : { id: m.id, ok: false, error: { code: 'internal', message: 'boom' } },
    );
    const editor = createEditor(() => worker as unknown as Worker);
    const first = editor.save(request);
    await expect(first).rejects.toBeInstanceOf(SaveError);
    await expect(first).rejects.toMatchObject({ code: 'password' });
    const second = editor.save(request);
    await expect(second).rejects.toThrow('boom');
    await expect(second).rejects.not.toBeInstanceOf(SaveError);
    expect(replies).toEqual([]);
  });

  it('ignores replies it did not ask for', async () => {
    const worker = new FakeWorker((m) => ({
      id: m.id,
      ok: true,
      result: { bytes: new Uint8Array(), keys: [] },
    }));
    const editor = createEditor(() => worker as unknown as Worker);
    worker.dispatchEvent(new MessageEvent('message', { data: { id: 99, ok: true } }));
    await expect(editor.save(request)).resolves.toBeDefined();
  });

  it('fails pending saves and restarts after the worker crashes', async () => {
    const workers: FakeWorker[] = [];
    const editor = createEditor(() => {
      const w = new FakeWorker((m) =>
        workers.length === 1
          ? 'crash'
          : { id: m.id, ok: true, result: { bytes: new Uint8Array(), keys: [] } },
      );
      workers.push(w);
      return w as unknown as Worker;
    });
    await expect(editor.save(request)).rejects.toThrow('worker died');
    expect(workers[0]?.terminated).toBe(true);
    await expect(editor.save(request)).resolves.toBeDefined();
    expect(workers).toHaveLength(2);
  });

  it('rejects pending saves on dispose', async () => {
    const worker = new FakeWorker(() => null);
    const editor = createEditor(() => worker as unknown as Worker);
    const pending = editor.save(request);
    editor.dispose();
    await expect(pending).rejects.toThrow('closed');
    expect(worker.terminated).toBe(true);
    editor.dispose();
  });
});
