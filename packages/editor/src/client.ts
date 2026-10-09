import { SaveError, type SaveRequest, type SaveResult } from './engine.ts';
import type { WorkerRequest, WorkerResponse } from './protocol.ts';

export interface Editor {
  /** Writes the changes into a copy of the file. The input bytes are not modified. */
  save(request: SaveRequest): Promise<SaveResult>;
  /** Stops the worker. A later save starts a new one. */
  dispose(): void;
}

export type SpawnWorker = () => Worker;

const spawnDefault: SpawnWorker = () =>
  new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'phinpdf-editor' });

/** Creates an editor whose PDFium worker starts on the first save. */
export function createEditor(spawn: SpawnWorker = spawnDefault): Editor {
  let worker: Worker | null = null;
  let nextId = 0;
  const pending = new Map<
    number,
    { resolve: (r: SaveResult) => void; reject: (e: Error) => void }
  >();

  const failAll = (error: Error): void => {
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  };

  const start = (): Worker => {
    if (worker) return worker;
    const w = spawn();
    w.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.ok) entry.resolve(message.result);
      else if (message.error.code === 'internal') entry.reject(new Error(message.error.message));
      else entry.reject(new SaveError(message.error.code, message.error.message));
    });
    w.addEventListener('error', (event) => {
      event.preventDefault();
      failAll(new Error(event.message || 'The editing engine stopped unexpectedly'));
      w.terminate();
      if (worker === w) worker = null;
    });
    worker = w;
    return w;
  };

  return {
    save(request) {
      const w = start();
      nextId += 1;
      const id = nextId;
      // Send a copy so the caller's bytes stay usable (the copy is transferred, not cloned).
      const bytes = request.bytes.slice();
      const message: WorkerRequest = { id, type: 'save', request: { ...request, bytes } };
      return new Promise<SaveResult>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        w.postMessage(message, [bytes.buffer]);
      });
    },
    dispose() {
      failAll(new Error('The editor was closed'));
      worker?.terminate();
      worker = null;
    },
  };
}
