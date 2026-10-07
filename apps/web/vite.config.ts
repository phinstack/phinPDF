import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { contentSecurityPolicy } from './vite-plugins/csp.ts';
import { pdfjsAssets } from './vite-plugins/pdfjs-assets.ts';

export default defineConfig({
  // GitHub Pages serves the app from /<repo>/; everything else uses the root.
  base: process.env['PHINPDF_BASE'] ?? '/',
  plugins: [react(), pdfjsAssets(), contentSecurityPolicy()],
  build: {
    target: 'es2022',
    sourcemap: true,
    // pdf.js alone is about 500 KB minified. Phase 2 loads it lazily on first open.
    chunkSizeWarningLimit: 1024,
  },
  server: { port: 5173, strictPort: true },
});
