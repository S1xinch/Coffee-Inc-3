import { FIRST_NAMES, LAST_NAMES, MANAGER_SALARY, MAX_STAFF, RECRUITING_COST, equipmentType } from './catalog';
import { cashBalance, post } from './ledger';
import { addLog } from './log';
import { newId, pick, randomInt } from './rng';
import { baristaRate, cityWage, readiness, repairCost } from './store';
import { refreshCandidates } from './staff';
import type { GameState, Manager, Store } from './state';

export type ManagerState = 'operating' | 'hiring' | 'repairing' | 'needsAttention';

export interface ManagerStatus {
  state: ManagerState;
  note: string;
}

const CASH_BUFFER = 50_000;

export function newManager(state: GameState): Manager {
  return {
    name: `${pick(state, FIRST_NAMES)} ${pick(state, LAST_NAMES)}`,
    look: randomInt(state, 0, 999),
    salary: MANAGER_SALARY,
    hiredHour: state.hour,
    lastAction: null,
    lastActionHour: null,
  };
}

// How many baristas yesterday's crowd needed, with some headroom for the morning rush.
export function staffTarget(store: Store): number {
  const y = store.yesterday;
  if (!y || y.openHours === 0) return 2;
  const perHour = (y.served + y.lost) / y.openHours;
  const avgRate = store.staff.length > 0 ? store.staff.reduce((s, p) => s + baristaRate(p), 0) / store.staff.length : 20;
  return Math.min(MAX_STAFF, Math.max(1, Math.ceil((perHour * 1.4) / avgRate)));
}

// Each morning the manager fixes what it can: repairs, then staffing. Everything it does is logged.
export function managerMorning(state: GameState, store: Store): void {
  const m = store.manager;
  if (!m) return;
  const actions: string[] = [];

  for (const e of store.equipment.filter((x) => x.broken)) {
    const t = equipmentType(e.typeId);
    const cost = repairCost(state, e.typeId);
    if (cashBalance(state) < cost + CASH_BUFFER) continue;
    post(state, `Repaired ${t.name}`, 'operating', [['repairs', cost], ['cash', -cost]], store.id);
    e.broken = false;
    actions.push(`repaired the ${t.name}`);
  }

  const target = staffTarget(store);
  if (store.staff.length < target && state.candidates.length === 0 && cashBalance(state) > RECRUITING_COST + CASH_BUFFER) {
    post(state, 'Recruiting ad', 'operating', [['otherExpense', RECRUITING_COST], ['cash', -RECRUITING_COST]], store.id);
    refreshCandidates(state);
  }
  while (store.staff.length < target && state.candidates.length > 0) {
    const best = [...state.candidates].sort((a, b) => b.skill - a.skill || a.askingWage - b.askingWage)[0]!;
    state.candidates = state.candidates.filter((c) => c.id !== best.id);
    store.staff.push({
      id: newId(state, 's'),
      name: best.name,
      skill: best.skill,
      wage: cityWage(store, best.askingWage),
      morale: 70,
      hiredHour: state.hour,
      trainingUntilHour: null,
      sickUntilHour: null,
      look: best.look,
    });
    actions.push(`hired ${best.name}`);
  }

  if (actions.length > 0) {
    const text = actions.join(', ');
    m.lastAction = text.charAt(0).toUpperCase() + text.slice(1);
    m.lastActionHour = state.hour;
    addLog(state, 'info', `${m.name}: ${text}.`);
  }
}

// Status is worked out from the store as it is right now, so a manager can never sit in a stale state.
export function managerStatus(state: GameState, store: Store): ManagerStatus | null {
  const m = store.manager;
  if (!m) return null;
  const ready = readiness(state, store);
  if (!ready.register) return { state: 'needsAttention', note: 'We need a cash register. Managers cannot buy equipment.' };
  const broken = store.equipment.find((e) => e.broken);
  if (broken && cashBalance(state) < repairCost(state, broken.typeId) + CASH_BUFFER) {
    return { state: 'needsAttention', note: `The ${equipmentType(broken.typeId).name} is broken and cash is too tight for me to fix it.` };
  }
  if (broken) return { state: 'repairing', note: `I'll get the ${equipmentType(broken.typeId).name} repaired first thing tomorrow.` };
  if (!ready.drinkMachine) return { state: 'needsAttention', note: 'We need an espresso machine or a brewer. Managers cannot buy equipment.' };
  if (store.staff.length === 0 && state.candidates.length === 0) return { state: 'needsAttention', note: 'Nobody works here and there are no applicants.' };
  if (store.staff.length < staffTarget(store)) return { state: 'hiring', note: 'I will hire more baristas tomorrow morning.' };
  if (cashBalance(state) < 0) return { state: 'needsAttention', note: 'The company is out of cash. I cannot pay for anything.' };
  if (m.lastAction && m.lastActionHour !== null && state.hour - m.lastActionHour < 24) return { state: 'operating', note: `${m.lastAction} this morning.` };
  return { state: 'operating', note: 'Everything is running smoothly.' };
}
