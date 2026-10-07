import { createReadStream, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { Plugin } from 'vite';

/** PDF.js data folders the renderer fetches at runtime (fonts, CMaps, WASM decoders, ICC). */
export const PDFJS_ASSET_DIRS = ['standard_fonts', 'cmaps', 'wasm', 'iccs'] as const;
const SAFE_NAME = /^[\w.-]+$/;

/**
 * Serves PDF.js assets from our own origin under `<base>pdfjs/<dir>/` (dev) and copies
 * them into the build. Same-origin keeps the CSP strict: no CDN, no network.
 */
export function pdfjsAssets(): Plugin {
  const require = createRequire(import.meta.url);
  const root = dirname(require.resolve('pdfjs-dist/package.json'));
  let base = '/';
  return {
    name: 'phinpdf-pdfjs-assets',
    configResolved(config) {
      base = config.base;
    },
    configureServer(server) {
      const prefix = `${base}pdfjs/`;
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0] ?? '';
        if (!path.startsWith(prefix)) {
          next();
          return;
        }
        const [dir, name, ...rest] = path.slice(prefix.length).split('/');
        const known = (PDFJS_ASSET_DIRS as readonly string[]).includes(dir ?? '');
        if (!known || !name || rest.length > 0 || !SAFE_NAME.test(name)) {
          res.statusCode = 404;
          res.end();
          return;
        }
        const file = join(root, dir ?? '', name);
        try {
          if (!statSync(file).isFile()) throw new Error('not a file');
        } catch {
          res.statusCode = 404;
          res.end();
          return;
        }
        createReadStream(file).pipe(res);
      });
    },
    generateBundle() {
      for (const dir of PDFJS_ASSET_DIRS) {
        for (const name of readdirSync(join(root, dir))) {
          this.emitFile({
            type: 'asset',
            fileName: `pdfjs/${dir}/${name}`,
            source: readFileSync(join(root, dir, name)),
          });
        }
      }
    },
  };
}
