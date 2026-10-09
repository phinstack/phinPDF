import { DesktopPlatform } from './desktop/desktop-platform.ts';
import type { Platform } from './types.ts';
import { WebPlatform } from './web/web-platform.ts';

/** True inside the Tauri webview. */
export function isDesktop(global: object = globalThis): boolean {
  return '__TAURI_INTERNALS__' in global;
}

/**
 * Creates the platform for the current environment. The Tauri API is loaded lazily so
 * the web build never ships it.
 */
export async function createPlatform(): Promise<Platform> {
  if (isDesktop()) {
    const [{ invoke }, { listen }] = await Promise.all([
      import('@tauri-apps/api/core'),
      import('@tauri-apps/api/event'),
    ]);
    return new DesktopPlatform(invoke, (event, handler) => listen(event, handler));
  }
  return new WebPlatform({ window, document });
}
