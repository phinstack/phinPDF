import { vi } from 'vitest';
import type { Editor, SaveRequest, SaveResult } from '@phinpdf/editor';
import type { Platform } from '@phinpdf/platform';

/** A Platform with every method mocked. */
export function fakePlatform(overrides: Partial<Platform> = {}): Platform {
  return {
    kind: 'web',
    openFile: vi.fn(() => Promise.resolve(null)),
    getLaunchFile: vi.fn(() => Promise.resolve(null)),
    openDroppedFile: vi.fn(),
    saveFile: vi.fn((file: { id: string; name: string }) => Promise.resolve(file)),
    saveFileAs: vi.fn((name: string) => Promise.resolve({ id: 'saved-as', name })),
    setUnsavedChanges: vi.fn(),
    onCloseRequested: vi.fn(() => () => undefined),
    print: vi.fn(() => {
      window.dispatchEvent(new Event('afterprint'));
      return Promise.resolve();
    }),
    openExternalLink: vi.fn(),
    recentFiles: vi.fn(() => Promise.resolve([])),
    ...overrides,
  };
}

/** An Editor whose save appends a marker byte and reports a key for every change. */
export function fakeEditor() {
  const save = vi.fn((request: SaveRequest): Promise<SaveResult> => {
    const bytes = new Uint8Array([...request.bytes, 0x25]);
    const keys = request.changes.flatMap((c) =>
      c.op === 'delete'
        ? []
        : [
            [
              c.annotation.id,
              {
                subtype: c.annotation.kind === 'note' ? ('Text' as const) : ('Highlight' as const),
                rect: { x0: 0, y0: 0, x1: 1, y1: 1 },
                name: c.annotation.id,
              },
            ] as const,
          ],
    );
    return Promise.resolve({ bytes, keys });
  });
  const editor: Editor = { save, dispose: vi.fn() };
  return Object.assign(editor, { save });
}
