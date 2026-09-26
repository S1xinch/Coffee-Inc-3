import {
  DAY_TRAFFIC,
  MENU,
  TRAFFIC_CURVE,
  equipmentType,
  neighborhood,
  type MenuCategory,
  type MenuItem,
} from './catalog';
import { marketingTraffic } from './marketing';
import { random } from './rng';
import {
  ambianceMultiplier,
  itemAvailable,
  itemQuality,
  serviceCapacity,
  supplierCostMultiplier,
  trafficBoost,
  workingEquipment,
} from './store';
import type { GameState } from './state';

export interface HourSales {
  demand: number;
  served: number;
  lost: number;
  revenue: number;
  cogs: number;
  capacity: number;
  qualitySum: number;
  priceRatioSum: number;
  sold: Record<string, number>;
}

const TOTAL_DRINK_POPULARITY = MENU.filter((m) => m.category !== 'pastry').reduce((s, m) => s + m.popularity, 0);

// Largest-remainder split so integer counts always add up to the total.
export function allocate(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (w / sum) * total);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i] = (out[i] ?? 0) + 1;
    left -= 1;
  }
  return out;
}

interface Offer {
  item: MenuItem;
  price: number;
  priceRatio: number;
  quality: number;
  score: number;
}

function offers(state: GameState, drinks: boolean): Offer[] {
  const sensitivity = neighborhood(state.neighborhoodId).priceSensitivity;
  return MENU.filter((m) => (m.category === 'pastry') !== drinks)
    .filter((m) => state.store.menu[m.id]?.enabled && itemAvailable(state, m))
    .map((item) => {
      const price = state.store.menu[item.id]!.price;
      const priceRatio = item.refPrice / price;
      const priceFactor = Math.min(2.5, Math.pow(priceRatio, item.elasticity * sensitivity));
      const quality = itemQuality(state, item);
      return { item, price, priceRatio, quality, score: priceFactor * quality };
    });
}

export function expectedVisitors(state: GameState): number {
  const hourOfDay = state.hour % 24;
  const dayIndex = Math.floor(state.hour / 24) % 7;
  const awareness = 0.25 + (0.75 * state.store.reputation) / 100;
  return (
    neighborhood(state.neighborhoodId).trafficPerHour *
    (TRAFFIC_CURVE[hourOfDay] ?? 0) *
    (DAY_TRAFFIC[dayIndex] ?? 1) *
    awareness *
    trafficBoost(state) *
    marketingTraffic(state)
  );
}

export function simulateHourSales(state: GameState): HourSales {
  const drinks = offers(state, true);
  const noise = 0.9 + 0.2 * random(state);
  const capacity = serviceCapacity(state);
  const empty: HourSales = { demand: 0, served: 0, lost: 0, revenue: 0, cogs: 0, capacity, qualitySum: 0, priceRatioSum: 0, sold: {} };
  if (drinks.length === 0) return empty;

  const offeredPopularity = drinks.reduce((s, d) => s + d.item.popularity, 0);
  const avgScore = drinks.reduce((s, d) => s + d.item.popularity * d.score, 0) / offeredPopularity;
  const variety = 0.7 + (0.3 * offeredPopularity) / TOTAL_DRINK_POPULARITY;
  const conversion = 0.3 * Math.min(avgScore, 1.6) * variety * ambianceMultiplier(state);
  const demand = Math.round(expectedVisitors(state) * conversion * noise);

  const counts = allocate(Math.min(demand, Math.floor(capacity)), drinks.map((d) => d.item.popularity * d.score));

  // Each machine has its own hourly limit; orders beyond it walk out.
  const byCategory = new Map<MenuCategory, number[]>();
  drinks.forEach((d, i) => {
    const list = byCategory.get(d.item.category) ?? [];
    list.push(i);
    byCategory.set(d.item.category, list);
  });
  for (const [category, indexes] of byCategory) {
    const machine = workingEquipment(state, category);
    const cap = machine ? equipmentType(machine.typeId).capacity : 0;
    const total = indexes.reduce((s, i) => s + (counts[i] ?? 0), 0);
    if (total > cap) {
      const trimmed = allocate(cap, indexes.map((i) => counts[i] ?? 0));
      indexes.forEach((idx, j) => (counts[idx] = trimmed[j] ?? 0));
    }
  }

  const served = counts.reduce((a, b) => a + b, 0);
  const sold: Record<string, number> = {};
  let revenue = 0;
  let rawCogs = 0;
  let qualitySum = 0;
  let priceRatioSum = 0;
  drinks.forEach((d, i) => {
    const n = counts[i] ?? 0;
    if (n === 0) return;
    sold[d.item.id] = n;
    revenue += n * d.price;
    rawCogs += n * d.item.unitCost;
    qualitySum += n * d.quality;
    priceRatioSum += n * Math.min(d.priceRatio, 2);
  });

  const pastries = offers(state, false);
  if (pastries.length > 0 && served > 0) {
    const pastryScore = pastries.reduce((s, p) => s + p.score, 0) / pastries.length;
    const attach = Math.min(0.6, 0.35 * pastryScore);
    const pastryCounts = allocate(Math.round(served * attach), pastries.map((p) => p.item.popularity * p.score));
    pastries.forEach((p, i) => {
      const n = pastryCounts[i] ?? 0;
      if (n === 0) return;
      sold[p.item.id] = n;
      revenue += n * p.price;
      rawCogs += n * p.item.unitCost;
    });
  }

  return {
    demand,
    served,
    lost: Math.max(0, demand - served),
    revenue,
    cogs: Math.round(rawCogs * supplierCostMultiplier(state)),
    capacity,
    qualitySum,
    priceRatioSum,
    sold,
  };
}
