import { describe, expect, it } from 'vitest';
import { isDesktop } from './detect.ts';

describe('isDesktop', () => {
  it('detects the Tauri webview by its internals object', () => {
    expect(isDesktop({ __TAURI_INTERNALS__: {} })).toBe(true);
    expect(isDesktop({})).toBe(false);
  });
});
