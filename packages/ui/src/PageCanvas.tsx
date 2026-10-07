import { useEffect, useRef } from 'react';
import type { RenderDocument } from '@phinpdf/renderer';

export interface PageCanvasProps {
  readonly document: Pick<RenderDocument, 'renderPage'>;
  readonly pageNumber: number;
  /** CSS pixels per PDF point. */
  readonly scale?: number;
  /** Accessible name, for example "Page 1 of 10". */
  readonly label: string;
  readonly onRendered?: () => void;
  readonly onError?: (error: unknown) => void;
}

function isCancellation(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'RenderingCancelledException')
  );
}

/** Draws one PDF page. Re-renders when the page or scale changes, and cancels stale work. */
export function PageCanvas({
  document,
  pageNumber,
  scale = 1,
  label,
  onRendered,
  onError,
}: PageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller = new AbortController();
    const pixelRatio = globalThis.devicePixelRatio || 1;
    document.renderPage(pageNumber, canvas, { scale, pixelRatio, signal: controller.signal }).then(
      () => {
        if (!controller.signal.aborted) onRendered?.();
      },
      (error: unknown) => {
        if (!isCancellation(error)) onError?.(error);
      },
    );
    return () => {
      controller.abort();
    };
  }, [document, pageNumber, scale, onRendered, onError]);

  return <canvas ref={canvasRef} className="phinpdf-page" role="img" aria-label={label} />;
}
