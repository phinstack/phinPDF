/// <reference lib="webworker" />
/**
 * Web Worker that runs PDFium (ADR-0004). PDFium parses untrusted files, so it stays off
 * the main thread and under the same CSP as PDF.js. The WebAssembly module is fetched
 * only when the user first saves.
 */
import { init, type WrappedPdfiumModule } from '@embedpdf/pdfium';
import wasmUrl from '@embedpdf/pdfium/pdfium.wasm?url';
import { applyChanges, SaveError } from './engine.ts';
import type { WorkerRequest, WorkerResponse } from './protocol.ts';

declare const self: DedicatedWorkerGlobalScope;

let pdfium: Promise<WrappedPdfiumModule> | null = null;

function load(): Promise<WrappedPdfiumModule> {
  pdfium ??= (async () => {
    const response = await fetch(wasmUrl);
    if (!response.ok)
      throw new Error(`Could not load the editing engine (${String(response.status)})`);
    const module = await init({ wasmBinary: await response.arrayBuffer() });
    module.PDFiumExt_Init();
    return module;
  })();
  pdfium.catch(() => {
    pdfium = null;
  });
  return pdfium;
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const { id, request } = event.data;
  void (async () => {
    let response: WorkerResponse;
    try {
      const result = applyChanges(await load(), request);
      response = { id, ok: true, result };
      self.postMessage(response, [result.bytes.buffer as ArrayBuffer]);
      return;
    } catch (error) {
      response = {
        id,
        ok: false,
        error:
          error instanceof SaveError
            ? { code: error.code, message: error.message }
            : { code: 'internal', message: error instanceof Error ? error.message : String(error) },
      };
    }
    self.postMessage(response);
  })();
});
