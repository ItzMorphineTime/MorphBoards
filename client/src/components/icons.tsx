interface IconProps {
  size?: number;
}

function base(children: React.ReactNode, size: number, filled = false) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export const Icons = {
  cursor: ({ size = 18 }: IconProps) =>
    base(<path d="M5 3l14 7.5-6.2 1.9L10 19 5 3z" />, size),
  hand: ({ size = 18 }: IconProps) =>
    base(
      <path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11m0-5.5v-1a1.5 1.5 0 0 1 3 0V11m0-4.5a1.5 1.5 0 0 1 3 0V13m-9-1v6.5c0 1.5 2 3.5 4.5 3.5s4.5-2 4.5-4V13m-12-2.5a1.5 1.5 0 0 1 3 0" />,
      size,
    ),
  sticky: ({ size = 18 }: IconProps) =>
    base(<path d="M4 4h16v9l-7 7H4V4zM13 20v-7h7" />, size),
  text: ({ size = 18 }: IconProps) => base(<path d="M5 6V4h14v2M12 4v16m-3 0h6" />, size),
  shapes: ({ size = 18 }: IconProps) =>
    base(
      <>
        <rect x="3" y="3" width="10" height="10" rx="1" />
        <circle cx="15.5" cy="15.5" r="5.5" />
      </>,
      size,
    ),
  rect: ({ size = 18 }: IconProps) => base(<rect x="3" y="5" width="18" height="14" />, size),
  roundRect: ({ size = 18 }: IconProps) =>
    base(<rect x="3" y="5" width="18" height="14" rx="4" />, size),
  ellipse: ({ size = 18 }: IconProps) => base(<ellipse cx="12" cy="12" rx="9" ry="7" />, size),
  diamond: ({ size = 18 }: IconProps) => base(<path d="M12 3l9 9-9 9-9-9 9-9z" />, size),
  triangle: ({ size = 18 }: IconProps) => base(<path d="M12 4l9 16H3l9-16z" />, size),
  line: ({ size = 18 }: IconProps) => base(<path d="M5 19L19 5" />, size),
  connector: ({ size = 18 }: IconProps) =>
    base(
      <>
        <circle cx="5.5" cy="5.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
        <path d="M7.5 7.5c3 3 6 1 9 4s0 5 0 5" transform="translate(0,-1)" />
      </>,
      size,
    ),
  frame: ({ size = 18 }: IconProps) => base(<path d="M7 3v18M17 3v18M3 7h18M3 17h18" />, size),
  comment: ({ size = 18 }: IconProps) =>
    base(<path d="M21 12a8 8 0 0 1-8 8H4l2.5-2.9A8 8 0 1 1 21 12z" />, size),
  image: ({ size = 18 }: IconProps) =>
    base(
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="M21 16l-5-5-9 9" />
      </>,
      size,
    ),
  undo: ({ size = 18 }: IconProps) => base(<path d="M8 5L3 10l5 5M3.5 10H15a6 6 0 0 1 0 12h-3" />, size),
  redo: ({ size = 18 }: IconProps) =>
    base(<path d="M16 5l5 5-5 5M20.5 10H9a6 6 0 0 0 0 12h3" />, size),
  plus: ({ size = 18 }: IconProps) => base(<path d="M12 5v14M5 12h14" />, size),
  minus: ({ size = 18 }: IconProps) => base(<path d="M5 12h14" />, size),
  fit: ({ size = 18 }: IconProps) =>
    base(<path d="M9 4H4v5m11-5h5v5M9 20H4v-5m11 5h5v-5" />, size),
  download: ({ size = 18 }: IconProps) =>
    base(<path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M4 19h16" />, size),
  upload: ({ size = 18 }: IconProps) =>
    base(<path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M4 19h16" />, size),
  trash: ({ size = 18 }: IconProps) =>
    base(<path d="M4 7h16M10 7V5h4v2m-7 0 1 13h8l1-13M10 11v5m4-5v5" />, size),
  lock: ({ size = 18 }: IconProps) =>
    base(
      <>
        <rect x="5" y="11" width="14" height="9" rx="1.5" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </>,
      size,
    ),
  help: ({ size = 18 }: IconProps) =>
    base(<path d="M9 9a3 3 0 1 1 4.2 2.8c-.9.5-1.2 1-1.2 2.2m0 3.5v.1" />, size),
  back: ({ size = 18 }: IconProps) => base(<path d="M14 5l-7 7 7 7" />, size),
  duplicate: ({ size = 18 }: IconProps) =>
    base(
      <>
        <rect x="8" y="8" width="12" height="12" rx="1.5" />
        <path d="M16 4H5.5A1.5 1.5 0 0 0 4 5.5V16" />
      </>,
      size,
    ),
  check: ({ size = 18 }: IconProps) => base(<path d="M4 12.5 9.5 18 20 6.5" />, size),
};
