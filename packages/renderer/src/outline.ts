/** A bookmark, with its destination resolved to a page. */
export interface OutlineNode {
  readonly title: string;
  /** 0-based page index, or null when the bookmark has no usable page destination. */
  readonly pageIndex: number | null;
  /** External link target (unsanitized; pass through the platform before opening). */
  readonly url: string | null;
  readonly children: readonly OutlineNode[];
}

/** The shape PDF.js returns from getOutline(), reduced to what we use. */
export interface RawOutlineItem {
  readonly title: string;
  readonly dest: string | readonly unknown[] | null;
  readonly url: string | null;
  readonly items: readonly RawOutlineItem[];
}

export interface OutlineResolver {
  readonly numPages: number;
  getDestination(name: string): Promise<readonly unknown[] | null>;
  getPageIndex(ref: object): Promise<number>;
}

/** Limits that keep a hostile outline from freezing the app. */
export const MAX_OUTLINE_NODES = 5000;
export const MAX_OUTLINE_DEPTH = 32;

async function resolvePage(
  dest: RawOutlineItem['dest'],
  resolver: OutlineResolver,
): Promise<number | null> {
  try {
    const explicit = typeof dest === 'string' ? await resolver.getDestination(dest) : dest;
    if (!Array.isArray(explicit) || explicit.length === 0) return null;
    const target: unknown = explicit[0];
    let index: number | null = null;
    if (typeof target === 'number') index = target;
    else if (target !== null && typeof target === 'object')
      index = await resolver.getPageIndex(target);
    return index !== null && Number.isInteger(index) && index >= 0 && index < resolver.numPages
      ? index
      : null;
  } catch {
    return null;
  }
}

/** Resolves bookmark destinations to page indices, depth-first, within the limits above. */
export async function resolveOutline(
  items: readonly RawOutlineItem[],
  resolver: OutlineResolver,
): Promise<OutlineNode[]> {
  let budget = MAX_OUTLINE_NODES;
  async function walk(level: readonly RawOutlineItem[], depth: number): Promise<OutlineNode[]> {
    const nodes: OutlineNode[] = [];
    for (const item of level) {
      if (budget <= 0) break;
      budget--;
      const children = depth < MAX_OUTLINE_DEPTH ? await walk(item.items, depth + 1) : [];
      nodes.push({
        title: item.title.trim() || 'Untitled',
        pageIndex: await resolvePage(item.dest, resolver),
        url: item.url,
        children,
      });
    }
    return nodes;
  }
  return walk(items, 0);
}
