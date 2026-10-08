/**
 * Zoom 100% means "actual size": one PDF point (1/72 inch) is 1/96 inch on screen,
 * matching Acrobat Reader and the PDF.js viewer.
 */
export const CSS_PIXELS_PER_POINT = 96 / 72;

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
export const ZOOM_STEPS = [
  0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 6.5, 8,
] as const;

export type ZoomMode =
  | { readonly kind: 'scale'; readonly scale: number }
  | { readonly kind: 'auto' }
  | { readonly kind: 'fit-width' }
  | { readonly kind: 'fit-page' };

/** "Automatic" never zooms portrait pages beyond this, however wide the window. */
export const MAX_AUTO_ZOOM = 1.25;

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

export const clampZoom = (scale: number): number =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number.isFinite(scale) ? scale : 1));

/**
 * Resolves a zoom mode to a zoom factor. `page` is the reference page's size in CSS
 * pixels at 100%; `padding` is the space to leave around it in the viewport.
 */
export function resolveZoom(
  mode: ZoomMode,
  page: Viewport,
  viewport: Viewport,
  padding: number,
): number {
  if (mode.kind === 'scale') return clampZoom(mode.scale);
  if (page.width <= 0 || page.height <= 0) return 1;
  const widthFit = (viewport.width - padding * 2) / page.width;
  if (mode.kind === 'fit-width') return clampZoom(widthFit);
  const heightFit = (viewport.height - padding * 2) / page.height;
  if (mode.kind === 'auto') {
    // Like the PDF.js viewer: fit landscape pages whole; fit portrait pages to the width,
    // but not beyond MAX_AUTO_ZOOM.
    const landscape = page.width > page.height;
    return clampZoom(landscape ? Math.min(widthFit, heightFit) : Math.min(widthFit, MAX_AUTO_ZOOM));
  }
  return clampZoom(Math.min(widthFit, heightFit));
}

const EPSILON = 0.001;

/** The next preset zoom above `scale`. */
export function zoomIn(scale: number): number {
  return ZOOM_STEPS.find((step) => step > scale + EPSILON) ?? MAX_ZOOM;
}

/** The next preset zoom below `scale`. */
export function zoomOut(scale: number): number {
  return [...ZOOM_STEPS].reverse().find((step) => step < scale - EPSILON) ?? MIN_ZOOM;
}

export const formatZoom = (scale: number): string => `${String(Math.round(scale * 100))}%`;

/** Parses what a user typed in the zoom box ("125", "125%", " 80 % "). */
export function parseZoom(input: string): number | null {
  const text = input.replace(/\s/g, '').replace(/%$/, '');
  if (!/^[0-9.]+$/.test(text)) return null;
  const value = Number(text) / 100;
  return Number.isFinite(value) && value > 0 ? clampZoom(value) : null;
}
