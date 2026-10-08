// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PageView, type PageHighlights } from './PageView.tsx';
import { fakeSource } from './test/fake-document.ts';

const base = {
  pageNumber: 2,
  scale: 1.5,
  rotation: 90,
  width: 300,
  height: 400,
  top: 10,
  left: 20,
  label: 'Page 2 of 9',
};

describe('PageView', () => {
  it('renders the page and its text layer with the same scale and rotation', async () => {
    const source = fakeSource();
    render(<PageView document={source} {...base} />);
    const page = screen.getByRole('img', { name: 'Page 2 of 9' });
    expect(page).toHaveStyle({ top: '10px', left: '20px', width: '300px', height: '400px' });
    await waitFor(() => {
      expect(page).toHaveAttribute('data-text-ready', 'true');
    });
    expect(source.renderPage).toHaveBeenCalledWith(
      2,
      expect.any(HTMLCanvasElement),
      expect.objectContaining({ scale: 1.5, rotation: 90 }),
    );
    expect(source.renderTextLayer).toHaveBeenCalledWith(
      2,
      expect.any(HTMLElement),
      expect.objectContaining({ scale: 1.5, rotation: 90 }),
    );
    expect(page.querySelector('.textLayer')).toHaveTextContent('Hello world');
  });

  it('wraps search matches in marks and removes them when cleared', async () => {
    const source = fakeSource(['The quick brown fox', 'jumps']);
    const highlights: PageHighlights = {
      itemCount: 2,
      matches: [
        { ranges: [{ item: 0, start: 4, end: 9 }], current: false },
        {
          ranges: [
            { item: 0, start: 16, end: 19 },
            { item: 1, start: 0, end: 5 },
          ],
          current: true,
        },
      ],
    };
    const { container, rerender } = render(
      <PageView document={source} {...base} highlights={highlights} />,
    );
    await waitFor(() => {
      expect(container.querySelectorAll('mark')).toHaveLength(3);
    });
    const marks = [...container.querySelectorAll('mark')];
    expect(marks.map((m) => m.textContent)).toEqual(['quick', 'fox', 'jumps']);
    expect(marks.map((m) => m.classList.contains('current'))).toEqual([false, true, true]);
    expect(container.querySelector('.textLayer span')?.textContent).toBe('The quick brown fox');

    rerender(<PageView document={source} {...base} highlights={undefined} />);
    await waitFor(() => {
      expect(container.querySelectorAll('mark')).toHaveLength(0);
    });
    expect(container.querySelector('.textLayer span')?.textContent).toBe('The quick brown fox');
  });

  it('skips highlights that refer to a different set of text items', async () => {
    const source = fakeSource(['one item']);
    const highlights: PageHighlights = {
      itemCount: 5,
      matches: [{ ranges: [{ item: 0, start: 0, end: 3 }], current: true }],
    };
    const { container } = render(<PageView document={source} {...base} highlights={highlights} />);
    await waitFor(() => {
      expect(container.querySelector('[data-text-ready="true"]')).not.toBeNull();
    });
    expect(container.querySelectorAll('mark')).toHaveLength(0);
  });

  it('reports render errors but not cancellations', async () => {
    const onError = vi.fn();
    const source = fakeSource();
    const cancelled = Object.assign(new Error('x'), { name: 'RenderingCancelledException' });
    source.renderPage.mockRejectedValueOnce(cancelled).mockRejectedValueOnce(new Error('broken'));
    const { rerender } = render(<PageView document={source} {...base} onError={onError} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(onError).not.toHaveBeenCalled();
    rerender(<PageView document={source} {...base} scale={2} onError={onError} />);
    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'broken' }));
    });
  });

  it('aborts rendering and frees the canvas when unmounted', () => {
    const source = fakeSource();
    let signal: AbortSignal | undefined;
    source.renderPage.mockImplementation((_p, _c, options) => {
      signal = (options as { signal: AbortSignal }).signal;
      return new Promise(() => undefined);
    });
    const { container, unmount } = render(<PageView document={source} {...base} />);
    const canvas = container.querySelector('canvas');
    if (!canvas) throw new Error('no canvas');
    canvas.width = 500;
    unmount();
    expect(signal?.aborted).toBe(true);
    expect(canvas.width).toBe(0);
  });
});
