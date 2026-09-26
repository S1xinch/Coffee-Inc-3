import {
  CLOSE_HOUR,
  EQUIPMENT,
  MENU,
  MENU_CATEGORY_EQUIPMENT,
  OPEN_HOUR,
  LOAN_APR,
  REPAIR_RATE,
  RESALE_RATE,
  equipmentType,
  neighborhood,
  type EquipmentCategory,
  type MenuItem,
  type Neighborhood,
} from './catalog';
import { city, lot, type CityDef, type Lot } from './city';
import { deptLevel } from './hq';
import { MARKET_BEAN_QUALITY } from './plantations';
import { balances, post } from './ledger';
import { dollars, type Cents } from './money';
import type { Equipment, GameState, Modifier, Staff, Store } from './state';

export const isOpenHour = (hourOfDay: number): boolean => hourOfDay >= OPEN_HOUR && hourOfDay < CLOSE_HOUR;

export function storeById(state: GameState, id: string): Store | undefined {
  return state.stores.find((s) => s.id === id);
}

export const storeLot = (store: Store): Lot => lot(store.lotId);
export const storeCity = (store: Store): CityDef => city(storeLot(store).cityId);
export const storeDistrict = (store: Store): Neighborhood => neighborhood(storeLot(store).districtId);
export function lotRent(lotId: string): Cents {
  const l = lot(lotId);
  return Math.round((neighborhood(l.districtId).weeklyRent * l.rentMod) / 100) * 100;
}
export const weeklyRent = (store: Store): Cents => lotRent(store.lotId);
export const lotTraffic = (store: Store): number => storeDistrict(store).trafficPerHour * storeLot(store).trafficMod;

export function equipmentIn(store: Store, category: EquipmentCategory): Equipment | undefined {
  return store.equipment.find((e) => equipmentType(e.typeId).category === category);
}

export function workingEquipment(store: Store, category: EquipmentCategory): Equipment | undefined {
  const e = equipmentIn(store, category);
  return e && !e.broken ? e : undefined;
}

export function itemAvailable(store: Store, item: MenuItem): boolean {
  return workingEquipment(store, MENU_CATEGORY_EQUIPMENT[item.category]) !== undefined;
}

export function ambiancePoints(store: Store): number {
  return store.equipment.reduce((sum, e) => sum + equipmentType(e.typeId).ambiance, 0);
}

export const ambianceMultiplier = (store: Store): number => 0.85 + Math.min(ambiancePoints(store), 16) * 0.025;

function activeModifier(state: GameState, store: Store, kind: Modifier['kind'], neutral: number): number {
  return state.modifiers
    .filter((m) => m.storeId === store.id && m.kind === kind && m.untilHour > state.hour)
    .reduce((acc, m) => (kind === 'qualityPenalty' ? acc + m.value : acc * m.value), neutral);
}

export const supplierCostMultiplier = (state: GameState, store: Store): number => activeModifier(state, store, 'supplierCost', 1);
export const trafficBoost = (state: GameState, store: Store): number => activeModifier(state, store, 'trafficBoost', 1);

// Roughly 0.8 (entry level) to 1.4 (best machine and grinder).
export function itemQuality(state: GameState, store: Store, item: MenuItem): number {
  const grinder = workingEquipment(store, 'grinder');
  const grinderBonus = grinder ? equipmentType(grinder.typeId).quality : 0;
  let base: number;
  switch (item.category) {
    case 'espresso': {
      const machine = workingEquipment(store, 'espresso');
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
  return Math.max(0.5, (base + grinderBonus - activeModifier(state, store, 'qualityPenalty', 0)) * beanQualityFactor(state));
}

// Beans from your own farms are used first; better beans than the market average make better coffee.
export function beanQualityFactor(state: GameState): number {
  return state.beans.kg >= 1 ? 1 + (state.beans.quality - MARKET_BEAN_QUALITY) * 0.6 : 1;
}

export function isWorking(staff: Staff, hour: number): boolean {
  const training = staff.trainingUntilHour !== null && staff.trainingUntilHour > hour;
  const sick = staff.sickUntilHour !== null && staff.sickUntilHour > hour;
  return !training && !sick;
}

export const baristaRate = (s: Staff): number => (12 + 2.5 * s.skill) * (0.7 + (0.4 * s.morale) / 100);

export function serviceCapacity(state: GameState, store: Store): number {
  const staffCap = store.staff.filter((s) => isWorking(s, state.hour)).reduce((sum, s) => sum + baristaRate(s), 0);
  const register = workingEquipment(store, 'register');
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

export function readiness(state: GameState, store: Store): Readiness {
  const register = workingEquipment(store, 'register') !== undefined;
  const drinkMachine = MENU.some((m) => m.category !== 'pastry' && itemAvailable(store, m));
  const barista = store.staff.some((s) => isWorking(s, state.hour));
  const menu = MENU.some((m) => m.category !== 'pastry' && store.menu[m.id]?.enabled && itemAvailable(store, m));
  return { register, drinkMachine, barista, menu, ready: register && drinkMachine && barista && menu };
}

// Weighted like satisfaction: product matters most, then price and service, then the room.
export function starRating(store: Store): number {
  const r = store.ratings;
  return 1 + 4 * (0.3 * r.product + 0.25 * r.price + 0.25 * r.service + 0.2 * r.atmosphere);
}

export const ratingStars = (rating: number): number => 1 + 4 * rating;

export const bookValue = (e: Equipment): Cents => e.cost - e.depreciated;

export function disposeEquipment(state: GameState, store: Store, e: Equipment, memo: string): Cents {
  const book = bookValue(e);
  const sale = Math.round(book * RESALE_RATE);
  post(
    state,
    memo,
    'investing',
    [
      ['cash', sale],
      ['accumDepreciation', e.depreciated],
      ['equipment', -e.cost],
      ['otherExpense', book - sale],
    ],
    store.id,
  );
  store.equipment = store.equipment.filter((x) => x.id !== e.id);
  delete store.layout[e.id];
  return sale;
}

export const loanBalance = (state: GameState): Cents => -balances(state).loans;

export const averageReputation = (state: GameState): number =>
  state.stores.reduce((sum, s) => sum + s.reputation, 0) / Math.max(1, state.stores.length);

// The bank lends more to bigger, better-known companies, and a Finance department gets better terms.
export const loanLimit = (state: GameState): Cents =>
  Math.round(
    (dollars(30_000) + Math.max(0, Math.round(averageReputation(state) - 30)) * dollars(1_000) + (state.stores.length - 1) * dollars(15_000)) *
      (1 + 0.15 * deptLevel(state, 'finance')),
  );

export const loanApr = (state: GameState): number => Math.max(0.02, LOAN_APR - 0.015 * deptLevel(state, 'finance'));

export const repairCost = (state: GameState, typeId: string): Cents =>
  Math.round(equipmentType(typeId).cost * REPAIR_RATE * (1 - 0.15 * deptLevel(state, 'engineering')));

// What a barista asks for in this store's city.
export const cityWage = (store: Store, askingWage: Cents): Cents => Math.round(askingWage * storeCity(store).rules.wageMultiplier);

export const equipmentCount = (store: Store, typeId: string): number => store.equipment.filter((e) => e.typeId === typeId).length;

export const catalogFor = (category: EquipmentCategory) => EQUIPMENT.filter((e) => e.category === category);
