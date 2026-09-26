import { useEffect, useState, type ReactNode } from 'react';
import { OPEN_HOUR, equipmentType } from '../sim/catalog';
import { lot } from '../sim/city';
import { SPEEDS, calendarDate, clockInfo, formatTime, type Speed } from '../sim/clock';
import { cashBalance } from '../sim/ledger';
import { formatMoney } from '../sim/money';
import { isFloorCell, occupant } from '../sim/layout';
import type { Cell, GameState, Store } from '../sim/state';
import { isOpenHour, readiness, storeDistrict } from '../sim/store';
import { BrandGlyph, Portrait } from './Brand';
import { CheckIcon, CloseIcon, PauseIcon, PlayIcon } from './Icons';
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

function StageStatus({ state, store, speed }: { state: GameState; store: Store; speed: Speed }) {
  const hod = state.hour % 24;
  const c = clockInfo(state.hour);
  let text: string;
  let tone: 'good' | 'warn' | 'idle';
  if (speed === 0) {
    text = 'Paused';
    tone = 'idle';
  } else if (!store.open) {
    text = 'Closed by you';
    tone = 'warn';
  } else if (!isOpenHour(hod)) {
    text = `Closed · Opens ${formatTime(OPEN_HOUR)}`;
    tone = 'idle';
  } else if (!readiness(state, store).ready) {
    text = 'Not ready to open';
    tone = 'warn';
  } else {
    text = `Open · ${store.lastHour?.served ?? 0} served last hour`;
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

const ArrangeGlyph = () => (
  <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v18M3 12h18" />
    <path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
  </svg>
);

function StoreSwitcher() {
  const { state, store, selectStore } = useGameUi();
  if (state.stores.length < 2) return null;
  const i = state.stores.findIndex((s) => s.id === store.id);
  const go = (d: number) => selectStore(state.stores[(i + d + state.stores.length) % state.stores.length]!.id);
  return (
    <div className="store-switch" role="group" aria-label="Switch store">
      <button className="btn btn-icon" aria-label="Previous store" onClick={() => go(-1)}>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>
      <span className="num">
        {i + 1} of {state.stores.length}
      </span>
      <button className="btn btn-icon" aria-label="Next store" onClick={() => go(1)}>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

export function StoreScreen({ tab, onTab, speed, onSpeed, onClose, saveError }: Props) {
  const { state, store, openSheet, storeAct } = useGameUi();
  const district = storeDistrict(store);
  const line = dialogueLine(state, store, speed === 0);
  const [arranging, setArranging] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const storeIncidents = state.incidents.filter((i) => i.storeId === store.id).length;

  // Switching stores ends arrange mode.
  useEffect(() => {
    setArranging(false);
    setSelected(null);
  }, [store.id]);

  const onCell = async (cell: Cell) => {
    const there = occupant(store, cell);
    if (selected && there !== selected && isFloorCell(cell)) {
      const ok = await storeAct({ type: 'moveItem', equipmentId: selected, x: cell.x, y: cell.y });
      if (ok) setSelected(null);
      return;
    }
    setSelected(there && there !== selected ? there : null);
  };
  const selectedItem = selected ? store.equipment.find((e) => e.id === selected) : undefined;

  return (
    <div className="store-screen">
      <header className="store-header">
        <BrandGlyph brand={state.brand} size={42} />
        <div className="store-title">
          <h1>{state.companyName}</h1>
          <p>
            {lot(store.lotId).address}, {district.name}
          </p>
          <p className={`store-cash num ${cashBalance(state) < 0 ? 'neg' : ''}`}>{formatMoney(cashBalance(state))} cash</p>
          <StoreSwitcher />
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
            <StoreView state={state} store={store} speed={speed} arrange={arranging ? { selected, onCell } : null} />
            {!arranging && <StageStatus state={state} store={store} speed={speed} />}
            {arranging ? (
              <div className="arrange-bar">
                <span>{selectedItem ? `Tap a green square for the ${equipmentType(selectedItem.typeId).name.toLowerCase()}` : 'Tap a gold square to pick it up'}</span>
                <button
                  className="btn btn-primary btn-small"
                  onClick={() => {
                    setArranging(false);
                    setSelected(null);
                  }}
                >
                  <CheckIcon /> Done
                </button>
              </div>
            ) : (
              <>
                <button className="fab left" aria-label="Staff" onClick={() => openSheet('staff')}>
                  <StaffGlyph />
                </button>
                <SpeedControls speed={speed} onChange={onSpeed} />
                <button className="fab right" aria-label="Customize" onClick={() => openSheet('customize')}>
                  <BoxGlyph />
                </button>
                {Object.keys(store.layout).length > 0 && (
                  <button className="fab right2" aria-label="Arrange furniture" onClick={() => setArranging(true)}>
                    <ArrangeGlyph />
                  </button>
                )}
              </>
            )}
          </section>

          <Reviews store={store} />
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
            {t.id === 'service' && storeIncidents > 0 && <span className="badge">{storeIncidents}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}
