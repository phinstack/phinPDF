import { describe, expect, it } from 'vitest';
import {
  MAX_OUTLINE_DEPTH,
  MAX_OUTLINE_NODES,
  resolveOutline,
  type RawOutlineItem,
} from './outline.ts';

const ref = { num: 7, gen: 0 };
const resolver = {
  numPages: 10,
  getDestination: (name: string) =>
    Promise.resolve(name === 'intro' ? [ref, { name: 'Fit' }] : null),
  getPageIndex: (r: object) =>
    r === ref ? Promise.resolve(4) : Promise.reject(new Error('bad ref')),
};
const item = (over: Partial<RawOutlineItem>): RawOutlineItem => ({
  title: 'T',
  dest: null,
  url: null,
  items: [],
  ...over,
});

describe('resolveOutline', () => {
  it('resolves named, explicit, and numeric destinations', async () => {
    const nodes = await resolveOutline(
      [
        item({ title: 'Named', dest: 'intro' }),
        item({ title: 'Ref', dest: [ref] }),
        item({ title: 'Num', dest: [2] }),
      ],
      resolver,
    );
    expect(nodes.map((n) => [n.title, n.pageIndex])).toEqual([
      ['Named', 4],
      ['Ref', 4],
      ['Num', 2],
    ]);
  });

  it('gives null for missing, broken, or out-of-range destinations', async () => {
    const nodes = await resolveOutline(
      [
        item({ dest: 'missing' }),
        item({ dest: [{ num: 99, gen: 0 }] }),
        item({ dest: [50] }),
        item({ dest: [-1] }),
        item({ dest: [] }),
        item({ dest: null, url: 'https://example.com' }),
      ],
      resolver,
    );
    expect(nodes.map((n) => n.pageIndex)).toEqual([null, null, null, null, null, null]);
    expect(nodes[5]?.url).toBe('https://example.com');
  });

  it('names untitled bookmarks', async () => {
    const [node] = await resolveOutline([item({ title: '   ' })], resolver);
    expect(node?.title).toBe('Untitled');
  });

  it('caps the number of bookmarks', async () => {
    const many = Array.from({ length: MAX_OUTLINE_NODES + 100 }, () => item({}));
    expect(await resolveOutline(many, resolver)).toHaveLength(MAX_OUTLINE_NODES);
  });

  it('caps the nesting depth', async () => {
    let deep = item({ title: 'leaf' });
    for (let i = 0; i < MAX_OUTLINE_DEPTH + 10; i++) deep = item({ items: [deep] });
    let depth = 0;
    let [node] = await resolveOutline([deep], resolver);
    while (node && node.children.length > 0) {
      depth++;
      node = node.children[0];
    }
    expect(depth).toBe(MAX_OUTLINE_DEPTH);
  });
});
