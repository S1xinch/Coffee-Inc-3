import { assertCents, type Cents } from './money';
import {
  ACCOUNTS,
  type Account,
  type BalanceSheet,
  type CashFlow,
  type GameState,
  type IncomeStatement,
  type JournalEntry,
} from './state';

export type EntryKind = JournalEntry['kind'];

// Double-entry: positive amounts are debits, negative are credits, and every entry sums to zero.
// Balances are always derived from these entries; nothing caches a separate "cash" number.
export function post(
  state: GameState,
  memo: string,
  kind: EntryKind,
  lines: ReadonlyArray<readonly [Account, Cents]>,
  storeId: string | null = null,
): void {
  const nonZero = lines.filter(([, amount]) => amount !== 0);
  let sum = 0;
  for (const [account, amount] of nonZero) {
    assertCents(amount, `${memo} (${account})`);
    sum += amount;
  }
  if (sum !== 0) throw new Error(`Unbalanced journal entry "${memo}": off by ${sum}`);
  if (nonZero.length < 2) return;
  state.nextId += 1;
  state.ledger.journal.push({
    id: state.nextId,
    hour: state.hour,
    memo,
    kind,
    lines: nonZero.map(([account, amount]) => ({ account, amount })),
    storeId,
  });
}

export function balances(state: GameState): Record<Account, Cents> {
  const out = {} as Record<Account, Cents>;
  for (const a of ACCOUNTS) out[a] = state.ledger.broughtForward[a] ?? 0;
  for (const entry of state.ledger.journal) {
    for (const line of entry.lines) out[line.account] += line.amount;
  }
  for (const a of ACCOUNTS) assertCents(out[a], `balance of ${a}`);
  return out;
}

export const cashBalance = (state: GameState): Cents => balances(state).cash;

export function incomeStatement(entries: readonly JournalEntry[]): IncomeStatement {
  const t: Record<Account, Cents> = Object.fromEntries(ACCOUNTS.map((a) => [a, 0])) as Record<Account, Cents>;
  for (const e of entries) for (const l of e.lines) t[l.account] += l.amount;
  const revenue = 0 - t.salesRevenue;
  const otherIncome = 0 - t.otherIncome;
  const cogs = t.cogs;
  const grossProfit = revenue - cogs;
  const expenses = {
    wages: t.wages,
    rent: t.rent,
    utilities: t.utilities,
    depreciation: t.depreciation,
    interest: t.interest,
    training: t.training,
    repairs: t.repairs,
    marketing: t.marketing,
    otherExpense: t.otherExpense,
  };
  const totalExpenses = Object.values(expenses).reduce((a, b) => a + b, 0);
  return {
    revenue,
    otherIncome,
    cogs,
    grossProfit,
    ...expenses,
    totalExpenses,
    netIncome: grossProfit + otherIncome - totalExpenses,
  };
}

export const storeEntries = (entries: readonly JournalEntry[], storeId: string) => entries.filter((e) => e.storeId === storeId);

const INCOME_ACCOUNTS: readonly Account[] = [
  'salesRevenue', 'otherIncome', 'cogs', 'wages', 'rent', 'utilities', 'depreciation',
  'interest', 'training', 'repairs', 'marketing', 'otherExpense',
];

export function balanceSheet(state: GameState): BalanceSheet {
  const b = balances(state);
  // Dividends are paid out of retained earnings, so they reduce it directly.
  const retainedEarnings = -INCOME_ACCOUNTS.reduce((sum, a) => sum + b[a], 0) - b.dividends;
  const totalAssets = b.cash + b.equipment + b.accumDepreciation + b.inventory + b.farmland + b.investments + b.realEstate;
  const loans = -b.loans;
  const ownerCapital = -b.ownerCapital;
  const shareCapital = -b.shareCapital;
  return {
    cash: b.cash,
    equipmentAtCost: b.equipment,
    accumDepreciation: b.accumDepreciation,
    inventory: b.inventory,
    farmland: b.farmland,
    investments: b.investments,
    realEstate: b.realEstate,
    totalAssets,
    loans,
    totalLiabilities: loans,
    ownerCapital,
    shareCapital,
    retainedEarnings,
    totalEquity: ownerCapital + shareCapital + retainedEarnings,
  };
}

export function cashFlow(entries: readonly JournalEntry[], openingCash: Cents): CashFlow {
  const flows = { operating: 0, investing: 0, financing: 0 };
  for (const e of entries) {
    for (const l of e.lines) if (l.account === 'cash') flows[e.kind] += l.amount;
  }
  return {
    openingCash,
    ...flows,
    closingCash: openingCash + flows.operating + flows.investing + flows.financing,
  };
}

export function currentWeekStatements(state: GameState) {
  return {
    income: incomeStatement(state.ledger.journal),
    balance: balanceSheet(state),
    cashFlow: cashFlow(state.ledger.journal, state.ledger.weekOpeningCash),
  };
}

// Closing the books folds this week's entries into brought-forward balances so saves stay small.
export function foldJournal(state: GameState): void {
  const b = balances(state);
  state.ledger.broughtForward = { ...b };
  state.ledger.journal = [];
  state.ledger.weekOpeningCash = b.cash;
}

export function ledgerIsBalanced(state: GameState): boolean {
  const b = balances(state);
  const total = ACCOUNTS.reduce((sum, a) => sum + b[a], 0);
  return total === 0 && state.ledger.journal.every((e) => e.lines.reduce((s, l) => s + l.amount, 0) === 0);
}
