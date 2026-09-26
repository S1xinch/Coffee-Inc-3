import { MENU } from './catalog';
import { LOTS, lot } from './city';
import { addLog } from './log';
import { random } from './rng';
import { starRating } from './store';
import type { GameState, Rival, Store } from './state';

export const RIVAL_NAME = 'Northline Coffee';
export const RIVAL_COLOR = '#d98b2b';
export const RIVAL_MAX_STORES = 6;
export const RIVAL_EXPANSION_WEEKS = 5;

export const newRival = (): Rival => ({
  name: RIVAL_NAME,
  stores: [
    { lotId: 'waterfront-2', openedHour: 0 },
    { lotId: 'university-2', openedHour: 0 },
  ],
  priceIndex: 1,
  stars: 3.7,
});

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// How much better the menu's prices are than the typical price, averaged over drinks on offer.
export function priceRatio(store: Store): number {
  const drinks = MENU.filter((m) => m.category !== 'pastry' && store.menu[m.id]?.enabled);
  if (drinks.length === 0) return 1;
  return drinks.reduce((sum, m) => sum + m.refPrice / store.menu[m.id]!.price, 0) / drinks.length;
}

const storeScore = (store: Store) => (store.reviews > 0 ? starRating(store) : 3) * priceRatio(store);
const rivalScore = (rival: Rival) => rival.stars / rival.priceIndex;

export const rivalStoresIn = (state: GameState, districtId: string) => state.rival.stores.filter((r) => lot(r.lotId).districtId === districtId);

// Walk-ins are shared with your own stores in the same district and fought over with the rival.
export function competitionFactor(state: GameState, store: Store): number {
  const districtId = lot(store.lotId).districtId;
  const siblings = state.stores.filter((s) => s.id !== store.id && lot(s.lotId).districtId === districtId).length;
  let factor = 1 / (1 + 0.25 * siblings);
  const rivals = rivalStoresIn(state, districtId).length;
  if (rivals > 0) {
    const ratio = clamp(rivalScore(state.rival) / storeScore(store), 0.4, 1.6);
    factor *= 1 - Math.min(0.45, 0.22 * ratio * rivals);
  }
  return factor;
}

export interface DistrictShare {
  yourStores: number;
  rivalStores: number;
  yourShare: number;
}

export function districtShare(state: GameState, districtId: string): DistrictShare {
  const yours = state.stores.filter((s) => lot(s.lotId).districtId === districtId);
  const rivals = rivalStoresIn(state, districtId).length;
  const yourScore = yours.reduce((sum, s) => sum + storeScore(s), 0);
  const total = yourScore + rivals * rivalScore(state.rival);
  return { yourStores: yours.length, rivalStores: rivals, yourShare: total > 0 ? yourScore / total : 0 };
}

export const lotTaken = (state: GameState, lotId: string): boolean =>
  state.stores.some((s) => s.lotId === lotId) || state.rival.stores.some((r) => r.lotId === lotId);

// Weekly: the rival answers your prices, drifts in quality, and opens new stores every few weeks.
export function rivalWeek(state: GameState, weekNumber: number): void {
  const rival = state.rival;
  const yourPrice = state.stores.reduce((sum, s) => sum + priceRatio(s), 0) / state.stores.length;
  rival.priceIndex = Math.round(clamp(yourPrice > 1.02 ? rival.priceIndex * 0.97 : rival.priceIndex * 1.02, 0.85, 1.15) * 1000) / 1000;
  rival.stars = Math.round(clamp(rival.stars + (random(state) - 0.5) * 0.2, 3.3, 4.3) * 100) / 100;

  if (weekNumber % RIVAL_EXPANSION_WEEKS === 0 && rival.stores.length < RIVAL_MAX_STORES) {
    const free = LOTS.filter((l) => !lotTaken(state, l.id));
    if (free.length > 0) {
      const pick = free[Math.floor(random(state) * free.length)]!;
      rival.stores.push({ lotId: pick.id, openedHour: state.hour });
      addLog(state, 'bad', `${rival.name} opened a store at ${pick.address}.`);
    }
  }
}
