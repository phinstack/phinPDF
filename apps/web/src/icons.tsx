/** Stroke icons used in the toolbar. Decorative: buttons carry their own labels. */
const paths = {
  open: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  print: 'M6 9V3h12v6M6 14h12v7H6zM3 9h18v8H3z',
  prev: 'M15 18l-6-6 6-6',
  next: 'M9 18l6-6-6-6',
  minus: 'M5 12h14',
  plus: 'M12 5v14M5 12h14',
  rotate: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5',
  sidebar: 'M4 4h16v16H4zM9 4v16',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  file: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M9 15h6M9 11h2',
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
