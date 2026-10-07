// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FileTooLargeError, type OpenedFile, type Platform } from '@phinpdf/platform';
import { OpenError, type RenderDocument } from '@phinpdf/renderer';
import { App } from './App.tsx';

const file = (name = 'doc.pdf'): OpenedFile => ({ id: '1', name, bytes: new Uint8Array([1]) });

function fakeDoc(numPages = 3) {
  return {
    numPages,
    renderPage: vi.fn(() => Promise.resolve()),
    destroy: vi.fn(() => Promise.resolve()),
  } as unknown as RenderDocument & { destroy: ReturnType<typeof vi.fn> };
}

function fakePlatform(overrides: Partial<Platform> = {}): Platform {
  return {
    kind: 'web',
    openFile: vi.fn(() => Promise.resolve(file())),
    getLaunchFile: vi.fn(() => Promise.resolve(null)),
    saveFile: vi.fn(),
    saveFileAs: vi.fn(),
    print: vi.fn(),
    openExternalLink: vi.fn(),
    recentFiles: vi.fn(() => Promise.resolve([])),
    ...overrides,
  };
}

describe('App', () => {
  it('starts empty and explains that files stay local', () => {
    render(<App platform={fakePlatform()} openDocument={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('No document open.');
    expect(screen.getByText(/never leave your device/)).toBeInTheDocument();
  });

  it('opens a picked file and shows the page count and first page', async () => {
    const doc = fakeDoc(3);
    render(<App platform={fakePlatform()} openDocument={vi.fn(() => Promise.resolve(doc))} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open PDF…' }));
    expect(await screen.findByRole('img', { name: 'Page 1 of 3' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('doc.pdf — 3 pages');
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveAttribute('data-rendered', 'true');
    });
  });

  it('uses the singular for one page', async () => {
    render(
      <App platform={fakePlatform()} openDocument={vi.fn(() => Promise.resolve(fakeDoc(1)))} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open PDF…' }));
    expect(await screen.findByText('doc.pdf — 1 page')).toBeInTheDocument();
  });

  it('does nothing when the user cancels the picker', async () => {
    const openDocument = vi.fn();
    const platform = fakePlatform({ openFile: vi.fn(() => Promise.resolve(null)) });
    render(<App platform={platform} openDocument={openDocument} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open PDF…' }));
    expect(openDocument).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('No document open.');
  });

  it.each([
    [new OpenError('not-pdf', 'x'), 'This file is not a PDF.'],
    [new OpenError('password-required', 'x'), 'This PDF is password-protected.'],
    [new OpenError('invalid', 'x'), 'This PDF is damaged and could not be opened.'],
    [new FileTooLargeError(1), 'This file is too large to open.'],
    // The desktop side rejects with plain strings.
    ['not a PDF', 'This file is not a PDF.'],
    [new Error('weird'), 'The file could not be opened.'],
  ])('shows a plain-language error for %s', async (error, message) => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- see above
    render(<App platform={fakePlatform()} openDocument={vi.fn(() => Promise.reject(error))} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open PDF…' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('shows an error when the picker itself fails', async () => {
    const platform = fakePlatform({
      openFile: vi.fn(() => Promise.reject(new FileTooLargeError(9))),
    });
    render(<App platform={platform} openDocument={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open PDF…' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('too large');
  });

  it('opens the launch file automatically', async () => {
    const platform = fakePlatform({
      getLaunchFile: vi.fn(() => Promise.resolve(file('launched.pdf'))),
    });
    render(<App platform={platform} openDocument={vi.fn(() => Promise.resolve(fakeDoc(2)))} />);
    expect(await screen.findByText('launched.pdf — 2 pages')).toBeInTheDocument();
  });

  it('shows an error if reading the launch file fails', async () => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Tauri rejects with strings
    const platform = fakePlatform({ getLaunchFile: vi.fn(() => Promise.reject('not a PDF')) });
    render(<App platform={platform} openDocument={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('This file is not a PDF.');
  });

  it('opens a file with Ctrl+O', async () => {
    const platform = fakePlatform();
    render(<App platform={platform} openDocument={vi.fn(() => Promise.resolve(fakeDoc()))} />);
    await userEvent.keyboard('{Control>}o{/Control}');
    expect(platform.openFile).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('img')).toBeInTheDocument();
  });

  it('destroys the previous document when a new one opens, and on unmount', async () => {
    const first = fakeDoc();
    const second = fakeDoc();
    const openDocument = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const { unmount } = render(<App platform={fakePlatform()} openDocument={openDocument} />);
    const button = screen.getByRole('button', { name: 'Open PDF…' });
    await userEvent.click(button);
    await screen.findByRole('img');
    await userEvent.click(button);
    await waitFor(() => {
      expect(first.destroy).toHaveBeenCalledTimes(1);
    });
    expect(second.destroy).not.toHaveBeenCalled();
    act(() => {
      unmount();
    });
    expect(second.destroy).toHaveBeenCalledTimes(1);
  });

  it('shows an error when a page fails to render', async () => {
    const doc = fakeDoc();
    (doc.renderPage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('canvas broke'));
    render(<App platform={fakePlatform()} openDocument={vi.fn(() => Promise.resolve(doc))} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open PDF…' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This page could not be displayed.');
  });
});
