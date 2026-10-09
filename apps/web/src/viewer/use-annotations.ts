import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  addAnnotation,
  CommandStack,
  diffAnnotations,
  EMPTY_ANNOTATIONS,
  nextBaseline,
  removeAnnotation,
  updateAnnotation,
  type Annotation,
  type AnnotationChange,
  type AnnotationState,
  type Baseline,
  type BaselineEntry,
  type FileKey,
} from '@phinpdf/core';
import type { RenderDocument } from '@phinpdf/renderer';

type AnnotationSource = Pick<RenderDocument, 'numPages' | 'getAnnotations'>;

/** Pages whose annotations are read at a time while loading. */
const LOAD_BATCH = 16;

export interface AnnotationsApi {
  readonly items: readonly Annotation[];
  readonly byPage: ReadonlyMap<number, readonly Annotation[]>;
  /** True once every page's annotations have been read. */
  readonly loaded: boolean;
  /** True when there are changes that are not saved yet. */
  readonly dirty: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel: string | undefined;
  readonly redoLabel: string | undefined;
  readonly add: (annotation: Annotation) => void;
  readonly remove: (annotation: Annotation) => void;
  readonly update: (before: Annotation, after: Annotation, label?: string) => void;
  readonly undo: () => void;
  readonly redo: () => void;
  /** The changes to write on the next save. */
  readonly pendingChanges: () => AnnotationChange[];
  /** Records a successful save of `saved` (the items that were written). */
  readonly markSaved: (
    saved: readonly Annotation[],
    writtenKeys: ReadonlyMap<string, FileKey>,
  ) => void;
}

/**
 * The document's editable annotations with undo/redo. Annotations from the file are read
 * page by page in the background and merged in without undo steps.
 */
export function useAnnotations(doc: AnnotationSource): AnnotationsApi {
  // A new stack (and so a new undo history) per document.
  const stack = useMemo(() => new CommandStack<AnnotationState>(EMPTY_ANNOTATIONS), [doc]);
  const state = useSyncExternalStore(
    useCallback((listener: () => void) => stack.subscribe(listener), [stack]),
    () => stack.state,
  );
  const [baseline, setBaseline] = useState<Baseline>(() => new Map());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setBaseline(new Map());
    setLoaded(false);
    let stopped = false;
    // A function, so the check isn't narrowed away across awaits.
    const cancelled = (): boolean => stopped;
    void (async () => {
      for (let start = 1; start <= doc.numPages && !cancelled(); start += LOAD_BATCH) {
        const end = Math.min(doc.numPages, start + LOAD_BATCH - 1);
        const pages = await Promise.all(
          Array.from({ length: end - start + 1 }, (_, i) => doc.getAnnotations(start + i)),
        );
        if (cancelled()) return;
        const entries = pages.flat();
        if (entries.length === 0) continue;
        setBaseline((previous) => {
          const next = new Map<string, BaselineEntry>(previous);
          for (const { annotation, key } of entries) next.set(annotation.id, { annotation, key });
          return next;
        });
        stack.amend((s) => ({ items: [...s.items, ...entries.map((e) => e.annotation)] }));
      }
      if (!cancelled()) setLoaded(true);
    })();
    return () => {
      stopped = true;
    };
  }, [doc, stack]);

  const byPage = useMemo(() => {
    const map = new Map<number, Annotation[]>();
    for (const a of state.items) {
      const list = map.get(a.pageIndex);
      if (list) list.push(a);
      else map.set(a.pageIndex, [a]);
    }
    return map;
  }, [state]);

  const dirty = useMemo(() => diffAnnotations(baseline, state.items).length > 0, [baseline, state]);

  const add = useCallback(
    (a: Annotation) => {
      stack.execute(addAnnotation(a));
    },
    [stack],
  );
  const remove = useCallback(
    (a: Annotation) => {
      stack.execute(removeAnnotation(a));
    },
    [stack],
  );
  const update = useCallback(
    (before: Annotation, after: Annotation, label?: string) => {
      stack.execute(updateAnnotation(before, after, label));
    },
    [stack],
  );
  const undo = useCallback(() => {
    stack.undo();
  }, [stack]);
  const redo = useCallback(() => {
    stack.redo();
  }, [stack]);
  const pendingChanges = useCallback(
    () => diffAnnotations(baseline, stack.state.items),
    [baseline, stack],
  );
  const markSaved = useCallback(
    (saved: readonly Annotation[], writtenKeys: ReadonlyMap<string, FileKey>) => {
      setBaseline((previous) => nextBaseline(previous, saved, writtenKeys));
    },
    [],
  );

  return {
    items: state.items,
    byPage,
    loaded,
    dirty,
    canUndo: stack.canUndo,
    canRedo: stack.canRedo,
    undoLabel: stack.undoLabel,
    redoLabel: stack.redoLabel,
    add,
    remove,
    update,
    undo,
    redo,
    pendingChanges,
    markSaved,
  };
}
