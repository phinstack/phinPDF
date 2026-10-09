import { useEffect, useId, useRef, useState } from 'react';
import { ANNOTATION_COLORS, rgbToCss, sameRgb, type Rgb } from '@phinpdf/core';

export interface ColorPickerProps {
  readonly value: Rgb;
  readonly onChange: (color: Rgb) => void;
  readonly label: string;
}

/** A row of colour swatches as a radio group (arrow keys move, like native radios). */
export function ColorSwatches({ value, onChange, label }: ColorPickerProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = Math.max(
    0,
    ANNOTATION_COLORS.findIndex((c) => sameRgb(c.rgb, value)),
  );
  return (
    <div className="swatches" role="radiogroup" aria-label={label}>
      {ANNOTATION_COLORS.map((c, i) => {
        const checked = sameRgb(c.rgb, value);
        return (
          <button
            key={c.name}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={c.name}
            title={c.name}
            tabIndex={i === selected ? 0 : -1}
            className="swatch"
            style={{ background: rgbToCss(c.rgb) }}
            onClick={() => {
              onChange(c.rgb);
            }}
            onKeyDown={(e) => {
              const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
              if (!step) return;
              e.preventDefault();
              const next = (i + step + ANNOTATION_COLORS.length) % ANNOTATION_COLORS.length;
              const color = ANNOTATION_COLORS[next];
              if (color) onChange(color.rgb);
              refs.current[next]?.focus();
            }}
          />
        );
      })}
    </div>
  );
}

/** A toolbar button showing the current colour that opens the swatches. */
export function ColorPicker({ value, onChange, label }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event): void => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
      if (event instanceof PointerEvent && root.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);
  const name = ANNOTATION_COLORS.find((c) => sameRgb(c.rgb, value))?.name ?? 'Custom';
  return (
    <div className="color-picker" ref={root}>
      <button
        type="button"
        className="icon"
        aria-label={`${label}: ${name}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        <span className="swatch current" style={{ background: rgbToCss(value) }} />
      </button>
      {open && (
        <div id={id} className="popover color-popover">
          <ColorSwatches
            value={value}
            label={label}
            onChange={(c) => {
              onChange(c);
            }}
          />
        </div>
      )}
    </div>
  );
}
