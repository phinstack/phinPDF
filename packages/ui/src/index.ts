import './viewer.css';

export { PageView, type PageHighlights, type PageSource, type PageViewProps } from './PageView.tsx';
export { PAGE_GAP, THUMBNAIL_GAP, THUMBNAIL_WIDTH } from './constants.ts';
export { DocumentView, type DocumentViewProps, type ScrollRequest } from './DocumentView.tsx';
export { Thumbnails, type ThumbnailsProps } from './Thumbnails.tsx';
export { OutlineTree, type OutlineTreeProps } from './OutlineTree.tsx';
export { SearchBar, type SearchBarProps } from './SearchBar.tsx';
export { PasswordDialog, type PasswordDialogProps } from './PasswordDialog.tsx';
export { useScrollMetrics, type ScrollMetrics } from './use-scroll-metrics.ts';
export { hitTestMarkup, NOTE_ICON_PX, noteRectAt } from './annotation-hit.ts';
export {
  AnnotationLayer,
  type AnnotationHandlers,
  type AnnotationLayerProps,
  type AnnotationTool,
} from './AnnotationLayer.tsx';
export { selectionToPageRects } from './selection.ts';
export { UnsavedChangesDialog, type UnsavedChangesDialogProps } from './UnsavedChangesDialog.tsx';
