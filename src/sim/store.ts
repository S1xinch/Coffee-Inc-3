import {
  CLOSE_HOUR,
  EQUIPMENT,
  MENU,
  MENU_CATEGORY_EQUIPMENT,
  OPEN_HOUR,
  RESALE_RATE,
  equipmentType,
  type EquipmentCategory,
  type MenuItem,
} from './catalog';
import { balances, post } from './ledger';
import { dollars, type Cents } from './money';
import type { Equipment, GameState, Staff } from './state';

export const isOpenHour = (hourOfDay: number): boolean => hourOfDay >= OPEN_HOUR && hourOfDay < CLOSE_HOUR;

export function equipmentIn(state: GameState, category: EquipmentCategory): Equipment | undefined {
  return state.store.equipment.find((e) => equipmentType(e.typeId).category === category);
}

export function workingEquipment(state: GameState, category: EquipmentCategory): Equipment | undefined {
  const e = equipmentIn(state, category);
  return e && !e.broken ? e : undefined;
}

export function itemAvailable(state: GameState, item: MenuItem): boolean {
  return workingEquipment(state, MENU_CATEGORY_EQUIPMENT[item.category]) !== undefined;
}

export function ambiancePoints(state: GameState): number {
  return state.store.equipment.reduce((sum, e) => sum + equipmentType(e.typeId).ambiance, 0);
}

export const ambianceMultiplier = (state: GameState): number => 0.85 + Math.min(ambiancePoints(state), 16) * 0.025;

function activeModifier(state: GameState, kind: GameState['modifiers'][number]['kind'], neutral: number): number {
  return state.modifiers
    .filter((m) => m.kind === kind && m.untilHour > state.hour)
    .reduce((acc, m) => (kind === 'qualityPenalty' ? acc + m.value : acc * m.value), neutral);
}

export const supplierCostMultiplier = (state: GameState): number => activeModifier(state, 'supplierCost', 1);
export const trafficBoost = (state: GameState): number => activeModifier(state, 'trafficBoost', 1);

// Roughly 0.8 (entry level) to 1.4 (best machine and grinder).
export function itemQuality(state: GameState, item: MenuItem): number {
  const grinder = workingEquipment(state, 'grinder');
  const grinderBonus = grinder ? equipmentType(grinder.typeId).quality : 0;
  let base: number;
  switch (item.category) {
    case 'espresso': {
      const machine = workingEquipment(state, 'espresso');
      base = 0.6 + 0.2 * (machine ? equipmentType(machine.typeId).quality : 1);
      break;
    }
    case 'drip':
      base = 0.9;
      break;
    case 'coldbrew':
      base = 1.0;
      break;
    case 'pastry':
      return 1.0;
  }
  return Math.max(0.5, base + grinderBonus - activeModifier(state, 'qualityPenalty', 0));
}

export function isWorking(staff: Staff, hour: number): boolean {
  const training = staff.trainingUntilHour !== null && staff.trainingUntilHour > hour;
  const sick = staff.sickUntilHour !== null && staff.sickUntilHour > hour;
  return !training && !sick;
}

export const baristaRate = (s: Staff): number => (12 + 2.5 * s.skill) * (0.7 + (0.4 * s.morale) / 100);

export function serviceCapacity(state: GameState): number {
  const staffCap = state.staff.filter((s) => isWorking(s, state.hour)).reduce((sum, s) => sum + baristaRate(s), 0);
  const register = workingEquipment(state, 'register');
  const registerCap = register ? equipmentType(register.typeId).capacity : 0;
  return Math.min(staffCap, registerCap);
}

export interface Readiness {
  register: boolean;
  drinkMachine: boolean;
  barista: boolean;
  menu: boolean;
  ready: boolean;
}

export function readiness(state: GameState): Readiness {
  const register = workingEquipment(state, 'register') !== undefined;
  const drinkMachine = MENU.some((m) => m.category !== 'pastry' && itemAvailable(state, m));
  const barista = state.staff.some((s) => isWorking(s, state.hour));
  const menu = MENU.some((m) => m.category !== 'pastry' && state.store.menu[m.id]?.enabled && itemAvailable(state, m));
  return { register, drinkMachine, barista, menu, ready: register && drinkMachine && barista && menu };
}

// Weighted like satisfaction: product matters most, then price and service, then the room.
export function starRating(state: GameState): number {
  const r = state.store.ratings;
  return 1 + 4 * (0.3 * r.product + 0.25 * r.price + 0.25 * r.service + 0.2 * r.atmosphere);
}

export const ratingStars = (rating: number): number => 1 + 4 * rating;

export const bookValue = (e: Equipment): Cents => e.cost - e.depreciated;

export function disposeEquipment(state: GameState, e: Equipment, memo: string): Cents {
  const book = bookValue(e);
  const sale = Math.round(book * RESALE_RATE);
  post(state, memo, 'investing', [
    ['cash', sale],
    ['accumDepreciation', e.depreciated],
    ['equipment', -e.cost],
    ['otherExpense', book - sale],
  ]);
  state.store.equipment = state.store.equipment.filter((x) => x.id !== e.id);
  return sale;
}

export const loanBalance = (state: GameState): Cents => -balances(state).loans;

export const loanLimit = (state: GameState): Cents =>
  dollars(30_000) + Math.max(0, Math.round(state.store.reputation - 30)) * dollars(1_000);

export const equipmentCount = (state: GameState, typeId: string): number =>
  state.store.equipment.filter((e) => e.typeId === typeId).length;

export const catalogFor = (category: EquipmentCategory) => EQUIPMENT.filter((e) => e.category === category);
