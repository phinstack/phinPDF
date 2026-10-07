/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" only in the desktop smoke-test build (see src/e2e/desktop-smoke.ts). */
  readonly VITE_E2E?: string;
}
