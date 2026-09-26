import { CITIES, lot } from './city';
import { deptLevel } from './hq';
import { balanceSheet, post } from './ledger';
import { dollars, type Cents } from './money';
import { BASE_BEAN_PRICE } from './plantations';
import { random } from './rng';
import { averageReputation, lotRent } from './store';
import type { GameState, Shares } from './state';

// ---- Stock market -------------------------------------------------------------------------
// Fictional companies. Northline Coffee is the rival chain, and its price follows how it's doing.

export interface StockDef {
  symbol: string;
  name: string;
  blurb: string;
  start: Cents;
  drift: number;
  volatility: number;
}

export const STOCKS: readonly StockDef[] = [
  { symbol: 'EVRG', name: 'Evergreen Total Market Index', blurb: 'The whole market in one fund. Slow and steady.', start: dollars(120), drift: 0.0015, volatility: 0.02 },
  { symbol: 'CSRL', name: 'Cascade Rail', blurb: 'Freight trains up and down the coast.', start: dollars(58), drift: 0.001, volatility: 0.035 },
  { symbol: 'PNCR', name: 'Pinecrest Foods', blurb: 'Grocery staples. Boring on purpose.', start: dollars(34), drift: 0.0012, volatility: 0.03 },
  { symbol: 'SLTK', name: 'Solstice Tech', blurb: 'Fast-growing software. Big swings both ways.', start: dollars(210), drift: 0.003, volatility: 0.07 },
  { symbol: 'TDWB', name: 'Tidewater Breweries', blurb: 'Craft beer from the harbor.', start: dollars(26), drift: 0.0005, volatility: 0.04 },
  { symbol: 'NLCF', name: 'Northline Coffee', blurb: 'Your rival. Its stock rises when it grows and falls when you win.', start: dollars(44), drift: 0, volatility: 0.05 },
];

export const stockDef = (symbol: string): StockDef | undefined => STOCKS.find((s) => s.symbol === symbol);

export function newMarket(): GameState['market'] {
  return {
    beanPrice: BASE_BEAN_PRICE,
    stocks: Object.fromEntries(STOCKS.map((s) => [s.symbol, { price: s.start, prev: s.start }])),
    realEstateIndex: Object.fromEntries(CITIES.map((c) => [c.id, 1])),
  };
}

// A rough bell curve from three uniform draws, so results don't depend on Math.random.
const bell = (state: GameState) => (random(state) + random(state) + random(state) - 1.5) / 0.5;

export function marketWeek(state: GameState): void {
  const m = state.market;
  for (const def of STOCKS) {
    const q = m.stocks[def.symbol] ?? { price: def.start, prev: def.start };
    const drift = def.symbol === 'NLCF' ? (state.rival.stars - 3.8) * 0.01 + (state.rival.stores.length - 3) * 0.002 : def.drift;
    const next = Math.max(dollars(1), Math.round(q.price * (1 + drift + bell(state) * def.volatility)));
    m.stocks[def.symbol] = { price: next, prev: q.price };
  }
  for (const c of CITIES) {
    const i = m.realEstateIndex[c.id] ?? 1;
    m.realEstateIndex[c.id] = Math.round(i * (1 + 0.0015 + bell(state) * 0.004) * 10000) / 10000;
  }
}

export function holdingsValue(state: GameState): Cents {
  return Object.entries(state.holdings).reduce((sum, [symbol, h]) => sum + h.shares * (state.market.stocks[symbol]?.price ?? 0), 0);
}

// ---- Real estate --------------------------------------------------------------------------

export interface PropertyDef {
  id: string;
  cityId: string;
  name: string;
  address: string;
  basePrice: Cents;
  weeklyRent: Cents;
  // The building one of your own stores could sit in. Owning it means no more rent for that store.
  lotId: string | null;
}

const building = (id: string, cityId: string, name: string, address: string, price: number, rent: number): PropertyDef => ({
  id,
  cityId,
  name,
  address,
  basePrice: dollars(price),
  weeklyRent: dollars(rent),
  lotId: null,
});

export const PROPERTIES: readonly PropertyDef[] = [
  building('sea-cedar', 'seattle', 'Cedar Court Apartments', '2210 Cedar Street', 420_000, 2_600),
  building('sea-lakeside', 'seattle', 'Lakeside Offices', '15 Eastlake Avenue', 900_000, 5_400),
  building('sea-pier9', 'seattle', 'Pier 9 Warehouse', '9 Alaskan Way', 600_000, 3_500),
  building('pdx-burnside', 'portland', 'Burnside Lofts', '830 W Burnside Street', 350_000, 2_200),
  building('pdx-millend', 'portland', 'Mill End Office Block', '44 SW Naito Parkway', 520_000, 3_100),
  building('pdx-eastbank', 'portland', 'Eastbank Storage', '120 SE Water Avenue', 280_000, 1_700),
  building('sf-hayes', 'san-francisco', 'Hayes Row Flats', '410 Hayes Street', 1_100_000, 6_200),
  building('sf-market', 'san-francisco', 'Market Street Tower, 12th floor', '555 Market Street', 1_600_000, 8_800),
  building('sf-dogpatch', 'san-francisco', 'Dogpatch Studios', '1000 Illinois Street', 750_000, 4_300),
];

export const STORE_BUILDING_YEARS_OF_RENT = 180;
export const storeBuildingId = (lotId: string) => `lot:${lotId}`;

export function propertyDef(id: string): PropertyDef | undefined {
  if (id.startsWith('lot:')) {
    const lotId = id.slice(4);
    let l;
    try {
      l = lot(lotId);
    } catch {
      return undefined;
    }
    const rent = lotRent(lotId);
    return { id, cityId: l.cityId, name: `Building at ${l.address}`, address: l.address, basePrice: rent * STORE_BUILDING_YEARS_OF_RENT, weeklyRent: rent, lotId };
  }
  return PROPERTIES.find((p) => p.id === id);
}

export const propertyValue = (state: GameState, def: PropertyDef): Cents => Math.round(def.basePrice * (state.market.realEstateIndex[def.cityId] ?? 1));
export const ownsBuilding = (state: GameState, lotId: string): boolean => state.properties.some((p) => p.propertyId === storeBuildingId(lotId));
export const REAL_ESTATE_UPKEEP = 0.15;
export const REAL_ESTATE_SALE_FEE = 0.05;

export function realEstateValue(state: GameState): Cents {
  return state.properties.reduce((sum, p) => {
    const def = propertyDef(p.propertyId);
    return sum + (def ? propertyValue(state, def) : p.cost);
  }, 0);
}

// Weekly: rent comes in from tenants, and every building costs upkeep.
export function realEstateWeek(state: GameState): void {
  for (const owned of state.properties) {
    const def = propertyDef(owned.propertyId);
    if (!def) continue;
    const upkeep = Math.round(def.weeklyRent * REAL_ESTATE_UPKEEP);
    if (def.lotId === null) post(state, `Rent from ${def.name}`, 'operating', [['cash', def.weeklyRent], ['otherIncome', -def.weeklyRent]]);
    post(state, `Upkeep on ${def.name}`, 'operating', [['otherExpense', upkeep], ['cash', -upkeep]]);
  }
}

// ---- Company shares -----------------------------------------------------------------------

export const STARTING_SHARES = 1_000_000n;
export const IPO_PERCENTS = [10, 20, 30, 40] as const;
export const IPO_MIN_STORES = 3;
export const IPO_FEE = 0.05;
export const SPLIT_MIN_PRICE = dollars(200);
export const OWNER_SALE_FEE = 0.03;

export const shareCount = (s: Shares) => BigInt(s.total);
export const ownerShares = (s: Shares) => BigInt(s.owner);

export function newShares(): Shares {
  return { total: STARTING_SHARES.toString(), owner: STARTING_SHARES.toString(), listed: false, price: 1, listedHour: null, history: [] };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// What the company is worth: its books, plus its earnings at a multiple that grows with growth,
// plus the brand its stores have built.
export function companyValuation(state: GameState): Cents {
  const equity = balanceSheet(state).totalEquity;
  const last4 = state.reports.slice(-4);
  const prev4 = state.reports.slice(-8, -4);
  const annualEarnings = last4.length > 0 ? (last4.reduce((s, r) => s + r.income.netIncome, 0) / last4.length) * 52 : 0;
  const rev = last4.reduce((s, r) => s + r.income.revenue, 0);
  const prevRev = prev4.reduce((s, r) => s + r.income.revenue, 0);
  const growth = prevRev > 0 ? (rev - prevRev) / prevRev : 0;
  const pe = clamp(12 + growth * 40, 6, 30);
  const exec = 1 + 0.05 * deptLevel(state, 'executive');
  const board = state.shares.listed ? 0.85 + (0.3 * state.board.confidence) / 100 : 1;
  const brand = state.stores.length * dollars(25_000) * (averageReputation(state) / 50);
  const value = Math.max(0, equity) + Math.max(0, annualEarnings) * pe * exec * board + brand;
  return Math.max(dollars(1_000), Math.round(value));
}

export function fairSharePrice(state: GameState): Cents {
  const perShare = BigInt(companyValuation(state)) / shareCount(state.shares);
  return Math.max(1, Number(perShare));
}

// Weekly: the share price moves toward fair value. Once listed, the market adds its own noise.
export function sharesWeek(state: GameState, week: number): void {
  const s = state.shares;
  const fair = fairSharePrice(state);
  s.price = s.listed ? Math.max(1, Math.round((s.price + (fair - s.price) * 0.35) * (1 + bell(state) * 0.03))) : fair;
  s.history.push({ week, price: s.price });
  if (s.history.length > 52) s.history.splice(0, s.history.length - 52);
}

// A listed company's price is set by the market each week. A private company is worth its fair
// value right now, so its numbers never lag behind a big purchase or a good week.
export const sharePrice = (state: GameState): Cents => (state.shares.listed ? state.shares.price : fairSharePrice(state));
export const marketCap = (state: GameState): bigint => BigInt(sharePrice(state)) * shareCount(state.shares);
export const ownerStakeValue = (state: GameState): bigint => BigInt(sharePrice(state)) * ownerShares(state.shares);
export const ownerStakePercent = (s: Shares): number => Number((ownerShares(s) * 10_000n) / shareCount(s)) / 100;
export const personalWealth = (state: GameState): bigint => BigInt(state.owner.cash) + ownerStakeValue(state);

export function ipoBlocker(state: GameState): string | null {
  if (state.shares.listed) return 'The company is already public.';
  if (deptLevel(state, 'investment') < 2) return 'Build the Investment department to level 2.';
  if (deptLevel(state, 'executive') < 1) return 'Build the Executive Office.';
  if (state.stores.length < IPO_MIN_STORES) return `Run at least ${IPO_MIN_STORES} stores.`;
  return null;
}

// Converts a BigInt amount of cents back to a number, refusing anything that would lose precision.
export function toCents(value: bigint, what: string): Cents {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < -BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${what} is too large to handle.`);
  }
  return Number(value);
}

// Formats a BigInt amount of cents as whole dollars without going through a float.
export function formatBigMoney(cents: bigint): string {
  const negative = cents < 0n;
  const whole = (negative ? -cents : cents) / 100n;
  const text = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}$${text}`;
}

export const formatShares = (n: bigint): string => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
