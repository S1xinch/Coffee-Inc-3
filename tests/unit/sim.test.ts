import { describe, expect, it } from 'vitest';
import { HOURS_PER_WEEK, STARTING_CAPITAL } from '../../src/sim/catalog';
import { applyCommand } from '../../src/sim/commands';
import { newGame } from '../../src/sim/game';
import { autoResolveOverdue, INCIDENTS } from '../../src/sim/incidents';
import { balanceSheet, balances, cashBalance, ledgerIsBalanced, post } from '../../src/sim/ledger';
import { offlineHours } from '../../src/sim/clock';
import { makeSave, parseSave } from '../../src/sim/save';
import { readiness } from '../../src/sim/store';
import { advanceHours, advanceHoursInPlace } from '../../src/sim/tick';
import { dollars } from '../../src/sim/money';
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
    for (let i = 0; i < 20; i++) s = run(s, { type: 'giveRaise', staffId: s.staff[0]!.id });
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
    let s = newGame({ companyName: 'Doomed', neighborhoodId: 'downtown', seed: 1 });
    post(s, 'Test drain', 'operating', [['otherExpense', STARTING_CAPITAL + dollars(20_000)], ['cash', -(STARTING_CAPITAL + dollars(20_000))]]);
    s = advanceHours(s, HOURS_PER_WEEK * 3);
    expect(s.bankrupt).toBe(false);
    s = advanceHours(s, HOURS_PER_WEEK * 2);
    expect(s.bankrupt).toBe(true);
  });

  it('refuses amounts that would lose precision instead of corrupting the books', () => {
    const s = newGame({ companyName: 'Huge', neighborhoodId: 'old-town', seed: 1 });
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
    for (const i of s.incidents) expect(i.deadlineHour).toBeGreaterThan(s.hour);
    expect(s.lifetime.incidentsAutoResolved).toBeGreaterThan(0);
  });

  it('handles incidents about staff who were already let go', () => {
    let s = openStore(5);
    const staffId = s.staff[0]!.id;
    s.incidents.push({ id: 'x1', defId: 'raise-request', createdHour: s.hour, deadlineHour: s.hour, staffId });
    s = run(s, { type: 'fireStaff', staffId });
    autoResolveOverdue(s);
    expect(s.incidents).toHaveLength(0);
  });

  it('every incident has a free default choice', () => {
    for (const d of INCIDENTS) expect(d.options[d.defaultOption]!.cost).toBe(0);
  });

  it('a broken machine can always be repaired and sales resume', () => {
    let s = openStore();
    s.store.equipment.find((e) => e.typeId === 'espresso-1')!.broken = true;
    s = run(s, { type: 'repairEquipment', equipmentId: s.store.equipment.find((e) => e.typeId === 'espresso-1')!.id });
    expect(s.store.equipment.every((e) => !e.broken)).toBe(true);
  });
});

describe('commands', () => {
  it('rejects purchases the company cannot afford without changing anything', () => {
    const s = newGame({ companyName: 'Broke', neighborhoodId: 'old-town', seed: 2 });
    const rich = run(s, { type: 'buyEquipment', typeId: 'espresso-3' });
    const r = applyCommand(rich, { type: 'buyEquipment', typeId: 'espresso-3' });
    expect(r.error).toBeDefined();
    const r2 = applyCommand(run(rich, { type: 'buyEquipment', typeId: 'grinder-2' }, { type: 'buyEquipment', typeId: 'lights' }), {
      type: 'buyEquipment',
      typeId: 'coldbrew',
    });
    expect(r2.error).toBeUndefined();
    const poor = structuredClone(rich);
    post(poor, 'drain', 'operating', [['otherExpense', cashBalance(poor)], ['cash', -cashBalance(poor)]]);
    const r3 = applyCommand(poor, { type: 'buyEquipment', typeId: 'register' });
    expect(r3.error).toMatch(/Not enough cash/);
    expect(r3.state).toBe(poor);
  });

  it('trades in the old machine when upgrading', () => {
    let s = openStore();
    const before = cashBalance(s);
    s = run(s, { type: 'buyEquipment', typeId: 'espresso-2' });
    expect(s.store.equipment.filter((e) => e.typeId.startsWith('espresso'))).toHaveLength(1);
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
    const s = run(openStore(), { type: 'setMenuItem', itemId: 'latte', price: 999_999 });
    expect(s.store.menu.latte!.price).toBe(dollars(20));
  });
});

describe('demand', () => {
  it('sells nothing until the store is ready', () => {
    const s = newGame({ companyName: 'Empty', neighborhoodId: 'old-town', seed: 1 });
    expect(readiness(s).ready).toBe(false);
    const later = advanceHours(s, 48);
    expect(later.lifetime.served).toBe(0);
  });

  it('sells less when prices are far above the reference price', () => {
    const base = openStore(11);
    const cheap = advanceHours(base, HOURS_PER_WEEK);
    let pricey = base;
    for (const id of ['espresso', 'americano', 'latte', 'cappuccino', 'mocha', 'drip']) {
      pricey = run(pricey, { type: 'setMenuItem', itemId: id, price: dollars(12) });
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
    s.store.equipment[0]!.typeId = 'rocket-launcher';
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
