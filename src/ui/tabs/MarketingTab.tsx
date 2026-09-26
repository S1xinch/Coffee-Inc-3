import type { ReactNode } from 'react';
import { CAMPAIGNS, marketingTraffic, weeklyMarketingCost, type CampaignLevel } from '../../sim/marketing';
import { formatMoney } from '../../sim/money';
import { Card, Meter } from '../bits';
import { useGameUi } from '../context';

const ICONS: Record<string, ReactNode> = {
  cups: (
    <>
      <path d="M6 7h12l-1.5 13h-9z" />
      <path d="M5 4h14v3H5z" />
      <path d="M10 13l2-2 2 2M12 11v5" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="1.5" />
      <path d="M3.5 7l8.5 6 8.5-6" />
    </>
  ),
  catering: (
    <>
      <path d="M4 16h16M3 19h18" />
      <path d="M5.5 16a6.5 6.5 0 0 1 13 0" />
      <path d="M12 7.5V6" />
    </>
  ),
  sponsors: (
    <>
      <circle cx="12" cy="9" r="5" />
      <path d="M9 13.5L7.5 21l4.5-2.5 4.5 2.5-1.5-7.5" />
    </>
  ),
  social: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2" />
      <path d="M10.5 18.5h3" />
      <path d="M10 9.5l1.5 1.5 3-3" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5.5 5.5" />
    </>
  ),
};

function effect(l: CampaignLevel): string {
  const parts: string[] = [];
  if (l.traffic) parts.push(`+${Math.round(l.traffic * 100)}% foot traffic`);
  if (l.buzz) parts.push(`+${l.buzz.toFixed(2)} reputation a day`);
  if (l.atmosphere) parts.push('Better atmosphere rating');
  return parts.join(' · ');
}

function cost(l: CampaignLevel): string {
  if (l.perCup) return `${formatMoney(l.perCup, true)} per cup`;
  if (l.weeklyCost) return `${formatMoney(l.weeklyCost)} / week`;
  return '';
}

export function MarketingTab() {
  const { state, act } = useGameUi();
  const boost = Math.round((marketingTraffic(state) - 1) * 100);

  return (
    <div className="stack">
      <Card>
        <div className="meter-row">
          <span>Reputation</span>
          <Meter value={state.store.reputation} label="Reputation" />
          <span className="num">{Math.round(state.store.reputation)}</span>
        </div>
        <p className="muted small">
          Spending {formatMoney(weeklyMarketingCost(state))} a week{boost > 0 ? `, bringing in ${boost}% more foot traffic` : ''}. Reputation decides how many people
          walking by know your name. Tap a card to switch it on or off.
        </p>
      </Card>
      <div className="campaign-grid">
        {CAMPAIGNS.map((c) => {
          const current = state.store.marketing[c.id] ?? 0;
          const level = c.levels[current]!;
          const next = (current + 1) % c.levels.length;
          const preview = c.levels[current === 0 ? 1 : current]!;
          return (
            <button
              key={c.id}
              className={`campaign ${current > 0 ? 'on' : ''}`}
              aria-pressed={current > 0}
              onClick={() => act({ type: 'setCampaign', campaignId: c.id, level: next })}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {ICONS[c.id]}
              </svg>
              <span className="campaign-name">{c.name}</span>
              <span className="campaign-state">
                <strong>{level.label}</strong>
                {cost(preview) && <span> · {cost(preview)}</span>}
              </span>
              <span className="campaign-effect">{effect(preview)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
