import { dollars, type Cents } from './money';
import { post } from './ledger';
import { addLog } from './log';
import { random } from './rng';
import { regionById } from './regions';
import type { Beans, GameState, Plantation } from './state';

export const MAX_PLOTS = 8;
export const MILL_COST = dollars(15_000);
export const MILL_QUALITY_BONUS = 0.06;
export const FARMLAND_RESALE = 0.85;
// Menu costs assume beans bought at this price per kilo.
export const BASE_BEAN_PRICE: Cents = dollars(9);
// Market-bought beans are average quality; your own beans can beat that.
export const MARKET_BEAN_QUALITY = 0.75;

// Kilos of coffee in one serving.
export const BEAN_KG: Record<string, number> = {
  espresso: 0.018,
  americano: 0.018,
  latte: 0.018,
  cappuccino: 0.018,
  mocha: 0.018,
  drip: 0.015,
  coldbrew: 0.03,
};

export const emptyBeans = (): Beans => ({ kg: 0, value: 0, quality: MARKET_BEAN_QUALITY });

const WEATHER = [
  { id: 'Great season', factor: 1.15 },
  { id: 'Normal', factor: 1 },
  { id: 'Dry spell', factor: 0.7 },
  { id: 'Storm damage', factor: 0.4 },
] as const;

function rollWeather(state: GameState, risk: number): (typeof WEATHER)[number] {
  const r = random(state);
  if (r < risk * 0.35) return WEATHER[3];
  if (r < risk) return WEATHER[2];
  if (r > 0.85) return WEATHER[0];
  return WEATHER[1];
}

export const plantationQuality = (p: Plantation): number => Math.min(1, regionById(p.regionId).quality + (p.mill ? MILL_QUALITY_BONUS : 0));
export const plantationWeeklyCost = (p: Plantation): Cents => p.plots * regionById(p.regionId).weeklyCostPerPlot;
export const plantationExpectedKg = (p: Plantation): number => p.plots * regionById(p.regionId).yieldKgPerPlot;

const roundKg = (kg: number) => Math.round(kg * 1000) / 1000;

// Adds harvested beans to the warehouse at their cost, blending quality by weight.
export function addBeans(state: GameState, kg: number, value: Cents, quality: number): void {
  const b = state.beans;
  const total = b.kg + kg;
  b.quality = total > 0 ? Math.round(((b.kg * b.quality + kg * quality) / total) * 1000) / 1000 : b.quality;
  b.kg = roundKg(total);
  b.value += value;
}

// Takes up to `kg` from the warehouse and returns how much was taken and what it cost.
export function takeBeans(state: GameState, kg: number): { kg: number; cost: Cents } {
  const b = state.beans;
  const take = roundKg(Math.min(kg, b.kg));
  if (take <= 0) return { kg: 0, cost: 0 };
  const cost = take >= b.kg ? b.value : Math.round((b.value * take) / b.kg);
  b.kg = roundKg(b.kg - take);
  b.value -= cost;
  if (b.kg <= 0) {
    b.kg = 0;
    b.value = 0;
  }
  return { kg: take, cost };
}

// Weekly: each farm is paid for and its harvest goes into the warehouse at cost.
export function harvestWeek(state: GameState): void {
  for (const p of state.plantations) {
    const region = regionById(p.regionId);
    const weather = rollWeather(state, region.weatherRisk);
    const kg = roundKg(plantationExpectedKg(p) * weather.factor);
    const cost = plantationWeeklyCost(p);
    post(state, `Harvest at ${region.name}`, 'operating', [
      ['inventory', cost],
      ['cash', -cost],
    ]);
    addBeans(state, kg, cost, plantationQuality(p));
    p.lastHarvestKg = kg;
    p.lastWeather = weather.id;
    if (weather.factor < 0.5) addLog(state, 'bad', `A storm hit your farm in ${region.name}. Only ${Math.round(kg)} kg harvested.`);
  }
}

// The world price for beans wanders week to week and drifts back toward normal.
export function beanMarketWeek(state: GameState): void {
  const m = state.market;
  const shock = (random(state) + random(state) + random(state) - 1.5) * 0.08;
  const pull = ((BASE_BEAN_PRICE - m.beanPrice) / BASE_BEAN_PRICE) * 0.15;
  m.beanPrice = Math.round(Math.min(dollars(16), Math.max(dollars(6), m.beanPrice * (1 + shock + pull))));
}
