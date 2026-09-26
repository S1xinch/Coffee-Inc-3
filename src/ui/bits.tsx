import type { ReactNode } from 'react';
import { clockInfo, formatTime } from '../sim/clock';
import { formatMoney } from '../sim/money';

export function Money({ cents, withCents = false, signed = false }: { cents: number; withCents?: boolean; signed?: boolean }) {
  const tone = signed ? (cents > 0 ? 'pos' : cents < 0 ? 'neg' : '') : '';
  const text = formatMoney(cents, withCents);
  return <span className={`num ${tone}`}>{signed && cents > 0 ? `+${text}` : text}</span>;
}

export function Meter({ value, max = 100, label, tone }: { value: number; max?: number; label: string; tone?: 'good' | 'warn' | 'bad' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const auto = tone ?? (pct >= 60 ? 'good' : pct >= 35 ? 'warn' : 'bad');
  return (
    <div className="meter" role="meter" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max}>
      <div className={`meter-fill ${auto}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Card({ title, aside, children, className = '' }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || aside) && (
        <header className="card-head">
          {title && <h3>{title}</h3>}
          {aside && <div className="card-aside">{aside}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{children}</div>
    </div>
  );
}

export function when(hour: number): string {
  const c = clockInfo(hour);
  return `Wk ${c.week} ${c.dayName} ${formatTime(c.hourOfDay)}`;
}

export function plural(n: number, word: string): string {
  return `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;
}
