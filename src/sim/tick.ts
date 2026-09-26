import {
  BANKRUPTCY_GRACE_WEEKS,
  HOURS_PER_WEEK,
  LOAN_APR,
  REPORTS_KEPT,
  UTILITIES_PER_OPEN_DAY,
  equipmentType,
  neighborhood,
} from './catalog';
import { simulateHourSales } from './demand';
import { autoResolveOverdue, maybeRollIncident } from './incidents';
import { balanceSheet, cashFlow, foldJournal, incomeStatement, post } from './ledger';
import { addLog } from './log';
import { formatMoney } from './money';
import { ambianceMultiplier, isOpenHour, loanBalance, readiness } from './store';
import { refreshCandidates, updateMoraleAndQuits } from './staff';
import { emptyDayStats, type GameState } from './state';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function startOfHour(state: GameState): void {
  state.modifiers = state.modifiers.filter((m) => m.untilHour > state.hour);
  for (const s of state.staff) {
    if (s.trainingUntilHour !== null && s.trainingUntilHour <= state.hour) {
      s.trainingUntilHour = null;
      s.skill = Math.min(10, s.skill + 1);
      addLog(state, 'good', `${s.name} finished training. Skill is now ${s.skill}.`);
    }
    if (s.sickUntilHour !== null && s.sickUntilHour <= state.hour) s.sickUntilHour = null;
  }
  autoResolveOverdue(state);
  if (state.hour % 24 === 6) maybeRollIncident(state);
}

function runOpenHour(state: GameState): void {
  const today = state.today;
  today.openHours += 1;
  today.wagesAccrued += state.staff.reduce((sum, s) => sum + s.wage, 0);
  if (!readiness(state).ready) {
    state.lastHour = { hour: state.hour, demand: 0, served: 0, revenue: 0 };
    return;
  }
  const sales = simulateHourSales(state);
  post(state, 'Sales', 'operating', [
    ['cash', sales.revenue - sales.cogs],
    ['salesRevenue', -sales.revenue],
    ['cogs', sales.cogs],
  ]);
  today.served += sales.served;
  today.lost += sales.lost;
  today.revenue += sales.revenue;
  today.cogs += sales.cogs;
  today.qualitySum += sales.qualitySum;
  today.priceRatioSum += sales.priceRatioSum;
  today.capacitySum += sales.capacity;
  state.week.served += sales.served;
  state.week.lost += sales.lost;
  state.lifetime.served += sales.served;
  state.lifetime.revenue += sales.revenue;
  state.lastHour = { hour: state.hour, demand: sales.demand, served: sales.served, revenue: sales.revenue };
}

function endOfDay(state: GameState): void {
  const day = state.today;
  if (day.wagesAccrued > 0) post(state, 'Wages', 'operating', [['wages', day.wagesAccrued], ['cash', -day.wagesAccrued]]);
  if (day.openHours > 0) {
    post(state, 'Utilities', 'operating', [['utilities', UTILITIES_PER_OPEN_DAY], ['cash', -UTILITIES_PER_OPEN_DAY]]);
  }

  const visitors = day.served + day.lost;
  if (visitors > 0) {
    const qualityN = day.served > 0 ? clamp01((day.qualitySum / day.served - 0.8) / 0.5) : 0;
    const priceN = day.served > 0 ? clamp01((day.priceRatioSum / day.served - 0.5) / 0.7) : 0;
    const serviceN = clamp01(1 - (day.lost / visitors) * 1.5);
    const ambianceN = clamp01((ambianceMultiplier(state) - 0.85) / 0.4);
    const satisfaction = 100 * (0.3 * qualityN + 0.25 * priceN + 0.25 * serviceN + 0.2 * ambianceN);
    state.store.satisfaction = Math.round(satisfaction * 10) / 10;
    const volume = Math.min(1, day.served / 150);
    const rep = state.store.reputation + (satisfaction - state.store.reputation) * 0.08 * volume;
    state.store.reputation = Math.round(Math.min(100, Math.max(0, rep)) * 100) / 100;
  }

  updateMoraleAndQuits(state, day.capacitySum > 0 ? day.served / day.capacitySum : 0);
  state.yesterday = day;
  state.today = emptyDayStats();
}

function closeWeek(state: GameState): void {
  const weekNumber = state.hour / HOURS_PER_WEEK;
  const rent = neighborhood(state.neighborhoodId).weeklyRent;
  post(state, 'Rent', 'operating', [['rent', rent], ['cash', -rent]]);

  let depreciation = 0;
  for (const e of state.store.equipment) {
    const weekly = Math.round(e.cost / equipmentType(e.typeId).lifeWeeks);
    const d = Math.min(weekly, e.cost - e.depreciated);
    e.depreciated += d;
    depreciation += d;
  }
  post(state, 'Depreciation', 'operating', [['depreciation', depreciation], ['accumDepreciation', -depreciation]]);

  const interest = Math.round((loanBalance(state) * LOAN_APR) / 52);
  post(state, 'Loan interest', 'operating', [['interest', interest], ['cash', -interest]]);

  const income = incomeStatement(state.ledger.journal);
  const balance = balanceSheet(state);
  state.reports.push({
    week: weekNumber,
    income,
    balance,
    cashFlow: cashFlow(state.ledger.journal, state.ledger.weekOpeningCash),
    customersServed: state.week.served,
    customersLost: state.week.lost,
    reputation: state.store.reputation,
  });
  if (state.reports.length > REPORTS_KEPT) state.reports.splice(0, state.reports.length - REPORTS_KEPT);
  state.week = { served: 0, lost: 0 };

  // Insolvency is judged only on the ledger's cash, with a grace period before it is final.
  if (balance.cash < 0) {
    state.distressWeeks += 1;
    if (state.distressWeeks > BANKRUPTCY_GRACE_WEEKS) {
      state.bankrupt = true;
      addLog(state, 'bad', 'The company ran out of cash for too long and went bankrupt.');
    } else {
      const left = BANKRUPTCY_GRACE_WEEKS - state.distressWeeks + 1;
      addLog(state, 'bad', `Cash is negative (${formatMoney(balance.cash)}). Get back above $0 within ${left} week${left === 1 ? '' : 's'} or the company goes bankrupt.`);
    }
  } else if (state.distressWeeks > 0) {
    state.distressWeeks = 0;
    addLog(state, 'good', 'Cash is positive again. The bank is off your back.');
  }

  addLog(state, income.netIncome >= 0 ? 'good' : 'bad', `Week ${weekNumber} closed with net income of ${formatMoney(income.netIncome)}.`);
  foldJournal(state);
  refreshCandidates(state);
}

export function stepHour(state: GameState): void {
  if (state.bankrupt) return;
  startOfHour(state);
  if (state.store.open && isOpenHour(state.hour % 24)) runOpenHour(state);
  state.hour += 1;
  if (state.hour % 24 === 0) endOfDay(state);
  if (state.hour % HOURS_PER_WEEK === 0) closeWeek(state);
}

export function advanceHoursInPlace(state: GameState, hours: number): void {
  for (let i = 0; i < hours && !state.bankrupt; i++) stepHour(state);
}

export function advanceHours(state: GameState, hours: number): GameState {
  const next = structuredClone(state);
  advanceHoursInPlace(next, hours);
  return next;
}
