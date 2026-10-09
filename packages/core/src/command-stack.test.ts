import { describe, expect, it, vi } from 'vitest';
import { CommandStack, type Command } from './command-stack.ts';

const add = (n: number): Command<number> => ({
  label: `Add ${String(n)}`,
  apply: (s) => s + n,
  revert: (s) => s - n,
});

describe('CommandStack', () => {
  it('applies commands and exposes the new state', () => {
    const stack = new CommandStack(0);
    stack.execute(add(2));
    stack.execute(add(3));
    expect(stack.state).toBe(5);
  });

  it('undoes and redoes in order', () => {
    const stack = new CommandStack(0);
    stack.execute(add(2));
    stack.execute(add(3));
    expect(stack.undo()).toBe(true);
    expect(stack.state).toBe(2);
    expect(stack.undo()).toBe(true);
    expect(stack.state).toBe(0);
    expect(stack.redo()).toBe(true);
    expect(stack.state).toBe(2);
  });

  it('returns false when there is nothing to undo or redo', () => {
    const stack = new CommandStack(0);
    expect(stack.undo()).toBe(false);
    expect(stack.redo()).toBe(false);
    expect(stack.canUndo).toBe(false);
    expect(stack.canRedo).toBe(false);
  });

  it('clears the redo history when a new command runs', () => {
    const stack = new CommandStack(0);
    stack.execute(add(1));
    stack.undo();
    expect(stack.canRedo).toBe(true);
    stack.execute(add(5));
    expect(stack.canRedo).toBe(false);
    expect(stack.state).toBe(5);
  });

  it('reports undo and redo labels', () => {
    const stack = new CommandStack(0);
    expect(stack.undoLabel).toBeUndefined();
    stack.execute(add(4));
    expect(stack.undoLabel).toBe('Add 4');
    stack.undo();
    expect(stack.redoLabel).toBe('Add 4');
  });

  it('drops the oldest steps beyond the limit', () => {
    const stack = new CommandStack(0, { limit: 2 });
    stack.execute(add(1));
    stack.execute(add(2));
    stack.execute(add(3));
    expect(stack.undo()).toBe(true);
    expect(stack.undo()).toBe(true);
    expect(stack.undo()).toBe(false);
    expect(stack.state).toBe(1);
  });

  it('rejects an invalid limit', () => {
    expect(() => new CommandStack(0, { limit: 0 })).toThrow(RangeError);
    expect(() => new CommandStack(0, { limit: 1.5 })).toThrow(RangeError);
  });

  it('notifies subscribers on every change until unsubscribed', () => {
    const stack = new CommandStack(0);
    const listener = vi.fn();
    const unsubscribe = stack.subscribe(listener);
    stack.execute(add(1));
    stack.undo();
    stack.redo();
    expect(listener.mock.calls).toEqual([[1], [0], [1]]);
    unsubscribe();
    stack.execute(add(1));
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('does not change state when a command throws', () => {
    const stack = new CommandStack(10);
    const bad: Command<number> = {
      label: 'Bad',
      apply: () => {
        throw new Error('boom');
      },
      revert: (s) => s,
    };
    expect(() => {
      stack.execute(bad);
    }).toThrow('boom');
    expect(stack.state).toBe(10);
    expect(stack.canUndo).toBe(false);
  });
});

describe('CommandStack.amend', () => {
  it('changes the state without an undo step and notifies listeners', () => {
    const stack = new CommandStack(0);
    const listener = vi.fn();
    stack.subscribe(listener);
    stack.execute(add(2));
    stack.amend((s) => s + 10);
    expect(stack.state).toBe(12);
    expect(listener).toHaveBeenLastCalledWith(12);
    stack.undo();
    expect(stack.state).toBe(10);
    expect(stack.canUndo).toBe(false);
  });
});
