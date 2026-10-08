import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createPlatform } from '@phinpdf/platform';
import { openDocument } from '@phinpdf/renderer';
import { App } from './App.tsx';
import './App.css';
import { setupPdfjs } from './pdfjs-setup.ts';

setupPdfjs();
const platform = await createPlatform();
const root = document.getElementById('root');
if (!root) throw new Error('#root element missing');

createRoot(root).render(
  <StrictMode>
    <App
      platform={platform}
      openDocument={(bytes, password) =>
        openDocument(bytes, password === undefined ? {} : { password })
      }
    />
  </StrictMode>,
);

// Desktop smoke test hooks; only compiled into builds made with VITE_E2E=1.
if (import.meta.env.VITE_E2E === '1') {
  void import('./e2e/desktop-smoke.ts').then((m) => m.runDesktopSmoke());
}
