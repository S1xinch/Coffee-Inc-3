import { useState } from 'react';
import { LOAN_APR, LOAN_STEP } from '../../sim/catalog';
import { clockInfo } from '../../sim/clock';
import { lot } from '../../sim/city';
import { currentWeekStatements, incomeStatement, storeEntries } from '../../sim/ledger';
import { formatMoney } from '../../sim/money';
import type { BalanceSheet, CashFlow, GameState, IncomeStatement } from '../../sim/state';
import { loanBalance, loanLimit } from '../../sim/store';
import { Money } from '../bits';
import { useGameUi } from '../context';
import { NET_COLOR, ProfitChart, REVENUE_COLOR } from './ProfitChart';

type View = 'income' | 'balance' | 'cash';

interface Column {
  label: string;
  income?: IncomeStatement;
  balance?: BalanceSheet;
  cash?: CashFlow;
}

function Rows({ rows, columns, pick }: { rows: [string, (c: Column) => number | undefined, 'total'?][]; columns: Column[]; pick: 'income' | 'balance' | 'cash' }) {
  const shown = columns.filter((c) => c[pick]);
  return (
    <>
      {rows.map(([label, get, kind]) => (
        <tr key={label} className={kind ?? ''}>
          <th scope="row">{label}</th>
          {shown.map((c) => {
            const v = get(c);
            return <td key={c.label}>{v === undefined ? '' : formatMoney(v)}</td>;
          })}
        </tr>
      ))}
    </>
  );
}

function change(now: number, before: number | undefined): string {
  if (before === undefined) return '';
  const diff = now - before;
  const pct = before !== 0 ? ` (${diff >= 0 ? '+' : ''}${Math.round((diff / Math.abs(before)) * 100)}%)` : '';
  return `${diff >= 0 ? '+' : ''}${formatMoney(diff)}${pct} vs week before`;
}

// Each store's own books this week, plus last week's net income from the weekly report.
function ByStore({ state }: { state: GameState }) {
  if (state.stores.length < 2) return null;
  const last = state.reports.at(-1);
  const company = incomeStatement(state.ledger.journal.filter((e) => e.storeId === null));
  return (
    <>
      <h2 className="section-title">By store</h2>
      <table className="fin">
        <thead>
          <tr>
            <th scope="col">This week so far</th>
            <th scope="col">Sales</th>
            <th scope="col">Net income</th>
            {last && <th scope="col">Last week</th>}
          </tr>
        </thead>
        <tbody>
          {state.stores.map((s) => {
            const own = incomeStatement(storeEntries(state.ledger.journal, s.id));
            const prev = last?.stores.find((r) => r.storeId === s.id);
            return (
              <tr key={s.id}>
                <th scope="row">{lot(s.lotId).address}</th>
                <td>{formatMoney(own.revenue)}</td>
                <td>{formatMoney(own.netIncome)}</td>
                {last && <td>{prev ? formatMoney(prev.netIncome) : 'New'}</td>}
              </tr>
            );
          })}
          <tr>
            <th scope="row">Company (loan interest)</th>
            <td />
            <td>{formatMoney(company.netIncome)}</td>
            {last && <td />}
          </tr>
        </tbody>
      </table>
    </>
  );
}

export function FinanceTab() {
  const { state, act } = useGameUi();
  const [view, setView] = useState<View>('income');
  const now = currentWeekStatements(state);
  const week = clockInfo(state.hour).week;
  const last = state.reports.at(-1);
  const prev = state.reports.at(-2);
  const loan = loanBalance(state);
  const limit = loanLimit(state);
  const hero = last ?? { income: now.income, week };

  const columns: Column[] = [
    ...(last ? [{ label: `Week ${last.week}`, income: last.income, balance: last.balance, cash: last.cashFlow }] : []),
    { label: `Week ${week} so far`, income: now.income, balance: now.balance, cash: now.cashFlow },
  ];

  return (
    <div className="stack">
      <div className="fin-hero">
        <div>
          <span className="label">
            <span className="swatch-dot" style={{ background: REVENUE_COLOR }} /> Revenue, week {hero.week}
          </span>
          <span className="big">{formatMoney(hero.income.revenue)}</span>
          <span className="change">{change(hero.income.revenue, prev?.income.revenue)}</span>
        </div>
        <div>
          <span className="label">
            <span className="swatch-dot" style={{ background: NET_COLOR }} /> Net income
          </span>
          <span className={`big ${hero.income.netIncome >= 0 ? 'blue' : 'neg'}`}>{formatMoney(hero.income.netIncome)}</span>
          <span className="change">{change(hero.income.netIncome, prev?.income.netIncome)}</span>
        </div>
      </div>

      <ProfitChart reports={state.reports} />

      <ByStore state={state} />

      <div className="segmented" role="tablist" aria-label="Financial statements">
        {(
          [
            ['income', 'Income'],
            ['balance', 'Balance sheet'],
            ['cash', 'Cash flow'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={view === id} className={view === id ? 'on' : ''} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>

      {view === 'income' && (
        <table className="fin">
          <thead>
            <tr>
              <th scope="col">Revenues</th>
              {columns.map((c) => (
                <th scope="col" key={c.label}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Rows
              pick="income"
              columns={columns}
              rows={[
                ['Coffee and pastries', (c) => c.income?.revenue],
                ['Other income', (c) => c.income?.otherIncome],
                ['Total revenues', (c) => (c.income ? c.income.revenue + c.income.otherIncome : undefined), 'total'],
              ]}
            />
            <tr>
              <th scope="colgroup" colSpan={columns.length + 1} className="fin-section">
                Expenses
              </th>
            </tr>
            <Rows
              pick="income"
              columns={columns}
              rows={[
                ['Cost of goods sold', (c) => c.income?.cogs],
                ['Salaries', (c) => c.income?.wages],
                ['Rent', (c) => c.income?.rent],
                ['Utilities', (c) => c.income?.utilities],
                ['Marketing', (c) => c.income?.marketing],
                ['Depreciation', (c) => c.income?.depreciation],
                ['Loan interest', (c) => c.income?.interest],
                ['Training', (c) => c.income?.training],
                ['Repairs', (c) => c.income?.repairs],
                ['Other expenses', (c) => c.income?.otherExpense],
                ['Total expenses', (c) => (c.income ? c.income.cogs + c.income.totalExpenses : undefined), 'total'],
                ['Net income', (c) => c.income?.netIncome, 'total'],
              ]}
            />
          </tbody>
        </table>
      )}

      {view === 'balance' && (
        <table className="fin">
          <thead>
            <tr>
              <th scope="col">Assets</th>
              {columns.map((c) => (
                <th scope="col" key={c.label}>
                  {c.label === `Week ${week} so far` ? 'Now' : `End of ${c.label.toLowerCase()}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Rows
              pick="balance"
              columns={columns}
              rows={[
                ['Cash', (c) => c.balance?.cash],
                ['Equipment at cost', (c) => c.balance?.equipmentAtCost],
                ['Accumulated depreciation', (c) => c.balance?.accumDepreciation],
                ['Total assets', (c) => c.balance?.totalAssets, 'total'],
                ['Bank loans', (c) => c.balance?.loans],
                ['Owner capital', (c) => c.balance?.ownerCapital],
                ['Retained earnings', (c) => c.balance?.retainedEarnings],
                ['Liabilities and equity', (c) => (c.balance ? c.balance.totalLiabilities + c.balance.totalEquity : undefined), 'total'],
              ]}
            />
          </tbody>
        </table>
      )}

      {view === 'cash' && (
        <table className="fin">
          <thead>
            <tr>
              <th scope="col">Cash flow</th>
              {columns.map((c) => (
                <th scope="col" key={c.label}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Rows
              pick="cash"
              columns={columns}
              rows={[
                ['Cash at start', (c) => c.cash?.openingCash],
                ['From operations', (c) => c.cash?.operating],
                ['From investing', (c) => c.cash?.investing],
                ['From financing', (c) => c.cash?.financing],
                ['Cash at end', (c) => c.cash?.closingCash, 'total'],
              ]}
            />
          </tbody>
        </table>
      )}

      <h2 className="section-title">Bank</h2>
      <table className="fin">
        <tbody>
          <tr>
            <th scope="row">Loan balance</th>
            <td>
              <Money cents={loan} />
            </td>
          </tr>
          <tr>
            <th scope="row">Credit limit</th>
            <td>
              <Money cents={limit} />
            </td>
          </tr>
          <tr>
            <th scope="row">Interest per week</th>
            <td>
              <Money cents={Math.round((loan * LOAN_APR) / 52)} />
            </td>
          </tr>
        </tbody>
      </table>
      <p className="muted small">{Math.round(LOAN_APR * 100)}% a year, charged weekly. The limit grows with your reputation and with every store you run.</p>
      <div className="row-actions">
        <button className="btn btn-small btn-primary" disabled={loan + LOAN_STEP > limit} onClick={() => act({ type: 'takeLoan', amount: LOAN_STEP })}>
          Borrow <Money cents={LOAN_STEP} />
        </button>
        <button className="btn btn-small" disabled={loan === 0} onClick={() => act({ type: 'repayLoan', amount: Math.min(LOAN_STEP, loan) })}>
          Repay <Money cents={Math.min(LOAN_STEP, loan || LOAN_STEP)} />
        </button>
        <button className="btn btn-small" disabled={loan === 0} onClick={() => act({ type: 'repayLoan', amount: loan })}>
          Repay all
        </button>
      </div>
    </div>
  );
}
