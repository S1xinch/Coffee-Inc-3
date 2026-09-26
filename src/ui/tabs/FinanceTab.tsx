import { useState } from 'react';
import { LOAN_APR, LOAN_STEP } from '../../sim/catalog';
import { clockInfo } from '../../sim/clock';
import { currentWeekStatements } from '../../sim/ledger';
import type { IncomeStatement } from '../../sim/state';
import { loanBalance, loanLimit } from '../../sim/store';
import { Card, Money } from '../bits';
import { useGameUi } from '../context';
import { ProfitChart } from './ProfitChart';

type View = 'income' | 'balance' | 'cash' | 'history';

function Row({ label, cents, strong = false, indent = false }: { label: string; cents: number; strong?: boolean; indent?: boolean }) {
  return (
    <tr className={strong ? 'strong' : ''}>
      <th scope="row" className={indent ? 'indent' : ''}>
        {label}
      </th>
      <td>
        <Money cents={cents} />
      </td>
    </tr>
  );
}

function IncomeTable({ s }: { s: IncomeStatement }) {
  return (
    <table className="fin">
      <tbody>
        <Row label="Sales" cents={s.revenue} />
        <Row label="Cost of goods" cents={-s.cogs} indent />
        <Row label="Gross profit" cents={s.grossProfit} strong />
        <Row label="Wages" cents={-s.wages} indent />
        <Row label="Rent" cents={-s.rent} indent />
        <Row label="Utilities" cents={-s.utilities} indent />
        <Row label="Depreciation" cents={-s.depreciation} indent />
        <Row label="Loan interest" cents={-s.interest} indent />
        <Row label="Training" cents={-s.training} indent />
        <Row label="Repairs" cents={-s.repairs} indent />
        <Row label="Marketing" cents={-s.marketing} indent />
        <Row label="Other expenses" cents={-s.otherExpense} indent />
        {s.otherIncome !== 0 && <Row label="Other income" cents={s.otherIncome} indent />}
        <Row label="Net income" cents={s.netIncome} strong />
      </tbody>
    </table>
  );
}

export function FinanceTab() {
  const { state, act } = useGameUi();
  const [view, setView] = useState<View>('income');
  const now = currentWeekStatements(state);
  const week = clockInfo(state.hour).week;
  const loan = loanBalance(state);
  const limit = loanLimit(state);
  const b = now.balance;

  return (
    <div className="stack">
      <div className="segmented" role="tablist" aria-label="Financial statements">
        {(
          [
            ['income', 'Income'],
            ['balance', 'Balance sheet'],
            ['cash', 'Cash flow'],
            ['history', 'History'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={view === id} className={view === id ? 'on' : ''} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>

      {view === 'income' && (
        <Card title={`Income statement, week ${week} so far`}>
          <IncomeTable s={now.income} />
          <p className="muted small">Rent, depreciation, and interest are booked when the week closes on Sunday at midnight.</p>
        </Card>
      )}

      {view === 'balance' && (
        <Card title="Balance sheet">
          <table className="fin">
            <tbody>
              <Row label="Cash" cents={b.cash} indent />
              <Row label="Equipment at cost" cents={b.equipmentAtCost} indent />
              <Row label="Accumulated depreciation" cents={b.accumDepreciation} indent />
              <Row label="Total assets" cents={b.totalAssets} strong />
              <Row label="Bank loans" cents={b.loans} indent />
              <Row label="Total liabilities" cents={b.totalLiabilities} strong />
              <Row label="Owner capital" cents={b.ownerCapital} indent />
              <Row label="Retained earnings" cents={b.retainedEarnings} indent />
              <Row label="Total equity" cents={b.totalEquity} strong />
            </tbody>
          </table>
          <p className={`small ${b.totalAssets === b.totalLiabilities + b.totalEquity ? 'muted' : 'neg'}`}>
            Assets equal liabilities plus equity: {b.totalAssets === b.totalLiabilities + b.totalEquity ? 'yes' : 'no'}.
          </p>
        </Card>
      )}

      {view === 'cash' && (
        <Card title={`Cash flow, week ${week} so far`}>
          <table className="fin">
            <tbody>
              <Row label="Cash at start of week" cents={now.cashFlow.openingCash} />
              <Row label="From operations" cents={now.cashFlow.operating} indent />
              <Row label="From investing" cents={now.cashFlow.investing} indent />
              <Row label="From financing" cents={now.cashFlow.financing} indent />
              <Row label="Cash now" cents={now.cashFlow.closingCash} strong />
            </tbody>
          </table>
        </Card>
      )}

      {view === 'history' && (
        <Card title="Weekly results">
          <ProfitChart reports={state.reports} />
          {state.reports.length > 0 && (
            <table className="fin history">
              <thead>
                <tr>
                  <th scope="col">Week</th>
                  <th scope="col">Sales</th>
                  <th scope="col">Net income</th>
                  <th scope="col">Served</th>
                </tr>
              </thead>
              <tbody>
                {state.reports
                  .slice(-12)
                  .reverse()
                  .map((r) => (
                    <tr key={r.week}>
                      <th scope="row">{r.week}</th>
                      <td>
                        <Money cents={r.income.revenue} />
                      </td>
                      <td>
                        <Money cents={r.income.netIncome} signed />
                      </td>
                      <td className="num">{r.customersServed.toLocaleString('en-US')}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      <Card title="Bank">
        <table className="fin">
          <tbody>
            <Row label="Loan balance" cents={loan} />
            <Row label="Credit limit" cents={limit} />
            <Row label="Interest per week" cents={Math.round((loan * LOAN_APR) / 52)} />
          </tbody>
        </table>
        <p className="muted small">
          {Math.round(LOAN_APR * 100)}% a year, charged weekly. The limit grows with your reputation.
        </p>
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
      </Card>
    </div>
  );
}
