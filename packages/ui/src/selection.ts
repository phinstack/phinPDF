import { mergeLineRects, viewRectToPdf, type PdfRect, type ViewTransform } from '@phinpdf/core';

/**
 * The text selected in page text layers, as one PDF-space rectangle per line, grouped by
 * 0-based page index. Only text inside `.textLayer` elements counts, so a selection that
 * strays into the toolbar or between pages yields just the text it covers.
 */
export function selectionToPageRects(
  selection: Selection | null,
  transformFor: (pageIndex: number) => ViewTransform | null,
): Map<number, PdfRect[]> {
  const result = new Map<number, PdfRect[]>();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return result;
  const range = selection.getRangeAt(0);
  const root = range.commonAncestorContainer;
  const doc = root.ownerDocument ?? (root as Document);
  const byPage = new Map<HTMLElement, DOMRect[]>();

  const walker = doc.createTreeWalker(
    root.nodeType === Node.TEXT_NODE ? (root.parentNode ?? root) : root,
    NodeFilter.SHOW_TEXT,
  );
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    if (!range.intersectsNode(text) || !text.data.trim()) continue;
    const page = text.parentElement
      ?.closest<HTMLElement>('.textLayer')
      ?.closest<HTMLElement>('.phinpdf-page');
    if (!page) continue;
    const part = doc.createRange();
    part.selectNodeContents(text);
    if (text === range.startContainer) part.setStart(text, range.startOffset);
    if (text === range.endContainer) part.setEnd(text, range.endOffset);
    if (part.collapsed) continue;
    const rects = byPage.get(page) ?? [];
    rects.push(...Array.from(part.getClientRects()));
    byPage.set(page, rects);
  }

  for (const [page, rects] of byPage) {
    const pageIndex = Number(page.dataset['page']) - 1;
    const transform = transformFor(pageIndex);
    if (!transform || !Number.isInteger(pageIndex)) continue;
    const origin = page.getBoundingClientRect();
    const lines = mergeLineRects(
      rects.map((r) => ({
        left: r.left - origin.left,
        top: r.top - origin.top,
        width: r.width,
        height: r.height,
      })),
    );
    if (lines.length > 0) {
      result.set(
        pageIndex,
        lines.map((line) => viewRectToPdf(line, transform)),
      );
    }
  }
  return result;
}
