import type { ReactNode } from 'react';

function Svg({ children, size = 22 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const StoreIcon = () => (
  <Svg>
    <path d="M4 10v10h16V10" />
    <path d="M3 10l2-6h14l2 6" />
    <path d="M3 10c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3" />
    <path d="M10 20v-5h4v5" />
  </Svg>
);

export const CupIcon = () => (
  <Svg>
    <path d="M4 9h13v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6V9z" />
    <path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17" />
    <path d="M8 3c0 1.5 1 1.5 1 3M12 3c0 1.5 1 1.5 1 3" />
  </Svg>
);

export const StaffIcon = () => (
  <Svg>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M16 14.2c2.8.3 5 2.6 5 5.8" />
  </Svg>
);

export const BuildIcon = () => (
  <Svg>
    <path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3.5 17.3a1.8 1.8 0 0 0 2.5 2.5l5.8-5.8a4 4 0 0 0 5.2-5.4l-2.4 2.4-2.3-.4-.4-2.3 2.8-2z" />
  </Svg>
);

export const FinanceIcon = () => (
  <Svg>
    <path d="M4 20V4" />
    <path d="M4 20h16" />
    <path d="M8 16v-4M12 16V8M16 16v-6" />
  </Svg>
);

export const PauseIcon = () => (
  <Svg size={18}>
    <path d="M9 5v14M15 5v14" />
  </Svg>
);

export const PlayIcon = ({ count = 1 }: { count?: 1 | 2 | 3 }) => (
  <Svg size={18}>
    {count === 1 && <path d="M8 5l10 7-10 7V5z" />}
    {count === 2 && (
      <>
        <path d="M4 6l8 6-8 6V6z" />
        <path d="M12 6l8 6-8 6V6z" />
      </>
    )}
    {count === 3 && (
      <>
        <path d="M2 7l6.5 5L2 17V7z" />
        <path d="M8.5 7l6.5 5-6.5 5V7z" />
        <path d="M15 7l6.5 5-6.5 5V7z" />
      </>
    )}
  </Svg>
);

export const GearIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Svg>
);

export const AlertIcon = () => (
  <Svg size={18}>
    <path d="M12 4l9 16H3L12 4z" />
    <path d="M12 10v4M12 17.5v.01" />
  </Svg>
);

export const CheckIcon = () => (
  <Svg size={18}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);

export const CircleIcon = () => (
  <Svg size={18}>
    <circle cx="12" cy="12" r="7.5" />
  </Svg>
);

export const MinusIcon = () => (
  <Svg size={16}>
    <path d="M5 12h14" />
  </Svg>
);

export const PlusIcon = () => (
  <Svg size={16}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const CloseIcon = () => (
  <Svg size={20}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const Logo = ({ size = 56 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <rect width="64" height="64" rx="14" fill="#4a2f22" />
    <path d="M17 26h26v10a11 11 0 0 1-11 11h-4a11 11 0 0 1-11-11V26z" fill="#f4ede3" />
    <path d="M43 29h3a5 5 0 0 1 0 10h-3" fill="none" stroke="#f4ede3" strokeWidth="3.5" />
    <path d="M24 13c0 3 2.5 3 2.5 6M31 11c0 3 2.5 3 2.5 6" fill="none" stroke="#e8c9a0" strokeWidth="2.6" strokeLinecap="round" />
    <text x="30" y="42" textAnchor="middle" fontFamily="-apple-system, system-ui, sans-serif" fontWeight="800" fontSize="15" fill="#4a2f22">3</text>
  </svg>
);
