import { describe, expect, it } from 'vitest';
import { HOURS_PER_WEEK, STARTING_CAPITAL } from '../../src/sim/catalog';
import { applyCommand } from '../../src/sim/commands';
import { newGame } from '../../src/sim/game';
import { autoResolveOverdue, INCIDENTS } from '../../src/sim/incidents';
import { balanceSheet, balances, cashBalance, ledgerIsBalanced, post } from '../../src/sim/ledger';
import { offlineHours } from '../../src/sim/clock';
import { SAVE_VERSION, makeSave, parseSave } from '../../src/sim/save';
import { readiness, starRating } from '../../src/sim/store';
import { campaign } from '../../src/sim/marketing';
import { advanceHours, advanceHoursInPlace } from '../../src/sim/tick';
import { dollars } from '../../src/sim/money';
import { firstLotIn } from '../../src/sim/city';
import type { GameState } from '../../src/sim/state';
import { openStore, run } from './helpers';

describe('ledger (Coffee Inc 2: phantom bankruptcy)', () => {
  it('keeps every entry balanced and assets equal to liabilities plus equity', () => {
    let s = openStore();
    s = run(s, { type: 'takeLoan', amount: dollars(10_000) });
    for (let week = 0; week < 6; week++) {
      s = advanceHours(s, HOURS_PER_WEEK);
      expect(ledgerIsBalanced(s)).toBe(true);
      const b = balanceSheet(s);
      expect(b.totalAssets).toBe(b.totalLiabilities + b.totalEquity);
    }
  });

  it('reports cash that matches the cash flow statement', () => {
    const s = advanceHours(openStore(), HOURS_PER_WEEK * 3);
    for (const r of s.reports) expect(r.cashFlow.closingCash).toBe(r.balance.cash);
    expect(s.reports.at(-1)!.balance.cash).toBe(cashBalance(s));
  });

  it('never goes bankrupt while cash is positive, even after a terrible week', () => {
    let s = openStore();
    s = run(s, { type: 'takeLoan', amount: dollars(30_000) });
    for (let i = 0; i < 20; i++) s = run(s, { storeId: 'store1', type: 'giveRaise', staffId: s.stores[0]!.staff[0]!.id });
    s = advanceHours(s, HOURS_PER_WEEK * 8);
    expect(cashBalance(s)).toBeGreaterThan(0);
    expect(s.bankrupt).toBe(false);
    expect(s.distressWeeks).toBe(0);
  });

  it('gives a grace period before bankruptcy and clears distress once cash recovers', () => {
    let s = openStore();
    post(s, 'Test drain', 'operating', [['otherExpense', cashBalance(s) + dollars(5_000)], ['cash', -(cashBalance(s) + dollars(5_000))]]);
    s = advanceHours(s, HOURS_PER_WEEK - s.hour);
    expect(s.distressWeeks).toBe(1);
    expect(s.bankrupt).toBe(false);
    s = run(s, { type: 'takeLoan', amount: dollars(30_000) });
    s = advanceHours(s, HOURS_PER_WEEK);
    expect(s.distressWeeks).toBe(0);
    expect(s.bankrupt).toBe(false);
  });

  it('declares bankruptcy only after the grace period runs out', () => {
    let s = newGame({ companyName: 'Doomed', districtId: 'downtown', seed: 1 });
    post(s, 'Test drain', 'operating', [['otherExpense', STARTING_CAPITAL + dollars(20_000)], ['cash', -(STARTING_CAPITAL + dollars(20_000))]]);
    s = advanceHours(s, HOURS_PER_WEEK * 3);
    expect(s.bankrupt).toBe(false);
    s = advanceHours(s, HOURS_PER_WEEK * 2);
    expect(s.bankrupt).toBe(true);
  });

  it('refuses amounts that would lose precision instead of corrupting the books', () => {
    const s = newGame({ companyName: 'Huge', districtId: 'old-town', seed: 1 });
    expect(() => post(s, 'Too big', 'financing', [['cash', 2 ** 60], ['loans', -(2 ** 60)]])).toThrow(RangeError);
    expect(ledgerIsBalanced(s)).toBe(true);
  });
});

describe('weekly tick (Coffee Inc 2: crash after ending the week)', () => {
  it('is deterministic: one big advance equals many single-hour steps', () => {
    const base = openStore(7);
    const bulk = advanceHours(base, 300);
    let stepped = base;
    for (let i = 0; i < 300; i++) stepped = advanceHours(stepped, 1);
    expect(stepped).toEqual(bulk);
  });

  it('processes a full two-week catch-up in day-sized chunks with the same result', () => {
    const base = openStore(9);
    const bulk = advanceHours(base, 14 * 24);
    const chunked = structuredClone(base);
    for (let d = 0; d < 14; d++) advanceHoursInPlace(chunked, 24);
    expect(chunked).toEqual(bulk);
    expect(chunked.reports.length).toBe(2);
  });

  it('keeps the save small by folding closed weeks out of the journal', () => {
    const s = advanceHours(openStore(), HOURS_PER_WEEK * 10);
    expect(s.ledger.journal.length).toBeLessThan(200);
    expect(JSON.stringify(s).length).toBeLessThan(150_000);
  });
});

describe('incidents (Coffee Inc 2: stuck delegated states)', () => {
  it('resolves every incident by its deadline, even if the player never answers', () => {
    let s = openStore(3);
    s = advanceHours(s, HOURS_PER_WEEK * 6);
    for (const i of s.incidents) expect(i.deadlineHour).toBeGreaterThanOrEqual(s.hour);
    expect(s.lifetime.incidentsAutoResolved).toBeGreaterThan(0);
  });

  it('handles incidents about staff who were already let go', () => {
    let s = openStore(5);
    const staffId = s.stores[0]!.staff[0]!.id;
    s.incidents.push({ id: 'x1', defId: 'raise-request', createdHour: s.hour, deadlineHour: s.hour, staffId, storeId: 'store1' });
    s = run(s, { storeId: 'store1', type: 'fireStaff', staffId });
    autoResolveOverdue(s);
    expect(s.incidents).toHaveLength(0);
  });

  it('every incident has a free default choice', () => {
    for (const d of INCIDENTS) expect(d.options[d.defaultOption]!.cost).toBe(0);
  });

  it('a broken machine can always be repaired and sales resume', () => {
    let s = openStore();
    s.stores[0]!.equipment.find((e) => e.typeId === 'espresso-1')!.broken = true;
    s = run(s, { storeId: 'store1', type: 'repairEquipment', equipmentId: s.stores[0]!.equipment.find((e) => e.typeId === 'espresso-1')!.id });
    expect(s.stores[0]!.equipment.every((e) => !e.broken)).toBe(true);
  });
});

describe('commands', () => {
  it('rejects purchases the company cannot afford without changing anything', () => {
    const s = newGame({ companyName: 'Broke', districtId: 'old-town', seed: 2 });
    const rich = run(s, { storeId: 'store1', type: 'buyEquipment', typeId: 'espresso-3' });
    const r = applyCommand(rich, { storeId: 'store1', type: 'buyEquipment', typeId: 'espresso-3' });
    expect(r.error).toBeDefined();
    const r2 = applyCommand(run(rich, { storeId: 'store1', type: 'buyEquipment', typeId: 'grinder-2' }, { storeId: 'store1', type: 'buyEquipment', typeId: 'lights' }), {
      storeId: 'store1',
      type: 'buyEquipment',
      typeId: 'coldbrew',
    });
    expect(r2.error).toBeUndefined();
    const poor = structuredClone(rich);
    post(poor, 'drain', 'operating', [['otherExpense', cashBalance(poor)], ['cash', -cashBalance(poor)]]);
    const r3 = applyCommand(poor, { storeId: 'store1', type: 'buyEquipment', typeId: 'register' });
    expect(r3.error).toMatch(/Not enough cash/);
    expect(r3.state).toBe(poor);
  });

  it('trades in the old machine when upgrading', () => {
    let s = openStore();
    const before = cashBalance(s);
    s = run(s, { storeId: 'store1', type: 'buyEquipment', typeId: 'espresso-2' });
    expect(s.stores[0]!.equipment.filter((e) => e.typeId.startsWith('espresso'))).toHaveLength(1);
    expect(before - cashBalance(s)).toBeLessThan(dollars(8_500));
    expect(ledgerIsBalanced(s)).toBe(true);
  });

  it('caps staff and loans', () => {
    let s = openStore();
    expect(applyCommand(s, { type: 'takeLoan', amount: dollars(35_000) }).error).toBeDefined();
    expect(applyCommand(s, { type: 'takeLoan', amount: dollars(1_234) }).error).toBeDefined();
    s = run(s, { type: 'takeLoan', amount: dollars(30_000) }, { type: 'repayLoan', amount: dollars(10_000) });
    expect(-balances(s).loans).toBe(dollars(20_000));
  });

  it('clamps menu prices to a sane range', () => {
    const s = run(openStore(), { storeId: 'store1', type: 'setMenuItem', itemId: 'latte', price: 999_999 });
    expect(s.stores[0]!.menu.latte!.price).toBe(dollars(20));
  });
});

describe('demand', () => {
  it('sells nothing until the store is ready', () => {
    const s = newGame({ companyName: 'Empty', districtId: 'old-town', seed: 1 });
    expect(readiness(s, s.stores[0]!).ready).toBe(false);
    const later = advanceHours(s, 48);
    expect(later.lifetime.served).toBe(0);
  });

  it('sells less when prices are far above the reference price', () => {
    const base = openStore(11);
    const cheap = advanceHours(base, HOURS_PER_WEEK);
    let pricey = base;
    for (const id of ['espresso', 'americano', 'latte', 'cappuccino', 'mocha', 'drip']) {
      pricey = run(pricey, { storeId: 'store1', type: 'setMenuItem', itemId: id, price: dollars(12) });
    }
    pricey = advanceHours(pricey, HOURS_PER_WEEK);
    expect(pricey.lifetime.served).toBeLessThan(cheap.lifetime.served * 0.6);
  });

  it('a sensibly run store turns a weekly profit within six weeks', () => {
    const s = advanceHours(openStore(21), HOURS_PER_WEEK * 6);
    const profits = s.reports.map((r) => r.income.netIncome);
    expect(Math.max(...profits.slice(2))).toBeGreaterThan(0);
    expect(Math.max(...profits)).toBeLessThan(dollars(20_000));
  });
});

describe('saves', () => {
  it('round-trips through JSON', () => {
    const s = advanceHours(openStore(), 100);
    const parsed = parseSave(JSON.stringify(makeSave(s, 123)));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.save.state).toEqual(s);
      expect(parsed.save.savedAtMs).toBe(123);
    }
  });

  it('rejects garbage, other files, and saves from newer versions', () => {
    expect(parseSave('{nope').ok).toBe(false);
    expect(parseSave({ hello: 'world' }).ok).toBe(false);
    const future = { ...makeSave(openStore(), 1), version: 99 };
    const r = parseSave(future);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/newer version/);
  });

  it('rejects saves whose books do not balance', () => {
    const s = openStore();
    s.ledger.journal[0]!.lines[0]!.amount += 1;
    const r = parseSave(makeSave(s, 1));
    expect(r.ok).toBe(false);
  });

  it('rejects corrupt layouts with unknown equipment instead of crashing later', () => {
    const s = openStore();
    s.stores[0]!.equipment[0]!.typeId = 'rocket-launcher';
    expect(parseSave(makeSave(s, 1)).ok).toBe(false);
  });

  it('runs migrations from older versions', () => {
    const s = openStore();
    const old = { ...makeSave(s, 1), version: 1 };
    const r = parseSave(old, { 1: (st) => ({ ...st, companyName: 'Migrated' }) }, 2);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.save.state.companyName).toBe('Migrated');
  });
});

describe('offline progress', () => {
  it('ignores short breaks and caps long absences', () => {
    expect(offlineHours(60_000)).toBe(0);
    expect(offlineHours(3_600_000)).toBe(24);
    expect(offlineHours(1000 * 3_600_000)).toBe(14 * 24);
    expect(offlineHours(Number.NaN)).toBe(0);
  });
});

describe('reviews (Coffee Inc 2 review card)', () => {
  it('builds up reviews and four sub-ratings from real service', () => {
    const s = advanceHours(openStore(4), HOURS_PER_WEEK * 2);
    expect(s.stores[0]!.reviews).toBeGreaterThan(0);
    for (const v of Object.values(s.stores[0]!.ratings)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    const stars = starRating(s.stores[0]!);
    expect(stars).toBeGreaterThanOrEqual(1);
    expect(stars).toBeLessThanOrEqual(5);
  });

  it('rates price lower when prices are high', () => {
    const base = openStore(12);
    let pricey = base;
    for (const id of ['espresso', 'americano', 'latte', 'cappuccino', 'mocha', 'drip']) {
      pricey = run(pricey, { storeId: 'store1', type: 'setMenuItem', itemId: id, price: dollars(9) });
    }
    const a = advanceHours(base, HOURS_PER_WEEK);
    const b = advanceHours(pricey, HOURS_PER_WEEK);
    expect(b.stores[0]!.ratings.price).toBeLessThan(a.stores[0]!.ratings.price);
  });
});

describe('marketing campaigns', () => {
  it('charges each campaign weekly and books it as marketing expense', () => {
    let s = openStore(8);
    s = run(s, { storeId: 'store1', type: 'setCampaign', campaignId: 'search', level: 1 }, { storeId: 'store1', type: 'setCampaign', campaignId: 'sponsors', level: 2 });
    s = advanceHours(s, HOURS_PER_WEEK - s.hour + HOURS_PER_WEEK);
    const week2 = s.reports.at(-1)!;
    const expected = campaign('search').levels[1]!.weeklyCost + campaign('sponsors').levels[2]!.weeklyCost;
    expect(Math.abs(week2.income.marketing - expected)).toBeLessThanOrEqual(7);
    expect(ledgerIsBalanced(s)).toBe(true);
  });

  it('brings in more customers when the team has room to serve them', () => {
    const base = run(openStore(15), { storeId: 'store1', type: 'hireStaff', candidateId: openStore(15).candidates[0]!.id });
    const quiet = advanceHours(base, HOURS_PER_WEEK);
    const loud = advanceHours(
      run(base, { storeId: 'store1', type: 'setCampaign', campaignId: 'search', level: 1 }, { storeId: 'store1', type: 'setCampaign', campaignId: 'social', level: 1 }, { storeId: 'store1', type: 'setCampaign', campaignId: 'mail', level: 1 }),
      HOURS_PER_WEEK,
    );
    expect(loud.lifetime.served).toBeGreaterThan(quiet.lifetime.served);
  });

  it('rejects unknown campaigns and levels', () => {
    const s = openStore();
    expect(() => applyCommand(s, { storeId: 'store1', type: 'setCampaign', campaignId: 'billboards', level: 1 })).toThrow();
    expect(applyCommand(s, { storeId: 'store1', type: 'setCampaign', campaignId: 'mail', level: 5 }).error).toBeDefined();
  });
});

// Rebuilds the single-store version 2 shape from a current state, like an old save on disk.
function toV2(state: GameState): Record<string, any> {
  const s = structuredClone(state) as unknown as Record<string, any>;
  const store = s.stores[0];
  s.neighborhoodId = 'hillside';
  s.staff = store.staff;
  s.today = store.today;
  s.yesterday = store.yesterday;
  s.week = store.week;
  s.lastHour = store.lastHour;
  for (const k of ['id', 'lotId', 'openedHour', 'layout', 'staff', 'manager', 'today', 'yesterday', 'week', 'lastHour']) delete store[k];
  s.store = store;
  for (const k of ['stores', 'rival', 'cities', 'hq', 'board', 'plantations', 'beans', 'market', 'holdings', 'properties', 'shares', 'owner', 'settings']) delete s[k];
  for (const r of s.reports) for (const k of ['inventory', 'farmland', 'investments', 'realEstate', 'shareCapital']) delete r.balance[k];
  for (const d of [s.today, s.yesterday]) if (d) delete d.feesAccrued;
  for (const e of s.ledger.journal) delete e.storeId;
  for (const r of s.reports) delete r.stores;
  for (const i of s.incidents) delete i.storeId;
  for (const m of s.modifiers) delete m.storeId;
  return s;
}

describe('save migrations', () => {
  it('upgrades a version 1 save with sensible defaults', () => {
    const v1 = toV2(advanceHours(openStore(), 60));
    delete v1.brand;
    delete v1.store.ratings;
    delete v1.store.reviews;
    delete v1.store.marketing;
    delete v1.today.marketingAccrued;
    if (v1.yesterday) delete v1.yesterday.marketingAccrued;
    const r = parseSave({ format: 'coffee-inc-3-save', version: 1, savedAtMs: 5, state: v1 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.save.version).toBe(SAVE_VERSION);
      expect(r.save.state.brand.icon).toBe('cup');
      expect(r.save.state.stores[0]!.marketing).toEqual({});
      expect(r.save.state.stores[0]!.today.marketingAccrued).toBe(0);
    }
  });

  it('turns a version 2 single-store save into a chain of one on a real lot', () => {
    const before = advanceHours(openStore(21), HOURS_PER_WEEK + 30);
    const r = parseSave({ format: 'coffee-inc-3-save', version: 2, savedAtMs: 5, state: toV2(before) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = r.save.state;
    expect(s.stores).toHaveLength(1);
    expect(s.stores[0]!.lotId).toBe(firstLotIn('hillside').id);
    expect(s.stores[0]!.staff).toHaveLength(before.stores[0]!.staff.length);
    expect(s.stores[0]!.equipment).toHaveLength(before.stores[0]!.equipment.length);
    expect(Object.keys(s.stores[0]!.layout).length).toBeGreaterThan(0);
    expect(s.rival.stores.length).toBeGreaterThan(0);
    expect(ledgerIsBalanced(s)).toBe(true);
    expect(cashBalance(s)).toBe(cashBalance(before));
    // The migrated game keeps running.
    expect(ledgerIsBalanced(advanceHours(s, HOURS_PER_WEEK))).toBe(true);
  });
});
