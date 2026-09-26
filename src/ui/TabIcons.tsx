// Small full-color illustrations for the store tab bar, in the spirit of Coffee Inc 2's illustrated tabs.

export const ServiceArt = () => (
  <svg width={34} height={30} viewBox="0 0 34 30" aria-hidden="true">
    {[
      [7, '#e9c2a0', '#3a3f4a', '#6b4a30'],
      [27, '#c98f68', '#3a3f4a', '#2b1d16'],
      [17, '#f3d2b8', '#5ac8fa', '#b8843f'],
    ].map(([x, skin, body, hair]) => (
      <g key={x as number}>
        <rect x={(x as number) - 4} y={13} width={8} height={11} rx={2.5} fill={body as string} />
        <rect x={(x as number) - 3} y={23} width={2.6} height={6} fill="#262a33" />
        <rect x={(x as number) + 0.4} y={23} width={2.6} height={6} fill="#262a33" />
        <circle cx={x as number} cy={9} r={3.6} fill={skin as string} />
        <path d={`M${(x as number) - 3.8} 8.5a3.8 3.8 0 0 1 7.6 0z`} fill={hair as string} />
      </g>
    ))}
  </svg>
);

export const ProductArt = () => (
  <svg width={34} height={30} viewBox="0 0 34 30" aria-hidden="true">
    <path d="M5 8h11l-1.3 19H6.3z" fill="#b8743f" />
    <path d="M4.5 5.5h12v3h-12z" fill="#f4f0e8" />
    <path d="M6 11h9v3H6z" fill="#fbf7f0" opacity={0.85} />
    <path d="M19 11h10l-1.2 16h-7.6z" fill="#f4f0e8" />
    <path d="M18.5 9h11v2.5h-11z" fill="#3a3f4a" />
    <path d="M19.6 16h9l-.5 5h-8z" fill="#3f8a4f" />
  </svg>
);

export const MarketingArt = () => (
  <svg width={34} height={30} viewBox="0 0 34 30" aria-hidden="true">
    <rect x={15.5} y={16} width={3} height={14} fill="#8b8f94" />
    <path d="M4 4l26-2v14L4 18z" fill="#f2c14e" />
    <path d="M4 4l26-2v2.5L4 6.5z" fill="#d49a2a" />
    <text x={17} y={14} textAnchor="middle" fontSize={7} fontWeight={800} fill="#3a2a10" fontFamily="-apple-system, system-ui, sans-serif">
      AD
    </text>
    <circle cx={8} cy={3} r={1.2} fill="#fff4c2" />
    <circle cx={26} cy={1.8} r={1.2} fill="#fff4c2" />
  </svg>
);

export const FinanceArt = () => (
  <svg width={34} height={30} viewBox="0 0 34 30" aria-hidden="true">
    <path d="M4 14l12-6 14 6-12 7z" fill="#e7eaec" />
    <path d="M4 14l14 7v7L4 21z" fill="#b9c0c6" />
    <path d="M18 21l12-7v7l-12 7z" fill="#8f989f" />
    <path d="M9 9l9-4 8 3.5-9 4.5z" fill="#6fbf73" />
    <path d="M10 7l9-4 8 3.5-9 4.5z" fill="#8bd48c" />
    <rect x={12} y={15} width={6} height={2} fill="#2f3a44" transform="skewY(26)" />
  </svg>
);

export const StaffGlyph = () => (
  <svg width={30} height={30} viewBox="0 0 30 30" fill="#fff" aria-hidden="true">
    <circle cx="8.5" cy="11" r="3.4" />
    <circle cx="21.5" cy="11" r="3.4" />
    <path d="M2.5 23c0-4 2.7-6.5 6-6.5s6 2.5 6 6.5zM15.5 23c0-4 2.7-6.5 6-6.5s6 2.5 6 6.5z" />
    <circle cx="15" cy="9.5" r="4" stroke="#a84a1a" strokeWidth="1.5" />
    <path d="M7.5 25c0-4.8 3.3-7.8 7.5-7.8s7.5 3 7.5 7.8z" stroke="#a84a1a" strokeWidth="1.5" />
  </svg>
);

export const BoxGlyph = () => (
  <svg width={30} height={30} viewBox="0 0 30 30" aria-hidden="true">
    <path d="M15 4l11 6-11 6-11-6z" fill="#fff" />
    <path d="M4 10l11 6v11L4 21z" fill="#f0d6c4" />
    <path d="M26 10l-11 6v11l11-6z" fill="#ffe9da" opacity={0.85} />
  </svg>
);
