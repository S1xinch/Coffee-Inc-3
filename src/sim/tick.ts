import { BANKRUPTCY_GRACE_WEEKS, HOURS_PER_WEEK, LOAN_APR, REPORTS_KEPT, UTILITIES_PER_OPEN_DAY, equipmentType } from './catalog';
import { simulateHourSales } from './demand';
import { autoResolveOverdue, maybeRollIncident } from './incidents';
import { balanceSheet, cashFlow, foldJournal, incomeStatement, post, storeEntries } from './ledger';
import { addLog } from './log';
import { managerMorning } from './manager';
import { marketingAtmosphere, marketingBuzz, perCupCost, weeklyMarketingCost } from './marketing';
import { formatMoney } from './money';
import { rivalWeek } from './rival';
import { ambianceMultiplier, averageReputation, isOpenHour, loanBalance, readiness, weeklyRent } from './store';
import { refreshCandidates, updateMoraleAndQuits } from './staff';
import { emptyDayStats, type GameState, type Store } from './state';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function startOfHour(state: GameState): void {
  state.modifiers = state.modifiers.filter((m) => m.untilHour > state.hour);
  for (const store of state.stores) {
    for (const s of store.staff) {
      if (s.trainingUntilHour !== null && s.trainingUntilHour <= state.hour) {
        s.trainingUntilHour = null;
        s.skill = Math.min(10, s.skill + 1);
        addLog(state, 'good', `${s.name} finished training. Skill is now ${s.skill}.`);
      }
      if (s.sickUntilHour !== null && s.sickUntilHour <= state.hour) s.sickUntilHour = null;
    }
  }
  autoResolveOverdue(state);
  if (state.hour % 24 === 6) {
    for (const store of state.stores) {
      managerMorning(state, store);
      maybeRollIncident(state, store);
    }
  }
}

function runOpenHour(state: GameState, store: Store): void {
  const today = store.today;
  today.openHours += 1;
  today.wagesAccrued += store.staff.reduce((sum, s) => sum + s.wage, 0);
  if (!readiness(state, store).ready) {
    store.lastHour = { hour: state.hour, demand: 0, served: 0, revenue: 0 };
    return;
  }
  const sales = simulateHourSales(state, store);
  post(
    state,
    'Sales',
    'operating',
    [
      ['cash', sales.revenue - sales.cogs],
      ['salesRevenue', -sales.revenue],
      ['cogs', sales.cogs],
    ],
    store.id,
  );
  today.served += sales.served;
  today.lost += sales.lost;
  today.revenue += sales.revenue;
  today.cogs += sales.cogs;
  today.marketingAccrued += sales.served * perCupCost(store);
  today.qualitySum += sales.qualitySum;
  today.priceRatioSum += sales.priceRatioSum;
  today.capacitySum += sales.capacity;
  store.week.served += sales.served;
  store.week.lost += sales.lost;
  state.lifetime.served += sales.served;
  state.lifetime.revenue += sales.revenue;
  store.lastHour = { hour: state.hour, demand: sales.demand, served: sales.served, revenue: sales.revenue };
}

function endOfDayStore(state: GameState, store: Store): void {
  const day = store.today;
  day.marketingAccrued += Math.round(weeklyMarketingCost(store) / 7);
  if (day.marketingAccrued > 0) post(state, 'Marketing', 'operating', [['marketing', day.marketingAccrued], ['cash', -day.marketingAccrued]], store.id);
  if (day.wagesAccrued > 0) post(state, 'Wages', 'operating', [['wages', day.wagesAccrued], ['cash', -day.wagesAccrued]], store.id);
  if (day.openHours > 0) {
    post(state, 'Utilities', 'operating', [['utilities', UTILITIES_PER_OPEN_DAY], ['cash', -UTILITIES_PER_OPEN_DAY]], store.id);
  }

  const visitors = day.served + day.lost;
  if (visitors > 0) {
    const qualityN = day.served > 0 ? clamp01((day.qualitySum / day.served - 0.8) / 0.5) : 0;
    const priceN = day.served > 0 ? clamp01((day.priceRatioSum / day.served - 0.5) / 0.7) : 0;
    const serviceN = clamp01(1 - (day.lost / visitors) * 1.5);
    const ambianceN = clamp01((ambianceMultiplier(store) - 0.85) / 0.4 + marketingAtmosphere(store));
    const satisfaction = 100 * (0.3 * qualityN + 0.25 * priceN + 0.25 * serviceN + 0.2 * ambianceN);
    store.satisfaction = Math.round(satisfaction * 10) / 10;
    const r = store.ratings;
    const drift = (current: number, today: number) => Math.round((current + (today - current) * 0.25) * 1000) / 1000;
    r.product = drift(r.product, qualityN);
    r.price = drift(r.price, priceN);
    r.service = drift(r.service, serviceN);
    r.atmosphere = drift(r.atmosphere, ambianceN);
    store.reviews += Math.round(day.served * 0.02);
    const volume = Math.min(1, day.served / 150);
    const rep = store.reputation + (satisfaction - store.reputation) * 0.08 * volume;
    store.reputation = Math.round(Math.min(100, Math.max(0, rep)) * 100) / 100;
  }
  store.reputation = Math.min(100, Math.round((store.reputation + marketingBuzz(store)) * 100) / 100);

  updateMoraleAndQuits(state, store, day.capacitySum > 0 ? day.served / day.capacitySum : 0);
  store.yesterday = day;
  store.today = emptyDayStats();
}

function closeWeek(state: GameState): void {
  const weekNumber = state.hour / HOURS_PER_WEEK;
  for (const store of state.stores) {
    const rent = weeklyRent(store);
    post(state, 'Rent', 'operating', [['rent', rent], ['cash', -rent]], store.id);
    if (store.manager) post(state, `Salary for ${store.manager.name}`, 'operating', [['wages', store.manager.salary], ['cash', -store.manager.salary]], store.id);
    let depreciation = 0;
    for (const e of store.equipment) {
      const weekly = Math.round(e.cost / equipmentType(e.typeId).lifeWeeks);
      const d = Math.min(weekly, e.cost - e.depreciated);
      e.depreciated += d;
      depreciation += d;
    }
    post(state, 'Depreciation', 'operating', [['depreciation', depreciation], ['accumDepreciation', -depreciation]], store.id);
  }

  const interest = Math.round((loanBalance(state) * LOAN_APR) / 52);
  post(state, 'Loan interest', 'operating', [['interest', interest], ['cash', -interest]]);

  const income = incomeStatement(state.ledger.journal);
  const balance = balanceSheet(state);
  const stores = state.stores.map((s) => {
    const own = incomeStatement(storeEntries(state.ledger.journal, s.id));
    return { storeId: s.id, lotId: s.lotId, revenue: own.revenue, netIncome: own.netIncome, served: s.week.served, lost: s.week.lost, reputation: s.reputation };
  });
  state.reports.push({
    week: weekNumber,
    income,
    balance,
    cashFlow: cashFlow(state.ledger.journal, state.ledger.weekOpeningCash),
    customersServed: stores.reduce((sum, s) => sum + s.served, 0),
    customersLost: stores.reduce((sum, s) => sum + s.lost, 0),
    reputation: Math.round(averageReputation(state) * 100) / 100,
    stores,
  });
  if (state.reports.length > REPORTS_KEPT) state.reports.splice(0, state.reports.length - REPORTS_KEPT);
  for (const s of state.stores) s.week = { served: 0, lost: 0 };

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
  rivalWeek(state, weekNumber);
  foldJournal(state);
  refreshCandidates(state);
}

export function stepHour(state: GameState): void {
  if (state.bankrupt) return;
  startOfHour(state);
  if (isOpenHour(state.hour % 24)) for (const store of state.stores) if (store.open) runOpenHour(state, store);
  state.hour += 1;
  if (state.hour % 24 === 0) for (const store of state.stores) endOfDayStore(state, store);
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
