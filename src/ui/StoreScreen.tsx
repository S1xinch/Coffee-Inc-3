import type { ReactNode } from 'react';
import { OPEN_HOUR, neighborhood } from '../sim/catalog';
import { SPEEDS, calendarDate, clockInfo, formatTime, type Speed } from '../sim/clock';
import { cashBalance } from '../sim/ledger';
import { formatMoney } from '../sim/money';
import type { GameState } from '../sim/state';
import { isOpenHour, readiness } from '../sim/store';
import { BrandGlyph, Portrait } from './Brand';
import { CloseIcon, PauseIcon, PlayIcon } from './Icons';
import { Reviews } from './ReviewCard';
import { StoreView } from './StoreView';
import { BoxGlyph, FinanceArt, MarketingArt, ProductArt, ServiceArt, StaffGlyph } from './TabIcons';
import { useGameUi, type TabId } from './context';
import { dialogueLine } from './dialogue';
import { FinanceTab } from './tabs/FinanceTab';
import { MarketingTab } from './tabs/MarketingTab';
import { ProductTab } from './tabs/ProductTab';
import { ServiceTab } from './tabs/ServiceTab';

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: 'service', label: 'Service', icon: <ServiceArt /> },
  { id: 'product', label: 'Product', icon: <ProductArt /> },
  { id: 'marketing', label: 'Marketing', icon: <MarketingArt /> },
  { id: 'finance', label: 'Finance', icon: <FinanceArt /> },
];

export function SpeedControls({ speed, onChange }: { speed: Speed; onChange: (s: Speed) => void }) {
  return (
    <div className="speed" role="group" aria-label="Game speed">
      {SPEEDS.map((s) => (
        <button key={s} aria-pressed={speed === s} aria-label={s === 0 ? 'Pause' : `Speed ${s}x`} className={speed === s ? 'on' : ''} onClick={() => onChange(s)}>
          {s === 0 ? <PauseIcon /> : <PlayIcon count={s === 1 ? 1 : s === 2 ? 2 : 3} />}
        </button>
      ))}
    </div>
  );
}

function StageStatus({ state, speed }: { state: GameState; speed: Speed }) {
  const hod = state.hour % 24;
  const c = clockInfo(state.hour);
  let text: string;
  let tone: 'good' | 'warn' | 'idle';
  if (speed === 0) {
    text = 'Paused';
    tone = 'idle';
  } else if (!state.store.open) {
    text = 'Closed by you';
    tone = 'warn';
  } else if (!isOpenHour(hod)) {
    text = `Closed · Opens ${formatTime(OPEN_HOUR)}`;
    tone = 'idle';
  } else if (!readiness(state).ready) {
    text = 'Not ready to open';
    tone = 'warn';
  } else {
    text = `Open · ${state.lastHour?.served ?? 0} served last hour`;
    tone = 'good';
  }
  return (
    <div className="stage-status">
      <span>
        {c.dayName} {calendarDate(state.hour)} · {formatTime(hod)}
      </span>
      <span className={tone}>{text}</span>
    </div>
  );
}

interface Props {
  tab: TabId;
  onTab: (tab: TabId) => void;
  speed: Speed;
  onSpeed: (s: Speed) => void;
  onClose: () => void;
  saveError: string | null;
}

export function StoreScreen({ tab, onTab, speed, onSpeed, onClose, saveError }: Props) {
  const { state, openSheet } = useGameUi();
  const hood = neighborhood(state.neighborhoodId);
  const line = dialogueLine(state, speed === 0);

  return (
    <div className="store-screen">
      <header className="store-header">
        <BrandGlyph brand={state.brand} size={42} />
        <div className="store-title">
          <h1>{state.companyName}</h1>
          <p>
            {hood.address}, {hood.name}
          </p>
          <p className={`store-cash num ${cashBalance(state) < 0 ? 'neg' : ''}`}>{formatMoney(cashBalance(state))} cash</p>
        </div>
        <button className="close-btn" aria-label="Back to the city map" onClick={onClose}>
          <CloseIcon />
        </button>
      </header>

      <div className="store-body">
        <div className="store-main">
          <section className="stage">
            <div className="dialogue" aria-live="polite">
              <p>
                <strong>{line.speaker.name}</strong>
                <span>{line.text}</span>
              </p>
              <Portrait look={line.speaker.look} size={70} apron={state.brand.color} />
            </div>
            <StoreView state={state} speed={speed} />
            <StageStatus state={state} speed={speed} />
            <button className="fab left" aria-label="Staff" onClick={() => openSheet('staff')}>
              <StaffGlyph />
            </button>
            <SpeedControls speed={speed} onChange={onSpeed} />
            <button className="fab right" aria-label="Customize" onClick={() => openSheet('customize')}>
              <BoxGlyph />
            </button>
          </section>

          <Reviews state={state} />
        </div>

        <div className="store-panel" key={tab}>
          {tab === 'service' && <ServiceTab saveError={saveError} />}
          {tab === 'product' && <ProductTab />}
          {tab === 'marketing' && <MarketingTab />}
          {tab === 'finance' && <FinanceTab />}
        </div>
      </div>

      <nav className="tabbar" aria-label="Store sections">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => onTab(t.id)}>
            {t.icon}
            <span>{t.label}</span>
            {t.id === 'service' && state.incidents.length > 0 && <span className="badge">{state.incidents.length}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}
