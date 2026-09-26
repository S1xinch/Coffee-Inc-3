import { BRAND_COLORS } from '../sim/catalog';
import { BRAND_ICONS, type BrandIcon, type GameState } from '../sim/state';
import { BRAND_ART } from '../render/brandIcons';
import { HAIR, SKIN } from '../render/palette';

export function BrandMark({ brand, size = 32 }: { brand: GameState['brand']; size?: number }) {
  const art = BRAND_ART[brand.icon];
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="brand-mark">
      <circle cx="16" cy="16" r="16" fill={brand.color} />
      <g transform="translate(5 5) scale(0.9167)">
        {art.fill.map((d) => (
          <path key={d} d={d} fill="#fff" />
        ))}
        {art.line?.map((d) => <path key={d} d={d} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" />)}
        {art.cut?.map((d) => <path key={d} d={d} fill="none" stroke={brand.color} strokeWidth={1.6} strokeLinecap="round" />)}
      </g>
    </svg>
  );
}

export function BrandPicker({ value, onChange }: { value: GameState['brand']; onChange: (b: GameState['brand']) => void }) {
  return (
    <div className="brand-picker">
      <div className="brand-row" role="radiogroup" aria-label="Logo">
        {BRAND_ICONS.map((icon: BrandIcon) => (
          <button
            key={icon}
            type="button"
            role="radio"
            aria-checked={value.icon === icon}
            aria-label={icon}
            className={`brand-option ${value.icon === icon ? 'on' : ''}`}
            onClick={() => onChange({ ...value, icon })}
          >
            <BrandMark brand={{ ...value, icon }} size={40} />
          </button>
        ))}
      </div>
      <div className="brand-row" role="radiogroup" aria-label="Color">
        {BRAND_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={value.color === color}
            aria-label={`Color ${color}`}
            className={`swatch ${value.color === color ? 'on' : ''}`}
            style={{ background: color }}
            onClick={() => onChange({ ...value, color })}
          />
        ))}
      </div>
    </div>
  );
}

// Faceless bust in the style of Coffee Inc 2's staff portraits; the apron takes the brand color.
export function Portrait({ look, size = 72, apron = '#5ac8fa' }: { look: number; size?: number; apron?: string }) {
  const skin = SKIN[look % SKIN.length];
  const hair = HAIR[Math.floor(look / 5) % HAIR.length];
  const style = Math.floor(look / 13) % 3;
  const w = (size * 56) / 72;
  return (
    <svg width={w} height={size} viewBox="0 0 56 72" aria-hidden="true" className="portrait">
      {style === 1 && <path d="M15 20c0-9 5.5-14 13-14s13 5 13 14v22H15z" fill={hair} />}
      <path d="M4 72c0-14 9-22 24-22s24 8 24 22z" fill="#2a2a2e" />
      <path d="M22 44h12v9l-6 4-6-4z" fill={skin} />
      <path d="M13 72V60c0-4 3-7 7-8l8 6 8-6c4 1 7 4 7 8v12z" fill={apron} />
      <path d="M19 51l-3 21M37 51l3 21" stroke="#1d1d20" strokeWidth={1.2} opacity={0.35} />
      <ellipse cx="28" cy="30" rx="10.5" ry="13" fill={skin} />
      <path d="M17 28c0-9 5-14 11-14s11 5 11 14c-2-5-6-8-11-8s-9 3-11 8z" fill={hair} />
      {style === 2 && <circle cx="28" cy="12" r="5" fill={hair} />}
      {style === 0 && <path d="M17.5 27c1-7 5-11 10.5-11" stroke={hair} strokeWidth={3} fill="none" strokeLinecap="round" />}
    </svg>
  );
}

export function BrandGlyph({ brand, size = 40 }: { brand: GameState['brand']; size?: number }) {
  const art = BRAND_ART[brand.icon];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {art.fill.map((d) => (
        <path key={d} d={d} fill={brand.color} />
      ))}
      {art.line?.map((d) => <path key={d} d={d} fill="none" stroke={brand.color} strokeWidth={2} strokeLinecap="round" />)}
      {art.cut?.map((d) => <path key={d} d={d} fill="none" stroke="#1d1916" strokeWidth={1.6} strokeLinecap="round" />)}
    </svg>
  );
}

export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  const id = `st${Math.round(value * 100)}-${size}`;
  const pct = Math.max(0, Math.min(1, value / 5)) * 100;
  const star = 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z';
  return (
    <svg width={size * 5} height={size} viewBox="0 0 120 24" aria-label={`${value.toFixed(1)} out of 5 stars`} role="img">
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="120" y2="0">
          <stop offset={`${pct}%`} stopColor="#f5a623" />
          <stop offset={`${pct}%`} stopColor="#5d5550" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} d={star} transform={`translate(${i * 24} 0)`} fill={`url(#${id})`} />
      ))}
    </svg>
  );
}
