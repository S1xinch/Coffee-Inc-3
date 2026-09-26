import { describe, expect, it } from 'vitest';
import { HOURS_PER_WEEK } from '../../src/sim/catalog';
import { applyCommand } from '../../src/sim/commands';
import { city, lotsIn } from '../../src/sim/city';
import { BOARD_MEETING_WEEKS, deptLevel } from '../../src/sim/hq';
import { balanceSheet, balances, cashBalance, ledgerIsBalanced, post } from '../../src/sim/ledger';
import { fairSharePrice, formatBigMoney, ownerStakePercent, storeBuildingId, toCents } from '../../src/sim/markets';
import { FALLBACK_REGION, REGIONS, loadRegions, regionById } from '../../src/sim/regions';
import { cityCharges } from '../../src/sim/rules';
import { SAVE_VERSION, makeSave, parseSave } from '../../src/sim/save';
import { loanApr, loanLimit, repairCost } from '../../src/sim/store';
import type { GameState } from '../../src/sim/state';
import { advanceHours } from '../../src/sim/tick';
import { dollars } from '../../src/sim/money';
import { openStore, run } from './helpers';

// Test money comes in as founder capital so the books stay balanced.
function grant(state: GameState, amount: number): GameState {
  const s = structuredClone(state);
  post(s, 'Test grant', 'financing', [['cash', amount], ['ownerCapital', -amount]]);
  return s;
}

function equip(state: GameState, storeId: string): GameState {
  let s = run(
    state,
    { storeId, type: 'buyEquipment', typeId: 'register' },
    { storeId, type: 'buyEquipment', typeId: 'espresso-1' },
    { storeId, type: 'buyEquipment', typeId: 'drip' },
  );
  if (s.candidates.length < 2) s = run(s, { type: 'refreshCandidates' });
  const [a, b] = s.candidates;
  return run(s, { storeId, type: 'hireStaff', candidateId: a!.id }, { storeId, type: 'hireStaff', candidateId: b!.id });
}

const newestStore = (s: GameState) => s.stores[s.stores.length - 1]!.id;

// A three-store Seattle chain with plenty of cash and an open headquarters.
function corporation(seed = 7): GameState {
  let s = grant(openStore(seed), dollars(2_000_000));
  s = run(s, { type: 'leaseLot', lotId: 'downtown-1' });
  s = equip(s, newestStore(s));
  s = run(s, { type: 'leaseLot', lotId: 'hillside-1' });
  s = equip(s, newestStore(s));
  return run(s, { type: 'openHq' });
}

describe('cities and the rules table (Coffee Inc 2 bug #8)', () => {
  it('keeps new cities locked until you meet the requirements', () => {
    const s = openStore();
    const pdxLot = lotsIn('portland')[0]!;
    expect(applyCommand(s, { type: 'leaseLot', lotId: pdxLot.id }).error).toMatch(/Unlock Portland/);
    expect(applyCommand(s, { type: 'unlockCity', cityId: 'portland' }).error).toMatch(/at least 2 stores/);
    let t = grant(run(s, { type: 'leaseLot', lotId: 'downtown-1' }), dollars(50_000));
    const before = cashBalance(t);
    t = run(t, { type: 'unlockCity', cityId: 'portland' }, { type: 'leaseLot', lotId: pdxLot.id });
    expect(t.cities).toContain('portland');
    expect(before - cashBalance(t)).toBeGreaterThanOrEqual(city('portland').unlock!.fee);
    expect(ledgerIsBalanced(t)).toBe(true);
  });

  it('pays San Francisco wages and charges its cup fee', () => {
    let s = grant(openStore(3), dollars(200_000));
    s = run(s, { type: 'leaseLot', lotId: 'downtown-1' }, { type: 'leaseLot', lotId: 'hillside-1' }, { type: 'leaseLot', lotId: 'market-1' });
    s = run(s, { type: 'unlockCity', cityId: 'san-francisco' }, { type: 'leaseLot', lotId: 'financial-1' });
    s = run(s, { type: 'refreshCandidates' });
    const asking = s.candidates[0]!.askingWage;
    s = equip(s, newestStore(s));
    expect(s.stores.at(-1)!.staff[0]!.wage).toBe(Math.round(asking * 1.25));
    s = advanceHours(s, 24);
    expect(s.ledger.journal.some((e) => e.memo === 'San Francisco cup fee')).toBe(true);
    expect(ledgerIsBalanced(s)).toBe(true);
  });

  it('charges no city fines at all while politics are off, but always charges licenses', () => {
    const base = grant(openStore(5), dollars(10_000_000));
    const withSf = structuredClone(base);
    withSf.cities.push('san-francisco');
    withSf.stores[0]!.lotId = 'financial-1';
    const count = (politics: boolean) => {
      const s = structuredClone(withSf);
      s.settings.politics = politics;
      for (let i = 0; i < 300; i++) cityCharges(s, s.stores[0]!);
      const memos = s.ledger.journal.map((e) => e.memo);
      return { fines: memos.filter((m) => /permit penalty|citation/.test(m)).length, licenses: memos.filter((m) => m.endsWith('business license')).length };
    };
    const off = count(false);
    const on = count(true);
    expect(off.fines).toBe(0);
    expect(off.licenses).toBe(300);
    expect(on.fines).toBeGreaterThan(10);
    expect(on.licenses).toBe(300);
  });

  it('lets you switch politics from a command', () => {
    const s = run(openStore(), { type: 'setPolitics', on: false });
    expect(s.settings.politics).toBe(false);
  });
});

describe('headquarters', () => {
  it('needs two stores and the build-out cost to open', () => {
    const s = grant(openStore(), dollars(100_000));
    expect(applyCommand(s, { type: 'openHq' }).error).toMatch(/at least 2 stores/);
    const t = run(s, { type: 'leaseLot', lotId: 'downtown-1' }, { type: 'openHq' });
    expect(t.hq.open).toBe(true);
  });

  it('builds departments level by level and counts a chief as one more level', () => {
    let s = corporation();
    expect(applyCommand(s, { type: 'hireChief', departmentId: 'finance' }).error).toMatch(/Finance/);
    s = run(s, { type: 'upgradeDepartment', departmentId: 'finance' }, { type: 'upgradeDepartment', departmentId: 'finance' });
    expect(deptLevel(s, 'finance')).toBe(2);
    expect(applyCommand(s, { type: 'hireChief', departmentId: 'finance' }).error).toMatch(/Executive Office/);
    s = run(s, { type: 'upgradeDepartment', departmentId: 'executive' }, { type: 'hireChief', departmentId: 'finance' });
    expect(deptLevel(s, 'finance')).toBe(3);
    s = run(s, { type: 'upgradeDepartment', departmentId: 'finance' });
    expect(applyCommand(s, { type: 'upgradeDepartment', departmentId: 'finance' }).error).toMatch(/top level/);
  });

  it('gives better bank terms, cheaper repairs, and charges payroll every week', () => {
    const plain = corporation();
    const built = run(plain, { type: 'upgradeDepartment', departmentId: 'finance' }, { type: 'upgradeDepartment', departmentId: 'engineering' });
    expect(loanApr(built)).toBeLessThan(loanApr(plain));
    expect(loanLimit(built)).toBeGreaterThan(loanLimit(plain));
    expect(repairCost(built, 'espresso-1')).toBeLessThan(repairCost(plain, 'espresso-1'));
    const later = advanceHours(built, HOURS_PER_WEEK - (built.hour % HOURS_PER_WEEK));
    expect(later.reports.at(-1)!.income.wages).toBeGreaterThan(0);
    expect(later.ledger.journal.length === 0 || ledgerIsBalanced(later)).toBe(true);
  });

  it('holds a board meeting every quarter that sets targets and moves confidence', () => {
    const s = advanceHours(corporation(9), HOURS_PER_WEEK * BOARD_MEETING_WEEKS * 2);
    expect(s.board.meetings.length).toBe(2);
    expect(s.board.targetRevenue).not.toBeNull();
    const second = s.board.meetings[1]!;
    expect(second.targetRevenue).toBe(Math.round(s.board.meetings[0]!.revenue * 1.08));
    expect(ledgerIsBalanced(s)).toBe(true);
  });
});

describe('plantations and beans (Coffee Inc 2 bug #3)', () => {
  it('rejects damaged region bundles and never fails on an unknown region', () => {
    const { regions, rejected } = loadRegions([REGIONS[0], { id: 'atlantis', version: 2 }, { name: 'no id' }, REGIONS[0]]);
    expect(regions).toHaveLength(1);
    expect(rejected).toEqual(['atlantis', '(no id)', REGIONS[0]!.id]);
    const unknown = regionById('region-from-the-future');
    expect(unknown.name).toBe(FALLBACK_REGION.name);
    expect(unknown.palette.leaf).toMatch(/^#/);
  });

  it('keeps harvesting a farm whose region is no longer known', () => {
    let s = run(corporation(), { type: 'buyPlantation', regionId: 'kenya' });
    s.plantations[0]!.regionId = 'region-from-the-future';
    const save = parseSave(JSON.stringify(makeSave(s, 1)));
    expect(save.ok).toBe(true);
    if (!save.ok) return;
    s = advanceHours(save.save.state, HOURS_PER_WEEK);
    expect(s.plantations[0]!.lastHarvestKg).toBeGreaterThan(0);
  });

  it('needs headquarters, harvests weekly into inventory, and keeps the books in step', () => {
    expect(applyCommand(grant(openStore(), dollars(100_000)), { type: 'buyPlantation', regionId: 'brazil' }).error).toMatch(/headquarters/);
    let s = run(corporation(11), { type: 'buyPlantation', regionId: 'brazil' }, { type: 'buyPlantation', regionId: 'ethiopia' });
    s = run(s, { type: 'addPlot', plantationId: s.plantations[0]!.id });
    s = advanceHours(s, HOURS_PER_WEEK - (s.hour % HOURS_PER_WEEK));
    expect(s.beans.kg).toBeGreaterThan(0);
    expect(balances(s).inventory).toBe(s.beans.value);
    expect(balances(s).farmland).toBe(s.plantations.reduce((sum, p) => sum + p.cost, 0));
    const before = s.beans.kg;
    s = advanceHours(s, 24 * 3);
    expect(s.beans.kg).toBeLessThan(before);
    expect(balances(s).inventory).toBe(s.beans.value);
    expect(ledgerIsBalanced(s)).toBe(true);
  });

  it('sells surplus beans at the market price', () => {
    let s = run(corporation(), { type: 'buyPlantation', regionId: 'vietnam' });
    s = advanceHours(s, HOURS_PER_WEEK - (s.hour % HOURS_PER_WEEK));
    const kg = s.beans.kg;
    s = run(s, { type: 'sellBeans', kg: kg / 2 });
    expect(s.beans.kg).toBeCloseTo(kg / 2, 2);
    expect(balances(s).inventory).toBe(s.beans.value);
    expect(ledgerIsBalanced(s)).toBe(true);
  });
});

describe('stock market and real estate', () => {
  it('needs the Investment department and books gains when you sell', () => {
    let s = corporation();
    expect(applyCommand(s, { type: 'buyStock', symbol: 'EVRG', shares: 10 }).error).toMatch(/Investment/);
    s = run(s, { type: 'upgradeDepartment', departmentId: 'investment' }, { type: 'buyStock', symbol: 'EVRG', shares: 100 });
    expect(balances(s).investments).toBe(s.holdings.EVRG!.cost);
    s.market.stocks.EVRG!.price += dollars(10);
    const beforeOther = balanceSheet(s).retainedEarnings;
    s = run(s, { type: 'sellStock', symbol: 'EVRG', shares: 100 });
    expect(s.holdings.EVRG).toBeUndefined();
    expect(balances(s).investments).toBe(0);
    expect(balanceSheet(s).retainedEarnings - beforeOther).toBe(dollars(10) * 100);
    expect(ledgerIsBalanced(s)).toBe(true);
  });

  it('stops charging rent on a store whose building you own, and collects rent from tenants', () => {
    let s = run(corporation(), { type: 'upgradeDepartment', departmentId: 'investment' }, { type: 'upgradeDepartment', departmentId: 'investment' });
    const lotId = s.stores[0]!.lotId;
    s = run(s, { type: 'buyProperty', propertyId: storeBuildingId(lotId) }, { type: 'buyProperty', propertyId: 'sea-cedar' });
    expect(applyCommand(s, { type: 'buyProperty', propertyId: 'pdx-burnside' }).error).toMatch(/Unlock Portland/);
    s = advanceHours(s, HOURS_PER_WEEK - (s.hour % HOURS_PER_WEEK));
    const report = s.reports.at(-1)!;
    expect(report.stores.find((r) => r.storeId === s.stores[0]!.id)).toBeDefined();
    expect(report.income.otherIncome).toBeGreaterThanOrEqual(dollars(2_600));
    expect(balanceSheet(s).realEstate).toBe(s.properties.reduce((sum, p) => sum + p.cost, 0));
    expect(ledgerIsBalanced(s)).toBe(true);
  });
});

describe('going public (Coffee Inc 2 bug #4)', () => {
  function readyForIpo(): GameState {
    return run(
      corporation(13),
      { type: 'upgradeDepartment', departmentId: 'investment' },
      { type: 'upgradeDepartment', departmentId: 'investment' },
      { type: 'upgradeDepartment', departmentId: 'executive' },
    );
  }

  it('blocks an IPO until the company is ready', () => {
    expect(applyCommand(corporation(), { type: 'ipo', percent: 20 }).error).toMatch(/Investment/);
  });

  it('raises cash for new shares and dilutes the founder', () => {
    const s0 = readyForIpo();
    const s = run(s0, { type: 'ipo', percent: 20 });
    expect(s.shares.listed).toBe(true);
    expect(BigInt(s.shares.total)).toBe(1_250_000n);
    expect(ownerStakePercent(s.shares)).toBe(80);
    expect(cashBalance(s)).toBeGreaterThan(cashBalance(s0));
    expect(balanceSheet(s).shareCapital).toBe(cashBalance(s) - cashBalance(s0));
    expect(ledgerIsBalanced(s)).toBe(true);
  });

  it('stays exact past a quadrillion shares', () => {
    let s = run(readyForIpo(), { type: 'ipo', percent: 10 });
    for (let i = 0; i < 40; i++) {
      s.shares.price = dollars(400);
      s = run(s, { type: 'splitShares' });
    }
    const expected = (1_000_000n + (1_000_000n * 10n) / 90n) * 2n ** 40n;
    expect(BigInt(s.shares.total)).toBe(expected);
    expect(BigInt(s.shares.total) > 10n ** 15n).toBe(true);
    expect(BigInt(s.shares.owner)).toBe(1_000_000n * 2n ** 40n);
    expect(formatBigMoney(BigInt(s.shares.price) * BigInt(s.shares.total))).toMatch(/^\$[\d,]+$/);
    expect(fairSharePrice(s)).toBeGreaterThanOrEqual(1);
    // A dividend too large to pay is refused with a message instead of crashing.
    expect(applyCommand(s, { type: 'payDividend', perShare: 100 }).error).toMatch(/too large/);
    expect(() => toCents(10n ** 20n, 'x')).toThrow(RangeError);
  });

  it('pays dividends out of retained earnings to every shareholder', () => {
    let s = readyForIpo();
    expect(applyCommand(s, { type: 'payDividend', perShare: 1_000_000 }).error).toBeDefined();
    post(s, 'Test windfall', 'operating', [['cash', dollars(500_000)], ['otherIncome', -dollars(500_000)]]);
    s = run(s, { type: 'ipo', percent: 20 });
    const retained = balanceSheet(s).retainedEarnings;
    s = run(s, { type: 'payDividend', perShare: 10 });
    expect(s.owner.cash).toBe(10 * 1_000_000);
    expect(balanceSheet(s).retainedEarnings).toBe(retained - 10 * 1_250_000);
    expect(ledgerIsBalanced(s)).toBe(true);
  });
});

it('upgrades a version 3 save to version 4', () => {
  const current = advanceHours(openStore(), 30);
  const v3 = structuredClone(current) as unknown as Record<string, unknown>;
  for (const k of ['cities', 'hq', 'board', 'plantations', 'beans', 'market', 'holdings', 'properties', 'shares', 'owner', 'settings']) delete v3[k];
  const r = parseSave({ format: 'coffee-inc-3-save', version: 3, savedAtMs: 1, state: v3 });
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.save.version).toBe(SAVE_VERSION);
  expect(r.save.state.cities).toEqual(['seattle']);
  expect(r.save.state.hq.open).toBe(false);
  expect(ledgerIsBalanced(advanceHours(r.save.state, HOURS_PER_WEEK))).toBe(true);
});
