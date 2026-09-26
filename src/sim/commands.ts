import {
  LEASE_SIGNING_WEEKS,
  LOAN_STEP,
  MAX_PRICE,
  MAX_STAFF,
  MIN_PRICE,
  RAISE_STEP,
  RECRUITING_COST,
  RESALE_RATE,
  SINGLE_UNIT_CATEGORIES,
  TRAINING_COST,
  TRAINING_HOURS,
  equipmentType,
  menuItem,
} from './catalog';
import { city, lot } from './city';
import { createStore } from './game';
import { DEPARTMENTS, HQ_MIN_STORES, HQ_OPEN_COST, MAX_DEPARTMENT_LEVEL, canHireChief, department, newExecutive } from './hq';
import {
  IPO_FEE,
  OWNER_SALE_FEE,
  REAL_ESTATE_SALE_FEE,
  SPLIT_MIN_PRICE,
  fairSharePrice,
  ipoBlocker,
  ownerShares,
  propertyDef,
  propertyValue,
  shareCount,
  stockDef,
  toCents,
} from './markets';
import { FARMLAND_RESALE, MAX_PLOTS, MILL_COST, takeBeans } from './plantations';
import { REGIONS, regionById } from './regions';
import { applyIncidentOption, incidentDef } from './incidents';
import { isFloorCell, isPlaceable, layoutHasRoom, normalizeLayout, occupant } from './layout';
import { campaign } from './marketing';
import { cashBalance, post } from './ledger';
import { addLog } from './log';
import { newManager } from './manager';
import { formatMoney } from './money';
import { lotTaken } from './rival';
import { newId } from './rng';
import { bookValue, cityWage, disposeEquipment, equipmentCount, equipmentIn, loanBalance, loanLimit, repairCost, storeById, weeklyRent } from './store';
import { refreshCandidates } from './staff';
import { balanceSheet } from './ledger';
import type { DepartmentId, GameState, Store } from './state';

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
  | { type: 'ackReport'; week: number }
  | { type: 'unlockCity'; cityId: string }
  | { type: 'setPolitics'; on: boolean }
  | { type: 'openHq' }
  | { type: 'upgradeDepartment'; departmentId: DepartmentId }
  | { type: 'hireChief'; departmentId: DepartmentId }
  | { type: 'fireChief'; departmentId: DepartmentId }
  | { type: 'buyPlantation'; regionId: string }
  | { type: 'addPlot'; plantationId: string }
  | { type: 'buildMill'; plantationId: string }
  | { type: 'sellPlantation'; plantationId: string }
  | { type: 'sellBeans'; kg: number }
  | { type: 'buyStock'; symbol: string; shares: number }
  | { type: 'sellStock'; symbol: string; shares: number }
  | { type: 'buyProperty'; propertyId: string }
  | { type: 'sellProperty'; propertyId: string }
  | { type: 'ipo'; percent: number }
  | { type: 'splitShares' }
  | { type: 'payDividend'; perShare: number }
  | { type: 'sellOwnerShares'; percent: number }
  | { type: 'investPersonal'; amount: number };

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
      const cost = repairCost(state, e.typeId);
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
        wage: cityWage(store, c.askingWage),
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
      if (!state.cities.includes(target.cityId)) fail(`Unlock ${city(target.cityId).name} first.`);
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
    default:
      runCorporate(state, cmd);
  }
}

const positiveInt = (n: number, what: string) => {
  if (!Number.isSafeInteger(n) || n <= 0) fail(`${what} must be a whole number above zero.`);
};

function requireDept(state: GameState, id: DepartmentId, level: number): void {
  if (!state.hq.open) fail('Open headquarters first.');
  if (state.hq.departments[id] < level) fail(`Needs the ${department(id).name} department at level ${level}.`);
}

function runCorporate(state: GameState, cmd: Command): void {
  switch (cmd.type) {
    case 'unlockCity': {
      const c = city(cmd.cityId);
      if (state.cities.includes(c.id)) fail(`${c.name} is already unlocked.`);
      const unlock = c.unlock ?? fail(`${c.name} can't be unlocked.`);
      if (state.stores.length < unlock.minStores) fail(`Run at least ${unlock.minStores} stores before expanding to ${c.name}.`);
      requireCash(state, unlock.fee);
      post(state, `${c.name} expansion license`, 'operating', [['otherExpense', unlock.fee], ['cash', -unlock.fee]]);
      state.cities.push(c.id);
      addLog(state, 'good', `${state.companyName} can now open stores in ${c.name}.`);
      return;
    }
    case 'setPolitics': {
      state.settings.politics = cmd.on;
      addLog(state, 'info', cmd.on ? 'Local politics are on. Cities can fine your stores.' : 'Local politics are off. No city fines.');
      return;
    }
    case 'openHq': {
      if (state.hq.open) fail('Headquarters is already open.');
      if (state.stores.length < HQ_MIN_STORES) fail(`Run at least ${HQ_MIN_STORES} stores before opening headquarters.`);
      requireCash(state, HQ_OPEN_COST);
      post(state, 'Headquarters build-out', 'operating', [['otherExpense', HQ_OPEN_COST], ['cash', -HQ_OPEN_COST]]);
      state.hq.open = true;
      state.hq.openedHour = state.hour;
      addLog(state, 'good', 'Headquarters is open. Build departments to run the company at scale.');
      return;
    }
    case 'upgradeDepartment': {
      if (!state.hq.open) fail('Open headquarters first.');
      const d = DEPARTMENTS.find((x) => x.id === cmd.departmentId) ?? fail('Unknown department.');
      const current = state.hq.departments[d.id];
      if (current >= MAX_DEPARTMENT_LEVEL) fail(`${d.name} is at the top level.`);
      const cost = d.upgradeCost[current]!;
      requireCash(state, cost);
      post(state, `${d.name} department, level ${current + 1}`, 'operating', [['otherExpense', cost], ['cash', -cost]]);
      state.hq.departments[d.id] = current + 1;
      addLog(state, 'good', `${d.name} is now level ${current + 1}.`);
      return;
    }
    case 'hireChief': {
      const d = DEPARTMENTS.find((x) => x.id === cmd.departmentId) ?? fail('Unknown department.');
      const blocker = canHireChief(state, d.id);
      if (blocker) fail(blocker);
      const exec = newExecutive(state, d.id);
      state.hq.executives[d.id] = exec;
      addLog(state, 'good', `Hired ${exec.name} as ${d.chiefTitle}.`);
      return;
    }
    case 'fireChief': {
      const d = DEPARTMENTS.find((x) => x.id === cmd.departmentId) ?? fail('Unknown department.');
      const exec = state.hq.executives[d.id] ?? fail('That seat is empty.');
      state.hq.executives[d.id] = null;
      addLog(state, 'info', `${exec.name} has left the company.`);
      return;
    }
    case 'buyPlantation': {
      if (!state.hq.open) fail('Open headquarters first. Plantations are run from there.');
      const region = REGIONS.find((r) => r.id === cmd.regionId) ?? fail('That region is not available.');
      if (state.plantations.some((p) => p.regionId === region.id)) fail(`You already have a farm in ${region.name}. Add plots to it instead.`);
      requireCash(state, region.plotPrice);
      post(state, `Farmland in ${region.name}`, 'investing', [['farmland', region.plotPrice], ['cash', -region.plotPrice]]);
      state.plantations.push({ id: newId(state, 'farm'), regionId: region.id, plots: 1, mill: false, cost: region.plotPrice, boughtHour: state.hour, lastHarvestKg: 0, lastWeather: 'Not harvested yet' });
      addLog(state, 'good', `Bought a coffee farm in ${region.name}, ${region.country}.`);
      return;
    }
    case 'addPlot': {
      const p = state.plantations.find((x) => x.id === cmd.plantationId) ?? fail('That farm is no longer yours.');
      if (p.plots >= MAX_PLOTS) fail(`A farm can have at most ${MAX_PLOTS} plots.`);
      const region = regionById(p.regionId);
      requireCash(state, region.plotPrice);
      post(state, `More farmland in ${region.name}`, 'investing', [['farmland', region.plotPrice], ['cash', -region.plotPrice]]);
      p.plots += 1;
      p.cost += region.plotPrice;
      return;
    }
    case 'buildMill': {
      const p = state.plantations.find((x) => x.id === cmd.plantationId) ?? fail('That farm is no longer yours.');
      if (p.mill) fail('That farm already has a mill.');
      requireCash(state, MILL_COST);
      post(state, `Processing mill in ${regionById(p.regionId).name}`, 'investing', [['farmland', MILL_COST], ['cash', -MILL_COST]]);
      p.mill = true;
      p.cost += MILL_COST;
      return;
    }
    case 'sellPlantation': {
      const p = state.plantations.find((x) => x.id === cmd.plantationId) ?? fail('That farm is no longer yours.');
      const proceeds = Math.round(p.cost * FARMLAND_RESALE);
      post(state, `Sold the farm in ${regionById(p.regionId).name}`, 'investing', [['cash', proceeds], ['farmland', -p.cost], ['otherExpense', p.cost - proceeds]]);
      state.plantations = state.plantations.filter((x) => x.id !== p.id);
      addLog(state, 'info', `Sold the farm in ${regionById(p.regionId).name} for ${formatMoney(proceeds)}.`);
      return;
    }
    case 'sellBeans': {
      if (!Number.isFinite(cmd.kg) || cmd.kg <= 0) fail('Choose how many kilos to sell.');
      if (state.beans.kg <= 0) fail('The warehouse is empty.');
      const taken = takeBeans(state, cmd.kg);
      const proceeds = Math.round(taken.kg * state.market.beanPrice * 0.9);
      post(state, `Sold ${Math.round(taken.kg)} kg of beans`, 'operating', [['cash', proceeds], ['inventory', -taken.cost], ['otherIncome', taken.cost - proceeds]]);
      return;
    }
    case 'buyStock': {
      requireDept(state, 'investment', 1);
      positiveInt(cmd.shares, 'Shares');
      const def = stockDef(cmd.symbol) ?? fail('Unknown stock.');
      const price = state.market.stocks[def.symbol]?.price ?? fail('No price for that stock.');
      const cost = price * cmd.shares;
      requireCash(state, cost);
      post(state, `Bought ${cmd.shares} ${def.symbol}`, 'investing', [['investments', cost], ['cash', -cost]]);
      const h = (state.holdings[def.symbol] ??= { shares: 0, cost: 0 });
      h.shares += cmd.shares;
      h.cost += cost;
      return;
    }
    case 'sellStock': {
      positiveInt(cmd.shares, 'Shares');
      const def = stockDef(cmd.symbol) ?? fail('Unknown stock.');
      const h = state.holdings[def.symbol];
      if (!h || h.shares < cmd.shares) fail(`You own ${h?.shares ?? 0} shares of ${def.symbol}.`);
      const price = state.market.stocks[def.symbol]!.price;
      const proceeds = price * cmd.shares;
      const basis = cmd.shares === h!.shares ? h!.cost : Math.round((h!.cost * cmd.shares) / h!.shares);
      post(state, `Sold ${cmd.shares} ${def.symbol}`, 'investing', [['cash', proceeds], ['investments', -basis], ['otherIncome', basis - proceeds]]);
      h!.shares -= cmd.shares;
      h!.cost -= basis;
      if (h!.shares === 0) delete state.holdings[def.symbol];
      return;
    }
    case 'buyProperty': {
      requireDept(state, 'investment', 2);
      const def = propertyDef(cmd.propertyId) ?? fail('That property is not for sale.');
      if (!state.cities.includes(def.cityId as GameState['cities'][number])) fail(`Unlock ${city(def.cityId).name} first.`);
      if (state.properties.some((p) => p.propertyId === def.id)) fail('You already own it.');
      if (def.lotId && !state.stores.some((s) => s.lotId === def.lotId)) fail('You can only buy the building of a store you run.');
      const price = propertyValue(state, def);
      requireCash(state, price);
      post(state, `Bought ${def.name}`, 'investing', [['realEstate', price], ['cash', -price]]);
      state.properties.push({ propertyId: def.id, cost: price, boughtHour: state.hour });
      addLog(state, 'good', def.lotId ? `Bought the building at ${def.address}. That store pays no more rent.` : `Bought ${def.name}.`);
      return;
    }
    case 'sellProperty': {
      const owned = state.properties.find((p) => p.propertyId === cmd.propertyId) ?? fail('You do not own that property.');
      const def = propertyDef(owned.propertyId);
      const proceeds = Math.round((def ? propertyValue(state, def) : owned.cost) * (1 - REAL_ESTATE_SALE_FEE));
      post(state, `Sold ${def?.name ?? 'a property'}`, 'investing', [['cash', proceeds], ['realEstate', -owned.cost], ['otherIncome', owned.cost - proceeds]]);
      state.properties = state.properties.filter((p) => p !== owned);
      return;
    }
    case 'ipo': {
      const blocker = ipoBlocker(state);
      if (blocker) fail(blocker);
      if (![10, 20, 30, 40].includes(cmd.percent)) fail('Sell 10, 20, 30, or 40 percent of the company.');
      const s = state.shares;
      // Shares are sold at what the company is worth today.
      s.price = fairSharePrice(state);
      const total = shareCount(s);
      const issued = (total * BigInt(cmd.percent)) / BigInt(100 - cmd.percent);
      const raised = toCents((BigInt(s.price) * issued * BigInt(Math.round((1 - IPO_FEE) * 100))) / 100n, 'The amount raised');
      post(state, 'Initial public offering', 'financing', [['cash', raised], ['shareCapital', -raised]]);
      s.total = (total + issued).toString();
      s.listed = true;
      s.listedHour = state.hour;
      addLog(state, 'good', `${state.companyName} is now a public company. The IPO raised ${formatMoney(raised)}.`);
      return;
    }
    case 'splitShares': {
      const s = state.shares;
      if (!s.listed) fail('Only public companies split their shares.');
      if (s.price < SPLIT_MIN_PRICE) fail(`Shares need to trade above ${formatMoney(SPLIT_MIN_PRICE)} to split.`);
      s.total = (shareCount(s) * 2n).toString();
      s.owner = (ownerShares(s) * 2n).toString();
      s.price = Math.max(1, Math.round(s.price / 2));
      s.history = s.history.map((h) => ({ ...h, price: Math.max(1, Math.round(h.price / 2)) }));
      addLog(state, 'info', 'Every share is now two shares at half the price.');
      return;
    }
    case 'payDividend': {
      positiveInt(cmd.perShare, 'The dividend');
      const s = state.shares;
      const total = toCents(BigInt(cmd.perShare) * shareCount(s), 'That dividend');
      requireCash(state, total);
      if (total > balanceSheet(state).retainedEarnings) fail('Dividends can only come out of retained earnings.');
      const toOwner = toCents(BigInt(cmd.perShare) * ownerShares(s), 'Your share of the dividend');
      post(state, 'Dividend', 'financing', [['dividends', total], ['cash', -total]]);
      state.owner.cash += toOwner;
      addLog(state, 'good', `Paid a dividend of ${formatMoney(total)}. ${formatMoney(toOwner)} went to you.`);
      return;
    }
    case 'sellOwnerShares': {
      const s = state.shares;
      if (!s.listed) fail('Take the company public before selling your shares.');
      if (![5, 10, 25].includes(cmd.percent)) fail('Sell 5, 10, or 25 percent of your stake.');
      const qty = (ownerShares(s) * BigInt(cmd.percent)) / 100n;
      if (qty <= 0n) fail('You have no shares left to sell.');
      const proceeds = toCents((BigInt(s.price) * qty * BigInt(Math.round((1 - OWNER_SALE_FEE) * 100))) / 100n, 'The sale');
      s.owner = (ownerShares(s) - qty).toString();
      state.owner.cash += proceeds;
      addLog(state, 'info', `You sold some of your shares for ${formatMoney(proceeds)}.`);
      return;
    }
    case 'investPersonal': {
      positiveInt(cmd.amount, 'The amount');
      if (state.shares.listed) fail('A public company raises money by selling shares, not from its founder.');
      if (state.owner.cash < cmd.amount) fail(`You have ${formatMoney(state.owner.cash)} of your own.`);
      state.owner.cash -= cmd.amount;
      post(state, 'Founder investment', 'financing', [['cash', cmd.amount], ['ownerCapital', -cmd.amount]]);
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
    // Amounts too big to handle exactly are refused like any other bad request, never a crash.
    if (err instanceof RangeError) return { state, error: err.message };
    throw err;
  }
}
