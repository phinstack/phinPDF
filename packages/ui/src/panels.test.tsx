// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OutlineTree } from './OutlineTree.tsx';
import { PasswordDialog } from './PasswordDialog.tsx';
import { SearchBar, type SearchBarProps } from './SearchBar.tsx';
import { fakeSource } from './test/fake-document.ts';
import { Thumbnails } from './Thumbnails.tsx';

describe('Thumbnails', () => {
  const sizes = Array.from({ length: 50 }, () => ({ width: 612, height: 792 }));

  it('marks the current page and selects a page on click', async () => {
    const onSelect = vi.fn();
    render(
      <Thumbnails
        document={fakeSource()}
        sizes={sizes}
        currentPage={1}
        onSelect={onSelect}
        rotation={0}
      />,
    );
    expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('renders only nearby thumbnails', () => {
    render(
      <Thumbnails
        document={fakeSource()}
        sizes={sizes}
        currentPage={0}
        onSelect={vi.fn()}
        rotation={0}
      />,
    );
    expect(screen.getAllByRole('button').length).toBeLessThan(15);
  });
});

describe('OutlineTree', () => {
  const nodes = [
    { title: 'Chapter 1', pageIndex: 0, url: null, children: [] },
    {
      title: 'Chapter 2',
      pageIndex: 4,
      url: null,
      children: [{ title: 'Section 2.1', pageIndex: 5, url: null, children: [] }],
    },
    { title: 'Broken', pageIndex: null, url: null, children: [] },
  ];

  it('goes to a bookmark’s page and expands nested bookmarks', async () => {
    const onSelect = vi.fn();
    render(<OutlineTree nodes={nodes} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: 'Section 2.1' }));
    expect(onSelect).toHaveBeenCalledWith(5);
    await userEvent.click(screen.getByRole('button', { name: 'Collapse Chapter 2' }));
    expect(screen.queryByRole('button', { name: 'Section 2.1' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Broken' })).toBeDisabled();
  });

  it('says when there are no bookmarks', () => {
    render(<OutlineTree nodes={[]} onSelect={vi.fn()} />);
    expect(screen.getByText('This document has no bookmarks.')).toBeInTheDocument();
  });
});

describe('SearchBar', () => {
  const props = (over: Partial<SearchBarProps> = {}): SearchBarProps => ({
    query: 'fox',
    caseSensitive: false,
    wholeWord: false,
    currentIndex: 2,
    total: 27,
    scanned: 10,
    pageCount: 10,
    onQueryChange: vi.fn(),
    onOptionsChange: vi.fn(),
    onNext: vi.fn(),
    onPrevious: vi.fn(),
    onClose: vi.fn(),
    focusKey: 1,
    ...over,
  });

  it('shows the match position and steps with Enter and Shift+Enter', async () => {
    const p = props();
    render(<SearchBar {...p} />);
    expect(screen.getByText('3 of 27')).toBeInTheDocument();
    const input = screen.getByRole('searchbox', { name: 'Find in document' });
    expect(input).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    expect(p.onNext).toHaveBeenCalledTimes(1);
    expect(p.onPrevious).toHaveBeenCalledTimes(1);
    await userEvent.keyboard('{Escape}');
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it('shows progress while long documents are searched, then "No matches"', () => {
    const { rerender } = render(
      <SearchBar {...props({ total: 0, currentIndex: -1, scanned: 40, pageCount: 400 })} />,
    );
    expect(screen.getByText('Searching…')).toBeInTheDocument();
    expect(screen.getByText('Searching page 41 of 400…')).toBeInTheDocument();
    rerender(
      <SearchBar {...props({ total: 0, currentIndex: -1, scanned: 400, pageCount: 400 })} />,
    );
    expect(screen.getByText('No matches')).toBeInTheDocument();
  });

  it('reports option changes', async () => {
    const p = props();
    render(<SearchBar {...p} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Match case' }));
    expect(p.onOptionsChange).toHaveBeenCalledWith({ caseSensitive: true, wholeWord: false });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Whole words' }));
    expect(p.onOptionsChange).toHaveBeenCalledWith({ caseSensitive: false, wholeWord: true });
  });
});

describe('PasswordDialog', () => {
  it('submits the typed password', async () => {
    const onSubmit = vi.fn();
    render(
      <PasswordDialog
        fileName="secret.pdf"
        incorrect={false}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('secret.pdf')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Password'), 'hunter2');
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onSubmit).toHaveBeenCalledWith('hunter2');
  });

  it('explains a wrong password and can be cancelled', async () => {
    const onCancel = vi.fn();
    render(
      <PasswordDialog fileName="secret.pdf" incorrect onSubmit={vi.fn()} onCancel={onCancel} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('The password is incorrect.');
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
