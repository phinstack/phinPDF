import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  annotationRect,
  diffAnnotations,
  EMPTY_ANNOTATIONS,
  nextBaseline,
  removeAnnotation,
  rgbToCss,
  sameAnnotation,
  toPdfDate,
  updateAnnotation,
  type Annotation,
  type AnnotationState,
  type Baseline,
  type FileKey,
  type MarkupAnnotation,
  type NoteAnnotation,
} from './annotations.ts';
import { CommandStack } from './command-stack.ts';

const highlight: MarkupAnnotation = {
  id: 'h1',
  kind: 'highlight',
  pageIndex: 0,
  color: { r: 255, g: 235, b: 59 },
  contents: '',
  author: '',
  modified: null,
  rects: [
    { x0: 72, y0: 700, x1: 300, y1: 712 },
    { x0: 72, y0: 686, x1: 200, y1: 698 },
  ],
};

const note: NoteAnnotation = {
  id: 'n1',
  kind: 'note',
  pageIndex: 1,
  color: { r: 255, g: 235, b: 59 },
  contents: 'Check this',
  author: 'Sam',
  modified: '2026-10-09T12:00:00.000Z',
  rect: { x0: 10, y0: 10, x1: 30, y1: 30 },
};

const keyOf = (a: Annotation, name: string | null = null): FileKey => ({
  subtype: a.kind === 'note' ? 'Text' : 'Highlight',
  rect: annotationRect(a),
  name,
});

describe('annotation commands', () => {
  it('adds, undoes, and redoes', () => {
    const stack = new CommandStack(EMPTY_ANNOTATIONS);
    stack.execute(addAnnotation(highlight));
    expect(stack.state.items).toEqual([highlight]);
    expect(stack.undoLabel).toBe('Add Highlight');
    stack.undo();
    expect(stack.state.items).toEqual([]);
    stack.redo();
    expect(stack.state.items).toEqual([highlight]);
  });

  it('restores a deleted annotation at its old position', () => {
    const stack = new CommandStack<AnnotationState>({ items: [highlight, note] });
    stack.execute(removeAnnotation(highlight));
    expect(stack.state.items).toEqual([note]);
    expect(stack.undoLabel).toBe('Delete Highlight');
    stack.undo();
    expect(stack.state.items).toEqual([highlight, note]);
  });

  it('does not duplicate an annotation that is already back', () => {
    const cmd = removeAnnotation(note);
    const state = cmd.apply({ items: [note] });
    expect(cmd.revert(cmd.revert(state)).items).toEqual([note]);
  });

  it('updates and reverts by id', () => {
    const moved = { ...note, rect: { x0: 100, y0: 100, x1: 120, y1: 120 } };
    const stack = new CommandStack<AnnotationState>({ items: [highlight, note] });
    stack.execute(updateAnnotation(note, moved, 'Move Note'));
    expect(stack.state.items[1]).toBe(moved);
    expect(stack.undoLabel).toBe('Move Note');
    stack.undo();
    expect(stack.state.items[1]).toBe(note);
    expect(updateAnnotation(note, moved).label).toBe('Edit Note');
  });

  it('refuses to update across ids', () => {
    expect(() => updateAnnotation(note, highlight)).toThrow(/ids differ/);
  });

  it('commutes with annotations loaded later', () => {
    const stack = new CommandStack(EMPTY_ANNOTATIONS);
    stack.execute(addAnnotation(highlight));
    stack.amend((s) => ({ items: [...s.items, note] }));
    stack.undo();
    expect(stack.state.items).toEqual([note]);
  });
});

describe('helpers', () => {
  it('computes the bounding rect', () => {
    expect(annotationRect(highlight)).toEqual({ x0: 72, y0: 686, x1: 300, y1: 712 });
    expect(annotationRect(note)).toBe(note.rect);
    expect(annotationRect({ ...highlight, rects: [] })).toEqual({ x0: 0, y0: 0, x1: 0, y1: 0 });
  });

  it('formats colours and dates', () => {
    expect(rgbToCss({ r: 1, g: 2, b: 3 })).toBe('rgb(1 2 3)');
    expect(toPdfDate('2026-10-09T08:05:03.000Z')).toBe('D:20261009080503Z');
    expect(toPdfDate('not a date')).toBe('');
  });

  it('compares every saved field', () => {
    expect(sameAnnotation(highlight, { ...highlight })).toBe(true);
    expect(sameAnnotation(highlight, { ...highlight, contents: 'x' })).toBe(false);
    expect(sameAnnotation(highlight, { ...highlight, color: { r: 0, g: 0, b: 0 } })).toBe(false);
    expect(sameAnnotation(highlight, { ...highlight, rects: highlight.rects.slice(1) })).toBe(
      false,
    );
    expect(sameAnnotation(note, { ...note, rect: { ...note.rect, x0: 11 } })).toBe(false);
    expect(sameAnnotation(note, { ...note, id: 'other' })).toBe(false);
    expect(sameAnnotation(highlight, { ...note, id: 'h1' })).toBe(false);
  });
});

describe('diffAnnotations', () => {
  const baseline: Baseline = new Map([
    [highlight.id, { annotation: highlight, key: keyOf(highlight) }],
    [note.id, { annotation: note, key: keyOf(note, 'nm-1') }],
  ]);

  it('reports nothing when unchanged', () => {
    expect(diffAnnotations(baseline, [highlight, note])).toEqual([]);
  });

  it('reports creates, updates with the saved key, and deletes', () => {
    const created: NoteAnnotation = { ...note, id: 'n2' };
    const edited = { ...note, contents: 'Edited' };
    expect(diffAnnotations(baseline, [edited, created])).toEqual([
      { op: 'update', key: keyOf(note, 'nm-1'), annotation: edited },
      { op: 'create', annotation: created },
      { op: 'delete', key: keyOf(highlight), pageIndex: 0 },
    ]);
  });

  it('builds the next baseline from written keys', () => {
    const created: NoteAnnotation = { ...note, id: 'n2' };
    const written = new Map([['n2', keyOf(created, 'n2')]]);
    const next = nextBaseline(baseline, [highlight, created], written);
    expect([...next.keys()]).toEqual(['h1', 'n2']);
    expect(next.get('n2')?.key.name).toBe('n2');
    expect(next.get('h1')?.key).toEqual(keyOf(highlight));
    expect(diffAnnotations(next, [highlight, created])).toEqual([]);
  });

  it('drops annotations the saver did not report and the baseline lacks', () => {
    expect(nextBaseline(new Map(), [highlight], new Map()).size).toBe(0);
  });
});
