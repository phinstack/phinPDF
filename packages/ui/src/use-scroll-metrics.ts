import { useEffect, useState, type RefObject } from 'react';

export interface ScrollMetrics {
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Tracks an element's scroll position and size, updated at most once per frame. */
export function useScrollMetrics(ref: RefObject<HTMLElement | null>): ScrollMetrics {
  const [metrics, setMetrics] = useState<ScrollMetrics>({ top: 0, width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const read = (): void => {
      frame = 0;
      setMetrics((prev) =>
        prev.top === el.scrollTop &&
        prev.width === el.clientWidth &&
        prev.height === el.clientHeight
          ? prev
          : { top: el.scrollTop, width: el.clientWidth, height: el.clientHeight },
      );
    };
    const schedule = (): void => {
      if (frame === 0) frame = requestAnimationFrame(read);
    };
    el.addEventListener('scroll', schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(el);
    schedule();
    return () => {
      el.removeEventListener('scroll', schedule);
      observer.disconnect();
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [ref]);

  return metrics;
}
