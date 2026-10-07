/**
 * Every document edit is a Command. Commands are pure: they take a state and return a
 * new state, and know how to undo themselves. This keeps undo/redo correct by
 * construction and makes each edit unit-testable without a UI.
 */
export interface Command<S> {
  /** Shown in the UI, for example "Undo Highlight". */
  readonly label: string;
  apply(state: S): S;
  revert(state: S): S;
}

export interface CommandStackOptions {
  /** Maximum number of undo steps kept. Oldest steps are dropped first. */
  readonly limit?: number;
}

type Listener<S> = (state: S) => void;

export class CommandStack<S> {
  #state: S;
  #done: Command<S>[] = [];
  #undone: Command<S>[] = [];
  readonly #limit: number;
  readonly #listeners = new Set<Listener<S>>();

  constructor(initial: S, { limit = 200 }: CommandStackOptions = {}) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError(`limit must be a positive integer, got ${String(limit)}`);
    }
    this.#state = initial;
    this.#limit = limit;
  }

  get state(): S {
    return this.#state;
  }

  get canUndo(): boolean {
    return this.#done.length > 0;
  }

  get canRedo(): boolean {
    return this.#undone.length > 0;
  }

  /** Label of the command that `undo()` would revert, if any. */
  get undoLabel(): string | undefined {
    return this.#done.at(-1)?.label;
  }

  /** Label of the command that `redo()` would re-apply, if any. */
  get redoLabel(): string | undefined {
    return this.#undone.at(-1)?.label;
  }

  execute(command: Command<S>): void {
    this.#set(command.apply(this.#state));
    this.#done.push(command);
    if (this.#done.length > this.#limit) this.#done.shift();
    this.#undone = [];
    this.#emit();
  }

  undo(): boolean {
    const command = this.#done.pop();
    if (!command) return false;
    this.#set(command.revert(this.#state));
    this.#undone.push(command);
    this.#emit();
    return true;
  }

  redo(): boolean {
    const command = this.#undone.pop();
    if (!command) return false;
    this.#set(command.apply(this.#state));
    this.#done.push(command);
    this.#emit();
    return true;
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: Listener<S>): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #set(next: S): void {
    this.#state = next;
  }

  #emit(): void {
    for (const listener of this.#listeners) listener(this.#state);
  }
}
