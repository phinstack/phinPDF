// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PageCanvas } from './PageCanvas.tsx';

type RenderPage = (
  page: number,
  canvas: HTMLCanvasElement,
  options?: { scale?: number; pixelRatio?: number; signal?: AbortSignal },
) => Promise<void>;

const fakeDoc = (renderPage: RenderPage) => ({ renderPage: vi.fn(renderPage) });

describe('PageCanvas', () => {
  it('renders the page into its canvas with an accessible label', async () => {
    const doc = fakeDoc(() => Promise.resolve());
    const onRendered = vi.fn();
    render(
      <PageCanvas
        document={doc}
        pageNumber={2}
        scale={1.5}
        label="Page 2 of 5"
        onRendered={onRendered}
      />,
    );
    const canvas = screen.getByRole('img', { name: 'Page 2 of 5' });
    await waitFor(() => {
      expect(onRendered).toHaveBeenCalledTimes(1);
    });
    expect(doc.renderPage).toHaveBeenCalledWith(2, canvas, expect.objectContaining({ scale: 1.5 }));
  });

  it('aborts rendering when unmounted', () => {
    let signal: AbortSignal | undefined;
    const doc = fakeDoc((_p, _c, options) => {
      signal = options?.signal;
      return new Promise<void>(() => undefined);
    });
    const { unmount } = render(<PageCanvas document={doc} pageNumber={1} label="Page 1" />);
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it('reports real errors but ignores cancellations', async () => {
    const onError = vi.fn();
    const cancelled = Object.assign(new Error('cancelled'), {
      name: 'RenderingCancelledException',
    });
    const { rerender } = render(
      <PageCanvas
        document={fakeDoc(() => Promise.reject(cancelled))}
        pageNumber={1}
        label="p"
        onError={onError}
      />,
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(onError).not.toHaveBeenCalled();
    const boom = new Error('boom');
    rerender(
      <PageCanvas
        document={fakeDoc(() => Promise.reject(boom))}
        pageNumber={1}
        label="p"
        onError={onError}
      />,
    );
    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(boom);
    });
  });
});
