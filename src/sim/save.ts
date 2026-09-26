import { EQUIPMENT, MENU } from './catalog';
import { LOTS, firstLotIn } from './city';
import { INCIDENTS } from './incidents';
import { normalizeLayout } from './layout';
import { ledgerIsBalanced } from './ledger';
import { CAMPAIGNS } from './marketing';
import { emptyHq } from './hq';
import { newMarket, newShares } from './markets';
import { emptyBeans } from './plantations';
import { newRival } from './rival';
import { GameStateSchema, type GameState } from './state';

export const SAVE_FORMAT = 'coffee-inc-3-save';
export const SAVE_VERSION = 4;

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: number;
  savedAtMs: number;
  state: GameState;
}

export type ParseResult = { ok: true; save: SaveFile } | { ok: false; error: string };

type RawState = Record<string, unknown>;

const withMarketingAccrued = (day: unknown) => (day && typeof day === 'object' ? { marketingAccrued: 0, ...day } : day);

// Each entry upgrades a save from version N to N + 1.
export const MIGRATIONS: Record<number, (state: RawState) => RawState> = {
  1: (s) => {
    const store = (s.store ?? {}) as RawState;
    const satisfaction = typeof store.satisfaction === 'number' ? store.satisfaction / 100 : 0.5;
    const lifetime = (s.lifetime ?? {}) as RawState;
    const served = typeof lifetime.served === 'number' ? lifetime.served : 0;
    return {
      ...s,
      brand: { icon: 'cup', color: '#2f6f8f' },
      store: {
        ...store,
        ratings: { price: satisfaction, product: satisfaction, service: satisfaction, atmosphere: satisfaction },
        reviews: Math.round(served * 0.02),
        marketing: {},
      },
      today: withMarketingAccrued(s.today),
      yesterday: withMarketingAccrued(s.yesterday),
    };
  },
  // Version 3: one store becomes a list of stores on lots, plus the rival chain.
  2: (s) => {
    const district = typeof s.neighborhoodId === 'string' && LOTS.some((l) => l.districtId === s.neighborhoodId) ? s.neighborhoodId : 'old-town';
    const storeId = 'store1';
    const old = (s.store ?? {}) as RawState;
    const store = {
      ...old,
      id: storeId,
      lotId: firstLotIn(district).id,
      openedHour: 0,
      layout: {},
      staff: s.staff ?? [],
      manager: null,
      today: s.today,
      yesterday: s.yesterday ?? null,
      week: s.week ?? { served: 0, lost: 0 },
      lastHour: s.lastHour ?? null,
    };
    const ledger = (s.ledger ?? {}) as RawState;
    const journal = Array.isArray(ledger.journal) ? (ledger.journal as RawState[]) : [];
    const reports = Array.isArray(s.reports) ? (s.reports as RawState[]) : [];
    const rest: RawState = { ...s };
    for (const k of ['neighborhoodId', 'store', 'staff', 'today', 'yesterday', 'week', 'lastHour']) delete rest[k];
    return {
      ...rest,
      stores: [store],
      ledger: { ...ledger, journal: journal.map((e) => ({ ...e, storeId: e.kind === 'financing' || e.memo === 'Loan interest' ? null : storeId })) },
      reports: reports.map((r) => ({ ...r, stores: [] })),
      incidents: (Array.isArray(s.incidents) ? (s.incidents as RawState[]) : []).map((i) => ({ ...i, storeId })),
      modifiers: (Array.isArray(s.modifiers) ? (s.modifiers as RawState[]) : []).map((m) => ({ ...m, storeId })),
      rival: newRival(),
    };
  },
  // Version 4: cities, headquarters, plantations, markets, company shares, and the founder's own cash.
  // New balance sheet lines and day-stat fields default to zero in the schema.
  3: (s) => ({
    ...s,
    cities: ['seattle'],
    hq: emptyHq(),
    board: { confidence: 50, targetRevenue: null, targetNetIncome: null, meetings: [] },
    plantations: [],
    beans: emptyBeans(),
    market: newMarket(),
    holdings: {},
    properties: [],
    shares: newShares(),
    owner: { cash: 0 },
    settings: { politics: true },
  }),
};

export const makeSave = (state: GameState, savedAtMs: number): SaveFile => ({
  format: SAVE_FORMAT,
  version: SAVE_VERSION,
  savedAtMs,
  state,
});

function semanticProblem(state: GameState): string | null {
  const lots = [...state.stores.map((s) => s.lotId), ...state.rival.stores.map((r) => r.lotId)];
  const badLot = lots.find((id) => !LOTS.some((l) => l.id === id));
  if (badLot) return `unknown lot "${badLot}"`;
  const locked = state.stores.find((s) => !state.cities.includes(LOTS.find((l) => l.id === s.lotId)!.cityId));
  if (locked) return 'a store in a city that is not unlocked';
  if (BigInt(state.shares.owner) > BigInt(state.shares.total) || BigInt(state.shares.total) === 0n) return 'impossible share counts';
  if (new Set(lots).size !== lots.length) return 'two stores on the same lot';
  if (new Set(state.stores.map((s) => s.id)).size !== state.stores.length) return 'duplicate store ids';
  for (const store of state.stores) {
    const badEquipment = store.equipment.find((e) => !EQUIPMENT.some((t) => t.id === e.typeId));
    if (badEquipment) return `unknown equipment "${badEquipment.typeId}"`;
    if (new Set(store.staff.map((s) => s.id)).size !== store.staff.length) return 'duplicate staff ids';
    for (const [id, level] of Object.entries(store.marketing)) {
      const c = CAMPAIGNS.find((x) => x.id === id);
      if (!c || !c.levels[level]) return `unknown marketing campaign "${id}"`;
    }
  }
  const badIncident = state.incidents.find((i) => !INCIDENTS.some((d) => d.id === i.defId));
  if (badIncident) return `unknown incident "${badIncident.defId}"`;
  if (!ledgerIsBalanced(state)) return 'the books do not balance';
  return null;
}

export function parseSave(raw: unknown, migrations = MIGRATIONS, currentVersion = SAVE_VERSION): ParseResult {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'This file is not valid JSON.' };
    }
  }
  if (typeof data !== 'object' || data === null) return { ok: false, error: 'This is not a Coffee Inc 3 save.' };
  const file = data as Record<string, unknown>;
  if (file.format !== SAVE_FORMAT) return { ok: false, error: 'This is not a Coffee Inc 3 save.' };
  if (typeof file.version !== 'number' || !Number.isInteger(file.version) || file.version < 1) {
    return { ok: false, error: 'The save has no valid version number.' };
  }
  if (file.version > currentVersion) {
    return { ok: false, error: 'This save was made by a newer version of the game. Update the app and try again.' };
  }
  if (typeof file.state !== 'object' || file.state === null) return { ok: false, error: 'The save has no game data.' };

  let state = file.state as Record<string, unknown>;
  for (let v = file.version; v < currentVersion; v++) {
    const migrate = migrations[v];
    if (!migrate) return { ok: false, error: `No upgrade path from save version ${v}.` };
    state = migrate(state);
  }

  const parsed = GameStateSchema.safeParse(state);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `The save is damaged (${issue ? `${issue.path.join('.')}: ${issue.message}` : 'invalid data'}).` };
  }
  const game = parsed.data;
  const problem = semanticProblem(game);
  if (problem) return { ok: false, error: `The save is damaged (${problem}).` };
  for (const store of game.stores) {
    for (const item of MENU) store.menu[item.id] ??= { enabled: false, price: item.refPrice };
    normalizeLayout(store);
  }

  const savedAtMs = typeof file.savedAtMs === 'number' && Number.isFinite(file.savedAtMs) ? file.savedAtMs : Date.now();
  return { ok: true, save: { format: SAVE_FORMAT, version: currentVersion, savedAtMs, state: game } };
}
