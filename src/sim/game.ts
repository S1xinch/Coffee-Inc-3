import { BRAND_COLORS, MENU, START_HOUR, STARTING_CAPITAL, neighborhood } from './catalog';
import { post } from './ledger';
import { addLog } from './log';
import { refreshCandidates } from './staff';
import { emptyDayStats, type BrandIcon, type GameState } from './state';

export interface NewGameOptions {
  companyName: string;
  neighborhoodId: string;
  seed: number;
  brand?: { icon: BrandIcon; color: string };
}

export function newGame({ companyName, neighborhoodId, seed, brand }: NewGameOptions): GameState {
  neighborhood(neighborhoodId);
  const state: GameState = {
    companyName: companyName.trim().slice(0, 40) || 'My Coffee Co.',
    brand: brand ?? { icon: 'cup', color: BRAND_COLORS[0] },
    neighborhoodId,
    hour: 0,
    rng: seed >>> 0,
    nextId: 0,
    store: {
      open: true,
      equipment: [],
      menu: Object.fromEntries(MENU.map((m) => [m.id, { enabled: true, price: m.refPrice }])),
      reputation: 20,
      satisfaction: 50,
      ratings: { price: 0.5, product: 0.5, service: 0.5, atmosphere: 0.5 },
      reviews: 0,
      marketing: {},
    },
    staff: [],
    candidates: [],
    ledger: { broughtForward: {}, journal: [], weekOpeningCash: 0 },
    reports: [],
    distressWeeks: 0,
    bankrupt: false,
    incidents: [],
    modifiers: [],
    log: [],
    today: emptyDayStats(),
    week: { served: 0, lost: 0 },
    lastHour: null,
    yesterday: null,
    lifetime: { served: 0, revenue: 0, incidentsAutoResolved: 0, staffQuit: 0 },
    lastSeenReportWeek: 0,
  };
  post(state, 'Founder investment', 'financing', [['cash', STARTING_CAPITAL], ['ownerCapital', -STARTING_CAPITAL]]);
  refreshCandidates(state);
  state.hour = START_HOUR;
  addLog(state, 'info', `Welcome to ${state.companyName}. Buy a register and an espresso machine, hire a barista, and open your doors.`);
  return state;
}
