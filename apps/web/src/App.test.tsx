// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FileTooLargeError, type OpenedFile, type Platform } from '@phinpdf/platform';
import { OpenError } from '@phinpdf/renderer';
import { App } from './App.tsx';
import { fakeDoc } from './test/fake-doc.ts';

const file = (name = 'doc.pdf', id = '1'): OpenedFile => ({ id, name, bytes: new Uint8Array([1]) });

function fakePlatform(overrides: Partial<Platform> = {}): Platform {
  return {
    kind: 'web',
    openFile: vi.fn(() => Promise.resolve(file())),
    getLaunchFile: vi.fn(() => Promise.resolve(null)),
    openDroppedFile: vi.fn((f: File) => Promise.resolve(file(f.name, 'drop'))),
    saveFile: vi.fn(),
    saveFileAs: vi.fn(),
    print: vi.fn(() => Promise.resolve()),
    openExternalLink: vi.fn(),
    recentFiles: vi.fn(() => Promise.resolve([])),
    ...overrides,
  };
}

const openButton = () => screen.getByRole('button', { name: 'Choose a PDF…' });

describe('App start screen', () => {
  it('invites the user to open a file and explains that files stay local', () => {
    render(<App platform={fakePlatform()} openDocument={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('No document open.');
    expect(screen.getByText(/Files never leave your device/)).toBeInTheDocument();
  });

  it('opens a picked file in the viewer', async () => {
    const doc = fakeDoc();
    render(<App platform={fakePlatform()} openDocument={vi.fn(() => Promise.resolve(doc))} />);
    await userEvent.click(openButton());
    expect(await screen.findByRole('region', { name: 'doc.pdf, 3 pages' })).toBeInTheDocument();
    expect(screen.getByLabelText('Page number')).toHaveValue('1');
    expect(screen.getByText('/ 3')).toBeInTheDocument();
    expect(document.title).toBe('doc.pdf – phinPDF');
  });

  it('does nothing when the picker is cancelled', async () => {
    const openDocument = vi.fn();
    render(
      <App
        platform={fakePlatform({ openFile: vi.fn(() => Promise.resolve(null)) })}
        openDocument={openDocument}
      />,
    );
    await userEvent.click(openButton());
    expect(openDocument).not.toHaveBeenCalled();
  });

  it.each([
    [new OpenError('not-pdf', 'x'), 'This file is not a PDF.'],
    [new OpenError('invalid', 'x'), 'This PDF is damaged and could not be opened.'],
    [new FileTooLargeError(1), 'This file is too large to open.'],
    ['not a PDF', 'This file is not a PDF.'],
    [new Error('weird'), 'The file could not be opened.'],
  ])('shows a plain-language error for %s', async (error, message) => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Tauri rejects with strings
    render(<App platform={fakePlatform()} openDocument={vi.fn(() => Promise.reject(error))} />);
    await userEvent.click(openButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('opens the launch file automatically', async () => {
    const platform = fakePlatform({
      getLaunchFile: vi.fn(() => Promise.resolve(file('launched.pdf'))),
    });
    render(<App platform={platform} openDocument={vi.fn(() => Promise.resolve(fakeDoc()))} />);
    expect(
      await screen.findByRole('region', { name: 'launched.pdf, 3 pages' }),
    ).toBeInTheDocument();
  });

  it('opens a file with Ctrl+O', async () => {
    const platform = fakePlatform();
    render(<App platform={platform} openDocument={vi.fn(() => Promise.resolve(fakeDoc()))} />);
    await userEvent.keyboard('{Control>}o{/Control}');
    expect(platform.openFile).toHaveBeenCalledTimes(1);
  });
});

describe('App password flow', () => {
  it('asks for a password, explains a wrong one, then opens with the right one', async () => {
    const doc = fakeDoc();
    const accepted = new Set(['right']);
    const openDocument = vi.fn((_bytes: Uint8Array, attempt?: string) => {
      if (attempt === undefined) return Promise.reject(new OpenError('password-required', 'x'));
      return accepted.has(attempt)
        ? Promise.resolve(doc)
        : Promise.reject(new OpenError('password-incorrect', 'x'));
    });
    render(<App platform={fakePlatform()} openDocument={openDocument} />);
    await userEvent.click(openButton());
    expect(await screen.findByText('This PDF is password-protected')).toBeInTheDocument();
    // A real modal dialog makes the page behind it inert; jsdom doesn't, so scope queries.
    const dialog = () => within(screen.getByRole('dialog'));
    await userEvent.type(dialog().getByLabelText('Password'), 'wrong');
    await userEvent.click(dialog().getByRole('button', { name: 'Open' }));
    expect(await screen.findByText('The password is incorrect. Try again.')).toBeInTheDocument();
    await userEvent.type(dialog().getByLabelText('Password'), 'right');
    await userEvent.click(dialog().getByRole('button', { name: 'Open' }));
    expect(await screen.findByRole('region', { name: 'doc.pdf, 3 pages' })).toBeInTheDocument();
    expect(openDocument).toHaveBeenLastCalledWith(expect.any(Uint8Array), 'right');
  });

  it('returns to the start screen when cancelled', async () => {
    render(
      <App
        platform={fakePlatform()}
        openDocument={vi.fn(() => Promise.reject(new OpenError('password-required', 'x')))}
      />,
    );
    await userEvent.click(openButton());
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('This PDF is password-protected')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('No document open.');
  });
});

describe('App drag and drop', () => {
  it('shows a drop hint while dragging and opens the dropped file', async () => {
    const platform = fakePlatform();
    const { container } = render(
      <App platform={platform} openDocument={vi.fn(() => Promise.resolve(fakeDoc()))} />,
    );
    const dropped = new File([new Uint8Array([1])], 'dropped.pdf');
    const dataTransfer = { types: ['Files'], files: [dropped], dropEffect: 'none' };
    act(() => {
      fireEvent.dragEnter(window, { dataTransfer });
    });
    expect(container.ownerDocument.querySelector('.drop-overlay')).not.toBeNull();
    act(() => {
      fireEvent.drop(window, { dataTransfer });
    });
    expect(platform.openDroppedFile).toHaveBeenCalledWith(dropped);
    expect(await screen.findByRole('region', { name: 'dropped.pdf, 3 pages' })).toBeInTheDocument();
    expect(container.ownerDocument.querySelector('.drop-overlay')).toBeNull();
  });

  it('ignores drags that carry no files', () => {
    const platform = fakePlatform();
    const { container } = render(<App platform={platform} openDocument={vi.fn()} />);
    act(() => {
      fireEvent.dragEnter(window, { dataTransfer: { types: ['text/plain'], files: [] } });
    });
    expect(container.ownerDocument.querySelector('.drop-overlay')).toBeNull();
  });
});

describe('App document lifecycle', () => {
  it('destroys the previous document when another opens, and on unmount', async () => {
    const first = fakeDoc();
    const second = fakeDoc(['only page']);
    const openDocument = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const platform = fakePlatform({
      openFile: vi
        .fn()
        .mockResolvedValueOnce(file('a.pdf', 'a'))
        .mockResolvedValueOnce(file('b.pdf', 'b')),
    });
    const { unmount } = render(<App platform={platform} openDocument={openDocument} />);
    await userEvent.click(openButton());
    await screen.findByRole('region', { name: 'a.pdf, 3 pages' });
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByRole('region', { name: 'b.pdf, 1 page' });
    await waitFor(() => {
      expect(first.destroy).toHaveBeenCalledTimes(1);
    });
    unmount();
    expect(second.destroy).toHaveBeenCalledTimes(1);
  });
});
