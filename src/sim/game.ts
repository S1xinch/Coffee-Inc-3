import { BRAND_COLORS, MENU, START_HOUR, STARTING_CAPITAL } from './catalog';
import { firstLotIn } from './city';
import { post } from './ledger';
import { addLog } from './log';
import { newRival } from './rival';
import { newId } from './rng';
import { refreshCandidates } from './staff';
import { emptyDayStats, type BrandIcon, type GameState, type Store } from './state';

export interface NewGameOptions {
  companyName: string;
  districtId: string;
  seed: number;
  brand?: { icon: BrandIcon; color: string };
}

export function createStore(state: GameState, lotId: string): Store {
  return {
    id: newId(state, 'store'),
    lotId,
    openedHour: state.hour,
    open: true,
    equipment: [],
    layout: {},
    menu: Object.fromEntries(MENU.map((m) => [m.id, { enabled: true, price: m.refPrice }])),
    reputation: 20,
    satisfaction: 50,
    ratings: { price: 0.5, product: 0.5, service: 0.5, atmosphere: 0.5 },
    reviews: 0,
    marketing: {},
    staff: [],
    manager: null,
    today: emptyDayStats(),
    yesterday: null,
    week: { served: 0, lost: 0 },
    lastHour: null,
  };
}

export function newGame({ companyName, districtId, seed, brand }: NewGameOptions): GameState {
  const first = firstLotIn(districtId);
  const state: GameState = {
    companyName: companyName.trim().slice(0, 40) || 'My Coffee Co.',
    brand: brand ?? { icon: 'cup', color: BRAND_COLORS[0] },
    hour: 0,
    rng: seed >>> 0,
    nextId: 0,
    stores: [],
    candidates: [],
    ledger: { broughtForward: {}, journal: [], weekOpeningCash: 0 },
    reports: [],
    distressWeeks: 0,
    bankrupt: false,
    incidents: [],
    modifiers: [],
    log: [],
    rival: newRival(),
    lifetime: { served: 0, revenue: 0, incidentsAutoResolved: 0, staffQuit: 0 },
    lastSeenReportWeek: 0,
  };
  state.stores.push(createStore(state, first.id));
  post(state, 'Founder investment', 'financing', [['cash', STARTING_CAPITAL], ['ownerCapital', -STARTING_CAPITAL]]);
  refreshCandidates(state);
  state.hour = START_HOUR;
  state.stores[0]!.openedHour = START_HOUR;
  addLog(state, 'info', `Welcome to ${state.companyName}. Buy a register and an espresso machine, hire a barista, and open your doors.`);
  return state;
}
