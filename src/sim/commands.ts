import {
  LEASE_SIGNING_WEEKS,
  LOAN_STEP,
  MAX_PRICE,
  MAX_STAFF,
  MIN_PRICE,
  RAISE_STEP,
  RECRUITING_COST,
  REPAIR_RATE,
  RESALE_RATE,
  SINGLE_UNIT_CATEGORIES,
  TRAINING_COST,
  TRAINING_HOURS,
  equipmentType,
  menuItem,
} from './catalog';
import { lot } from './city';
import { createStore } from './game';
import { applyIncidentOption, incidentDef } from './incidents';
import { isFloorCell, isPlaceable, layoutHasRoom, normalizeLayout, occupant } from './layout';
import { campaign } from './marketing';
import { cashBalance, post } from './ledger';
import { addLog } from './log';
import { newManager } from './manager';
import { formatMoney } from './money';
import { lotTaken } from './rival';
import { newId } from './rng';
import { bookValue, disposeEquipment, equipmentCount, equipmentIn, loanBalance, loanLimit, storeById, weeklyRent } from './store';
import { refreshCandidates } from './staff';
import type { GameState, Store } from './state';

export type StoreCommand =
  | { type: 'buyEquipment'; typeId: string }
  | { type: 'sellEquipment'; equipmentId: string }
  | { type: 'repairEquipment'; equipmentId: string }
  | { type: 'moveItem'; equipmentId: string; x: number; y: number }
  | { type: 'setMenuItem'; itemId: string; enabled?: boolean; price?: number }
  | { type: 'hireStaff'; candidateId: string }
  | { type: 'fireStaff'; staffId: string }
  | { type: 'trainStaff'; staffId: string }
  | { type: 'giveRaise'; staffId: string }
  | { type: 'hireManager' }
  | { type: 'fireManager' }
  | { type: 'setStoreOpen'; open: boolean }
  | { type: 'setCampaign'; campaignId: string; level: number }
  | { type: 'closeStore' };

export type Command =
  | (StoreCommand & { storeId: string })
  | { type: 'leaseLot'; lotId: string }
  | { type: 'refreshCandidates' }
  | { type: 'resolveIncident'; incidentId: string; option: number }
  | { type: 'takeLoan'; amount: number }
  | { type: 'repayLoan'; amount: number }
  | { type: 'ackReport'; week: number };

export interface CommandResult {
  state: GameState;
  error?: string;
}

class CommandError extends Error {}

const fail = (message: string): never => {
  throw new CommandError(message);
};

function requireCash(state: GameState, amount: number): void {
  if (cashBalance(state) < amount) fail(`Not enough cash. You need ${formatMoney(amount)}.`);
}

function runStore(state: GameState, store: Store, cmd: StoreCommand): void {
  switch (cmd.type) {
    case 'buyEquipment': {
      const type = equipmentType(cmd.typeId);
      let tradeIn = 0;
      const existing = SINGLE_UNIT_CATEGORIES.includes(type.category) ? equipmentIn(store, type.category) : undefined;
      if (existing) {
        if (equipmentType(existing.typeId).cost >= type.cost) fail('You already have this or a better model.');
        tradeIn = Math.round(bookValue(existing) * RESALE_RATE);
      } else if (equipmentCount(store, type.id) >= type.max) {
        fail(`The store has room for ${type.max} of these.`);
      }
      if (isPlaceable(type.id) && !layoutHasRoom(store)) fail('There is no free floor space left. Sell or move something first.');
      requireCash(state, type.cost - tradeIn);
      if (existing) disposeEquipment(state, store, existing, `Trade-in: ${equipmentType(existing.typeId).name}`);
      post(state, `Bought ${type.name}`, 'investing', [['equipment', type.cost], ['cash', -type.cost]], store.id);
      store.equipment.push({ id: newId(state, 'e'), typeId: type.id, cost: type.cost, depreciated: 0, broken: false });
      normalizeLayout(store);
      addLog(state, 'info', `Installed a ${type.name}.`);
      return;
    }
    case 'sellEquipment': {
      const e = store.equipment.find((x) => x.id === cmd.equipmentId) ?? fail('That item is no longer in the store.');
      const sale = disposeEquipment(state, store, e, `Sold ${equipmentType(e.typeId).name}`);
      addLog(state, 'info', `Sold the ${equipmentType(e.typeId).name} for ${formatMoney(sale)}.`);
      return;
    }
    case 'repairEquipment': {
      const e = store.equipment.find((x) => x.id === cmd.equipmentId) ?? fail('That item is no longer in the store.');
      if (!e.broken) fail('That item is not broken.');
      const cost = Math.round(equipmentType(e.typeId).cost * REPAIR_RATE);
      requireCash(state, cost);
      post(state, `Repaired ${equipmentType(e.typeId).name}`, 'operating', [['repairs', cost], ['cash', -cost]], store.id);
      e.broken = false;
      addLog(state, 'good', `The ${equipmentType(e.typeId).name} is working again.`);
      return;
    }
    case 'moveItem': {
      if (!store.layout[cmd.equipmentId]) fail('Only tables, chairs, and plants can be moved.');
      const target = { x: cmd.x, y: cmd.y };
      if (!isFloorCell(target)) fail('That spot needs to stay clear for customers.');
      const other = occupant(store, target);
      const from = store.layout[cmd.equipmentId]!;
      if (other && other !== cmd.equipmentId) store.layout[other] = { ...from };
      store.layout[cmd.equipmentId] = target;
      return;
    }
    case 'setMenuItem': {
      menuItem(cmd.itemId);
      const entry = store.menu[cmd.itemId] ?? fail('Unknown menu item.');
      if (cmd.enabled !== undefined) entry.enabled = cmd.enabled;
      if (cmd.price !== undefined) {
        if (!Number.isFinite(cmd.price)) fail('Price must be a number.');
        entry.price = Math.min(MAX_PRICE, Math.max(MIN_PRICE, Math.round(cmd.price / 5) * 5));
      }
      return;
    }
    case 'hireStaff': {
      if (store.staff.length >= MAX_STAFF) fail(`There is only room behind the counter for ${MAX_STAFF} baristas.`);
      const c = state.candidates.find((x) => x.id === cmd.candidateId) ?? fail('That candidate took another job.');
      state.candidates = state.candidates.filter((x) => x.id !== c.id);
      store.staff.push({
        id: newId(state, 's'),
        name: c.name,
        skill: c.skill,
        wage: c.askingWage,
        morale: 70,
        hiredHour: state.hour,
        trainingUntilHour: null,
        sickUntilHour: null,
        look: c.look,
      });
      addLog(state, 'good', `Hired ${c.name}.`);
      return;
    }
    case 'fireStaff': {
      const s = store.staff.find((x) => x.id === cmd.staffId) ?? fail('That person no longer works here.');
      store.staff = store.staff.filter((x) => x.id !== s.id);
      for (const other of store.staff) other.morale = Math.max(0, other.morale - 4);
      addLog(state, 'info', `Let ${s.name} go.`);
      return;
    }
    case 'trainStaff': {
      const s = store.staff.find((x) => x.id === cmd.staffId) ?? fail('That person no longer works here.');
      if (s.skill >= 10) fail(`${s.name} is already at the top skill level.`);
      if (s.trainingUntilHour !== null) fail(`${s.name} is already in training.`);
      requireCash(state, TRAINING_COST);
      post(state, `Training for ${s.name}`, 'operating', [['training', TRAINING_COST], ['cash', -TRAINING_COST]], store.id);
      s.trainingUntilHour = state.hour + TRAINING_HOURS;
      s.morale = Math.min(100, s.morale + 5);
      addLog(state, 'info', `${s.name} started a barista course.`);
      return;
    }
    case 'giveRaise': {
      const s = store.staff.find((x) => x.id === cmd.staffId) ?? fail('That person no longer works here.');
      s.wage += RAISE_STEP;
      s.morale = Math.min(100, s.morale + 8);
      addLog(state, 'good', `${s.name} got a raise to ${formatMoney(s.wage, true)}/h.`);
      return;
    }
    case 'hireManager': {
      if (store.manager) fail('This store already has a manager.');
      store.manager = newManager(state);
      addLog(state, 'good', `${store.manager.name} is now managing the store at ${lot(store.lotId).address}.`);
      return;
    }
    case 'fireManager': {
      const m = store.manager ?? fail('This store has no manager.');
      store.manager = null;
      addLog(state, 'info', `Let ${m.name} go. You run this store yourself now.`);
      return;
    }
    case 'setStoreOpen': {
      store.open = cmd.open;
      addLog(state, 'info', cmd.open ? 'The store is open for business.' : 'The store is closed. Staff are not paid while closed.');
      return;
    }
    case 'setCampaign': {
      const c = campaign(cmd.campaignId);
      const next = c.levels[cmd.level] ?? fail('Unknown campaign level.');
      store.marketing[c.id] = cmd.level;
      addLog(state, 'info', cmd.level === 0 ? `Stopped ${c.name}.` : `${c.name}: ${next.label}.`);
      return;
    }
    case 'closeStore': {
      if (state.stores.length === 1) fail('You cannot close your only store.');
      for (const e of [...store.equipment]) disposeEquipment(state, store, e, `Closing sale: ${equipmentType(e.typeId).name}`);
      state.stores = state.stores.filter((s) => s.id !== store.id);
      state.incidents = state.incidents.filter((i) => i.storeId !== store.id);
      state.modifiers = state.modifiers.filter((m) => m.storeId !== store.id);
      addLog(state, 'info', `Closed the store at ${lot(store.lotId).address}. The equipment was sold.`);
      return;
    }
  }
}

function run(state: GameState, cmd: Command): void {
  if ('storeId' in cmd) {
    const store = storeById(state, cmd.storeId) ?? fail('That store has closed.');
    runStore(state, store, cmd);
    return;
  }
  switch (cmd.type) {
    case 'leaseLot': {
      const target = lot(cmd.lotId);
      if (lotTaken(state, target.id)) fail('Someone already has that lot.');
      const store = createStore(state, target.id);
      const fee = weeklyRent(store) * LEASE_SIGNING_WEEKS;
      requireCash(state, fee);
      post(state, `Lease signing at ${target.address}`, 'operating', [['rent', fee], ['cash', -fee]], store.id);
      state.stores.push(store);
      addLog(state, 'good', `Signed a lease at ${target.address}. Time to furnish it.`);
      return;
    }
    case 'refreshCandidates': {
      requireCash(state, RECRUITING_COST);
      post(state, 'Recruiting ad', 'operating', [['otherExpense', RECRUITING_COST], ['cash', -RECRUITING_COST]]);
      refreshCandidates(state);
      return;
    }
    case 'resolveIncident': {
      const incident = state.incidents.find((i) => i.id === cmd.incidentId) ?? fail('That situation already sorted itself out.');
      const option = incidentDef(incident.defId).options[cmd.option] ?? fail('Unknown choice.');
      requireCash(state, option.cost);
      applyIncidentOption(state, incident, cmd.option);
      return;
    }
    case 'takeLoan': {
      if (!Number.isSafeInteger(cmd.amount) || cmd.amount <= 0 || cmd.amount % LOAN_STEP !== 0) {
        fail(`Loans come in steps of ${formatMoney(LOAN_STEP)}.`);
      }
      if (loanBalance(state) + cmd.amount > loanLimit(state)) fail(`The bank will lend up to ${formatMoney(loanLimit(state))} in total.`);
      post(state, 'Bank loan', 'financing', [['cash', cmd.amount], ['loans', -cmd.amount]]);
      addLog(state, 'info', `Borrowed ${formatMoney(cmd.amount)} from the bank.`);
      return;
    }
    case 'repayLoan': {
      const amount = Math.min(cmd.amount, loanBalance(state));
      if (!Number.isSafeInteger(amount) || amount <= 0) fail('There is nothing to repay.');
      requireCash(state, amount);
      post(state, 'Loan repayment', 'financing', [['loans', amount], ['cash', -amount]]);
      addLog(state, 'good', `Repaid ${formatMoney(amount)} of the loan.`);
      return;
    }
    case 'ackReport': {
      state.lastSeenReportWeek = Math.max(state.lastSeenReportWeek, cmd.week);
      return;
    }
  }
}

// Commands run on a copy, so a rejected command can never leave the game half-changed.
export function applyCommand(state: GameState, cmd: Command): CommandResult {
  if (state.bankrupt && cmd.type !== 'ackReport') return { state, error: 'The company is bankrupt.' };
  const next = structuredClone(state);
  try {
    run(next, cmd);
    return { state: next };
  } catch (err) {
    if (err instanceof CommandError) return { state, error: err.message };
    throw err;
  }
}
