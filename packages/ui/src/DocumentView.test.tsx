// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DocumentView } from './DocumentView.tsx';
import { fakeSource } from './test/fake-document.ts';

const sizes = Array.from({ length: 200 }, () => ({ width: 600, height: 800 }));
const scroller = () => screen.getByRole('region', { name: 'doc' });
const nextFrame = () =>
  act(
    () =>
      new Promise((r) =>
        requestAnimationFrame(() => {
          r(undefined);
        }),
      ),
  );

describe('DocumentView', () => {
  it('renders only the pages near the viewport', async () => {
    render(
      <DocumentView document={fakeSource()} sizes={sizes} zoom={1} rotation={0} label="doc" />,
    );
    await nextFrame();
    const pages = screen.getAllByRole('img');
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.length).toBeLessThan(5);
    expect(pages[0]).toHaveAccessibleName('Page 1 of 200');
  });

  it('sizes the scroll area for the whole document', () => {
    render(
      <DocumentView document={fakeSource()} sizes={sizes} zoom={0.75} rotation={0} label="doc" />,
    );
    const inner = scroller().firstElementChild as HTMLElement;
    // 200 pages of 800pt at 0.75 zoom (x 4/3 CSS px per point) plus 201 gaps of 16px.
    expect(inner.style.height).toBe(`${String(200 * 800 + 201 * 16)}px`);
  });

  it('scrolls to a requested page and reports the current page', async () => {
    const onCurrentPageChange = vi.fn();
    const { rerender } = render(
      <DocumentView
        document={fakeSource()}
        sizes={sizes}
        zoom={0.75}
        rotation={0}
        label="doc"
        onCurrentPageChange={onCurrentPageChange}
      />,
    );
    rerender(
      <DocumentView
        document={fakeSource()}
        sizes={sizes}
        zoom={0.75}
        rotation={0}
        label="doc"
        scrollRequest={{ page: 49, key: 1 }}
        onCurrentPageChange={onCurrentPageChange}
      />,
    );
    // Page 50 starts at 16 + 49 * (800 + 16); the view leaves half a gap above it.
    expect(scroller().scrollTop).toBe(16 + 49 * 816 - 8);
    scroller().dispatchEvent(new Event('scroll'));
    await nextFrame();
    expect(onCurrentPageChange).toHaveBeenLastCalledWith(49);
    expect(screen.getAllByRole('img').map((p) => p.getAttribute('data-page'))).toContain('50');
  });

  it('keeps the same page in view when zooming', () => {
    const { rerender } = render(
      <DocumentView
        document={fakeSource()}
        sizes={sizes}
        zoom={0.75}
        rotation={0}
        label="doc"
        scrollRequest={{ page: 10, key: 1 }}
      />,
    );
    const before = scroller().scrollTop;
    rerender(
      <DocumentView
        document={fakeSource()}
        sizes={sizes}
        zoom={1.5}
        rotation={0}
        label="doc"
        scrollRequest={{ page: 10, key: 1 }}
      />,
    );
    const after = scroller().scrollTop;
    // Page 11 top at zoom 1.5: 16 + 10 * (1600 + 16) = 16176; the anchor keeps the same offset.
    expect(after).toBeGreaterThan(before * 1.9);
    expect(after).toBeLessThan(16176);
  });

  it('jumps to the start and end with Home and End', () => {
    render(
      <DocumentView
        document={fakeSource()}
        sizes={sizes}
        zoom={1}
        rotation={0}
        label="doc"
        scrollRequest={{ page: 20, key: 1 }}
      />,
    );
    const el = scroller();
    Object.defineProperty(el, 'scrollHeight', { value: 99_999 });
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(el.scrollTop).toBe(99_999);
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(el.scrollTop).toBe(0);
  });

  it('turns Ctrl+wheel into zoom steps', () => {
    const onWheelZoom = vi.fn();
    render(
      <DocumentView
        document={fakeSource()}
        sizes={sizes}
        zoom={1}
        rotation={0}
        label="doc"
        onWheelZoom={onWheelZoom}
      />,
    );
    const up = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, cancelable: true });
    scroller().dispatchEvent(up);
    scroller().dispatchEvent(
      new WheelEvent('wheel', { deltaY: 100, ctrlKey: true, cancelable: true }),
    );
    scroller().dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true }));
    expect(onWheelZoom.mock.calls).toEqual([[1], [-1]]);
    expect(up.defaultPrevented).toBe(true);
  });
});
