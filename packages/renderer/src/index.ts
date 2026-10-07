export {
  configureRenderer,
  DEFAULT_MAX_FILE_BYTES,
  looksLikePdf,
  openDocument,
  RenderDocument,
  SECURE_DOCUMENT_OPTIONS,
} from './renderer.ts';
export type { OpenOptions, PageSize, RenderOptions, RendererAssets } from './renderer.ts';
export { describeOpenError, OpenError, type OpenErrorCode } from './errors.ts';
