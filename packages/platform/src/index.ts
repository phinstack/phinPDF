export * from './types.ts';
export { sanitizeExternalUrl } from './links.ts';
export { WebPlatform, type WebPlatformEnv } from './web/web-platform.ts';
export { DesktopPlatform, type Invoke } from './desktop/desktop-platform.ts';
export { createPlatform, isDesktop } from './detect.ts';
