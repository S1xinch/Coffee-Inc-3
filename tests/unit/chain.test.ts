import { describe, expect, it } from 'vitest';
import { HOURS_PER_WEEK, MANAGER_SALARY, NEIGHBORHOODS } from '../../src/sim/catalog';
import { CITIES, LOTS, city, firstLotIn, isRoad, isWater, zoneAt } from '../../src/sim/city';
import { applyCommand } from '../../src/sim/commands';
import { newGame } from '../../src/sim/game';
import { cashBalance, ledgerIsBalanced, post, storeEntries } from '../../src/sim/ledger';
import { FLOOR_CELLS, isFloorCell, normalizeLayout, occupant } from '../../src/sim/layout';
import { managerMorning, managerStatus } from '../../src/sim/manager';
import { RIVAL_EXPANSION_WEEKS, competitionFactor, lotTaken } from '../../src/sim/rival';
import { weeklyRent } from '../../src/sim/store';
import { advanceHours } from '../../src/sim/tick';
import { openStore, run } from './helpers';

const freeLot = (s: ReturnType<typeof openStore>, districtId?: string) =>
  LOTS.find((l) => s.cities.includes(l.cityId) && !lotTaken(s, l.id) && (!districtId || l.districtId === districtId))!;

describe('city maps', () => {
  it('puts every lot on dry land, off the roads, in its own district', () => {
    const seen = new Set<string>();
    for (const l of LOTS) {
      const c = city(l.cityId);
      expect(l.x).toBeGreaterThanOrEqual(0);
      expect(l.x).toBeLessThan(c.w);
      expect(l.y).toBeLessThan(c.h);
      expect(isWater(c, l.x, l.y)).toBe(false);
      expect(isRoad(c, l.x, l.y)).toBe(false);
      expect(zoneAt(c, l.x, l.y)).toBe(l.districtId);
      expect(seen.has(`${l.cityId}:${l.x},${l.y}`)).toBe(false);
      seen.add(`${l.cityId}:${l.x},${l.y}`);
    }
  });

  it('has lots in every district and piers reaching into the water', () => {
    for (const n of NEIGHBORHOODS) expect(LOTS.some((l) => l.districtId === n.id && l.cityId === n.cityId)).toBe(true);
    for (const c of CITIES) {
      for (const p of c.piers) {
        const tiles = [];
        for (let x = Math.floor(p.x0); x <= Math.floor(p.x1); x++) for (let y = Math.floor(p.y0); y <= Math.floor(p.y1); y++) tiles.push(isWater(c, x, y));
        expect(tiles).toContain(true);
        expect(tiles).toContain(false);
      }
    }
  });
});

describe('leasing a second store', () => {
  it('opens an empty store on a free lot and charges the signing fee', () => {
    const s0 = openStore();
    const target = freeLot(s0, 'downtown');
    const s = run(s0, { type: 'leaseLot', lotId: target.id });
    expect(s.stores).toHaveLength(2);
    const store = s.stores[1]!;
    expect(store.lotId).toBe(target.id);
    expect(store.equipment).toHaveLength(0);
    expect(cashBalance(s0) - cashBalance(s)).toBe(weeklyRent(store));
    expect(ledgerIsBalanced(s)).toBe(true);
  });

  it('refuses a lot that you or the rival already hold', () => {
    const s = openStore();
    expect(applyCommand(s, { type: 'leaseLot', lotId: s.stores[0]!.lotId }).error).toBeDefined();
    expect(applyCommand(s, { type: 'leaseLot', lotId: s.rival.stores[0]!.lotId }).error).toBeDefined();
  });

  it('keeps each store on its own books and tags rent by store', () => {
    let s = run(openStore(9), { type: 'leaseLot', lotId: freeLot(openStore(9), 'university').id });
    s = advanceHours(s, HOURS_PER_WEEK - s.hour);
    const report = s.reports.at(-1)!;
    expect(report.stores.map((r) => r.storeId)).toEqual(s.stores.map((x) => x.id));
    expect(report.stores[0]!.revenue).toBeGreaterThan(0);
    expect(report.stores[1]!.revenue).toBe(0);
    expect(report.stores.reduce((sum, r) => sum + r.revenue, 0)).toBe(report.income.revenue);
    expect(ledgerIsBalanced(s)).toBe(true);
  });

  it('only lets you close a store when you have another one', () => {
    const s0 = openStore();
    expect(applyCommand(s0, { storeId: 'store1', type: 'closeStore' }).error).toBeDefined();
    const s1 = run(s0, { type: 'leaseLot', lotId: freeLot(s0).id });
    const second = s1.stores[1]!.id;
    const s2 = run(s1, { storeId: second, type: 'buyEquipment', typeId: 'table' }, { storeId: second, type: 'closeStore' });
    expect(s2.stores.map((x) => x.id)).toEqual(['store1']);
    expect(lotTaken(s2, s1.stores[1]!.lotId)).toBe(false);
    expect(ledgerIsBalanced(s2)).toBe(true);
  });

  it('splits walk-ins between your own stores in one district', () => {
    const s0 = newGame({ companyName: 'Twins', districtId: 'old-town', seed: 2 });
    const alone = competitionFactor(s0, s0.stores[0]!);
    const s1 = run(s0, { type: 'leaseLot', lotId: 'old-town-2' });
    expect(competitionFactor(s1, s1.stores[0]!)).toBeLessThan(alone);
  });
});

describe('store managers (Coffee Inc 2: managers stuck on a status)', () => {
  it('charges a weekly salary', () => {
    let s = run(openStore(4), { storeId: 'store1', type: 'hireManager' });
    s = advanceHours(s, HOURS_PER_WEEK - s.hour);
    const salary = storeEntries(s.ledger.journal, 'store1').length + s.reports.length;
    expect(salary).toBeGreaterThan(0);
    expect(s.reports.at(-1)!.income.wages).toBeGreaterThanOrEqual(MANAGER_SALARY);
  });

  it('answers incidents on the spot so none wait on the player', () => {
    let s = run(openStore(3), { storeId: 'store1', type: 'hireManager' });
    s = advanceHours(s, HOURS_PER_WEEK * 4);
    expect(s.incidents.filter((i) => i.storeId === 'store1')).toHaveLength(0);
  });

  it('repairs broken equipment and hires up to demand in the morning', () => {
    let s = run(openStore(6), { storeId: 'store1', type: 'hireManager' });
    s = advanceHours(s, 24);
    const store = s.stores[0]!;
    store.equipment.find((e) => e.typeId === 'espresso-1')!.broken = true;
    store.staff = store.staff.slice(0, 1);
    managerMorning(s, store);
    expect(store.equipment.every((e) => !e.broken)).toBe(true);
    expect(store.staff.length).toBeGreaterThan(1);
    expect(store.manager!.lastAction).not.toBeNull();
    expect(ledgerIsBalanced(s)).toBe(true);
  });

  it('derives status from the store every time, so it can never get stuck', () => {
    const s = run(openStore(6), { storeId: 'store1', type: 'hireManager' });
    const store = s.stores[0]!;
    expect(managerStatus(s, store)!.state).toBe('operating');
    store.equipment.find((e) => e.typeId === 'register')!.broken = true;
    expect(managerStatus(s, store)!.state).not.toBe('operating');
    store.equipment.find((e) => e.typeId === 'register')!.broken = false;
    expect(managerStatus(s, store)!.state).toBe('operating');
    expect(managerStatus(s, { ...store, manager: null })).toBeNull();
  });

  it('asks for help instead of spending cash the company does not have', () => {
    const s = run(openStore(6), { storeId: 'store1', type: 'hireManager' });
    const store = s.stores[0]!;
    store.equipment.find((e) => e.typeId === 'espresso-1')!.broken = true;
    const cash = cashBalance(s);
    post(s, 'Spent elsewhere', 'operating', [['otherExpense', cash], ['cash', -cash]]);
    managerMorning(s, store);
    expect(store.equipment.some((e) => e.broken)).toBe(true);
    expect(managerStatus(s, store)!.state).toBe('needsAttention');
  });
});

describe('furniture layout', () => {
  it('places new furniture on free floor cells', () => {
    let s = openStore();
    for (let i = 0; i < 4; i++) s = run(s, { storeId: 'store1', type: 'buyEquipment', typeId: 'table' });
    const cells = Object.values(s.stores[0]!.layout);
    expect(new Set(cells.map((c) => `${c.x},${c.y}`)).size).toBe(cells.length);
    for (const c of cells) expect(isFloorCell(c)).toBe(true);
  });

  it('moves an item, and swaps two items when the spot is taken', () => {
    let s = run(openStore(), { storeId: 'store1', type: 'buyEquipment', typeId: 'armchair' });
    const store = s.stores[0]!;
    const table = store.equipment.find((e) => e.typeId === 'table')!.id;
    const chair = store.equipment.find((e) => e.typeId === 'armchair')!.id;
    const empty = FLOOR_CELLS.find((c) => !occupant(store, c))!;
    s = run(s, { storeId: 'store1', type: 'moveItem', equipmentId: table, x: empty.x, y: empty.y });
    expect(s.stores[0]!.layout[table]).toEqual(empty);
    const chairAt = s.stores[0]!.layout[chair]!;
    s = run(s, { storeId: 'store1', type: 'moveItem', equipmentId: table, x: chairAt.x, y: chairAt.y });
    expect(s.stores[0]!.layout[table]).toEqual(chairAt);
    expect(s.stores[0]!.layout[chair]).toEqual(empty);
  });

  it('keeps the queue lane clear and refuses counter equipment', () => {
    const s = openStore();
    const table = s.stores[0]!.equipment.find((e) => e.typeId === 'table')!.id;
    const register = s.stores[0]!.equipment.find((e) => e.typeId === 'register')!.id;
    expect(applyCommand(s, { storeId: 'store1', type: 'moveItem', equipmentId: table, x: 6, y: 4 }).error).toBeDefined();
    expect(applyCommand(s, { storeId: 'store1', type: 'moveItem', equipmentId: register, x: 0, y: 3 }).error).toBeDefined();
  });

  it('repairs a broken layout instead of failing', () => {
    const s = openStore();
    const store = s.stores[0]!;
    const [a, b] = store.equipment.filter((e) => e.typeId === 'table' || e.typeId === 'plant');
    store.layout = { [a!.id]: { x: 99, y: -3 }, [b!.id]: { x: 99, y: -3 }, ghost: { x: 0, y: 3 } };
    normalizeLayout(store);
    expect(store.layout.ghost).toBeUndefined();
    expect(isFloorCell(store.layout[a!.id]!)).toBe(true);
    expect(isFloorCell(store.layout[b!.id]!)).toBe(true);
    expect(store.layout[a!.id]).not.toEqual(store.layout[b!.id]);
  });
});

describe('rival chain', () => {
  it('opens a new store every few weeks, never on a taken lot', () => {
    const s0 = openStore(13);
    const before = s0.rival.stores.length;
    const s = advanceHours(s0, HOURS_PER_WEEK * RIVAL_EXPANSION_WEEKS);
    expect(s.rival.stores.length).toBe(before + 1);
    const lots = [...s.stores.map((x) => x.lotId), ...s.rival.stores.map((r) => r.lotId)];
    expect(new Set(lots).size).toBe(lots.length);
  });

  it('takes customers from a store in the same district', () => {
    const near = newGame({ companyName: 'Near', districtId: 'waterfront', seed: 1 });
    const far = newGame({ companyName: 'Far', districtId: 'hillside', seed: 1 });
    expect(competitionFactor(near, near.stores[0]!)).toBeLessThan(1);
    expect(competitionFactor(far, far.stores[0]!)).toBe(1);
  });

  it('stays inside its price and rating bounds over a long game', () => {
    const s = advanceHours(openStore(17), HOURS_PER_WEEK * 12);
    expect(s.rival.priceIndex).toBeGreaterThanOrEqual(0.85);
    expect(s.rival.priceIndex).toBeLessThanOrEqual(1.15);
    expect(s.rival.stars).toBeGreaterThanOrEqual(3.3);
    expect(s.rival.stars).toBeLessThanOrEqual(4.3);
  });
});

it('every district picks a starting lot', () => {
  for (const n of NEIGHBORHOODS) expect(firstLotIn(n.id).districtId).toBe(n.id);
});
