import { useState } from 'react';
import { formatMoney } from '../../sim/money';
import type { WeekReport } from '../../sim/state';

export const REVENUE_COLOR = '#c08628';
export const NET_COLOR = '#3b9bd4';

const W = 340;
const H = 170;
const PAD = { top: 10, right: 6, bottom: 24, left: 6 };
const R = 4;

// A bar with rounded corners only at its data end; the baseline end stays square.
function barPath(x: number, w: number, y0: number, y1: number): string {
  const r = Math.min(R, w / 2, Math.abs(y1 - y0));
  if (y1 < y0) return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
  return `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
}

export function ProfitChart({ reports }: { reports: readonly WeekReport[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const data = reports.slice(-6);
  if (data.length === 0) return <p className="muted small">The first weekly results arrive Sunday at midnight.</p>;

  const values = data.flatMap((r) => [r.income.revenue, r.income.netIncome]);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const plotH = H - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + ((max - v) / span) * plotH;
  const band = (W - PAD.left - PAD.right) / data.length;
  const barW = Math.min(22, band * 0.3);
  const zero = y(0);
  const hovered = hover !== null ? data[hover] : undefined;

  return (
    <figure className="chart" aria-label="Revenue and net income by week">
      <div className="chart-plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Revenue and net income for the last ${data.length} weeks`} onPointerLeave={() => setHover(null)}>
          <line x1={PAD.left} x2={W - PAD.right} y1={zero} y2={zero} stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
          {data.map((r, i) => {
            const cx = PAD.left + band * i + band / 2;
            const dim = hover !== null && hover !== i ? 0.45 : 1;
            return (
              <g key={r.week} opacity={dim}>
                <path d={barPath(cx - barW - 1, barW, zero, y(r.income.revenue))} fill={REVENUE_COLOR} />
                <path d={barPath(cx + 1, barW, zero, y(r.income.netIncome))} fill={NET_COLOR} />
                <rect x={cx - band / 2} y={PAD.top} width={band} height={plotH} fill="transparent" onPointerEnter={() => setHover(i)} onClick={() => setHover(i)}>
                  <title>{`Week ${r.week}: revenue ${formatMoney(r.income.revenue)}, net income ${formatMoney(r.income.netIncome)}`}</title>
                </rect>
                <text x={cx} y={H - 6} textAnchor="middle" className="chart-axis">
                  Week {r.week}
                </text>
              </g>
            );
          })}
        </svg>
        {hovered && (
          <div className="chart-tip" style={{ left: `${((PAD.left + band * hover! + band / 2) / W) * 100}%` }}>
            <strong>Week {hovered.week}</strong>
            <span>Revenue {formatMoney(hovered.income.revenue)}</span>
            <span>Net income {formatMoney(hovered.income.netIncome)}</span>
          </div>
        )}
      </div>
    </figure>
  );
}
