import type { SaveErrorCode, SaveRequest, SaveResult } from './engine.ts';

/** Messages between the editor client and its worker. */
export interface WorkerRequest {
  readonly id: number;
  readonly type: 'save';
  readonly request: SaveRequest;
}

export type WorkerResponse =
  | { readonly id: number; readonly ok: true; readonly result: SaveResult }
  | {
      readonly id: number;
      readonly ok: false;
      readonly error: { readonly code: SaveErrorCode | 'internal'; readonly message: string };
    };
