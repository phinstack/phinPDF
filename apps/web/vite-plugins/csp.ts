import type { Plugin } from 'vite';

/**
 * Content Security Policy for the built app (web and desktop). Not applied in dev,
 * because Vite's hot reload needs inline scripts.
 *
 * - No 'unsafe-eval' and no 'unsafe-inline' scripts (PDF.js needs neither; ADR-0007).
 * - 'wasm-unsafe-eval' allows compiling WebAssembly only (PDF.js image decoders, and
 *   PDFium later). It does not allow JavaScript eval.
 * - connect-src allows our own origin plus Tauri's IPC endpoints, and nothing else.
 *   A PDF can never make the app contact a server.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self'",
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "connect-src 'self' ipc: http://ipc.localhost",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export function contentSecurityPolicy(): Plugin {
  return {
    name: 'phinpdf-csp',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}
