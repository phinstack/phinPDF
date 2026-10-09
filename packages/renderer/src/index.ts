export {
  cappedPixelRatio,
  configureRenderer,
  DEFAULT_MAX_FILE_BYTES,
  looksLikePdf,
  MAX_CANVAS_PIXELS,
  normalizeRotation,
  openDocument,
  RenderDocument,
  SECURE_DOCUMENT_OPTIONS,
} from './renderer.ts';
export type {
  OpenOptions,
  PageSize,
  PageTextItem,
  RenderOptions,
  RendererAssets,
  TextLayerResult,
} from './renderer.ts';
export { describeOpenError, OpenError, type OpenErrorCode } from './errors.ts';
export {
  MAX_OUTLINE_DEPTH,
  MAX_OUTLINE_NODES,
  resolveOutline,
  type OutlineNode,
} from './outline.ts';
export { toLoadedAnnotation, type LoadedAnnotation, type RawAnnotation } from './annotations.ts';
