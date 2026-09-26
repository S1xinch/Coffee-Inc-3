import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { lot } from '../sim/city';
import { formatMoney } from '../sim/money';
import type { WeekReport } from '../sim/state';
import type { ProgressSummary } from '../sim/summary';
import { CloseIcon } from './Icons';
import { Money, plural } from './bits';

export function Modal({ title, children, onClose, wide = false, sheet = false }: { title: string; children: ReactNode; onClose?: () => void; wide?: boolean; sheet?: boolean }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button, [href], input')?.focus();
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={`backdrop ${sheet ? 'sheet-backdrop' : ''}`} onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`dialog ${wide ? 'wide' : ''} ${sheet ? 'sheet' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id} ref={ref}>
        <header className="dialog-head">
          <h2 id={id}>{title}</h2>
          {onClose && (
            <button className="btn btn-icon btn-quiet" aria-label="Close" onClick={onClose}>
              <CloseIcon />
            </button>
          )}
        </header>
        {children}
      </div>
    </div>
  );
}

export function WeekReportModal({ report, previous, onContinue, onStatements }: { report: WeekReport; previous?: WeekReport; onContinue: () => void; onStatements: () => void }) {
  const repChange = previous ? report.reputation - previous.reputation : 0;
  return (
    <Modal title={`Week ${report.week} results`} onClose={onContinue}>
      <div className="report-hero">
        <span className="muted small">Net income</span>
        <span className={`hero-num ${report.income.netIncome >= 0 ? 'pos' : 'neg'}`}>{formatMoney(report.income.netIncome)}</span>
      </div>
      <table className="fin">
        <tbody>
          <tr>
            <th scope="row">Sales</th>
            <td><Money cents={report.income.revenue} /></td>
          </tr>
          <tr>
            <th scope="row">Expenses</th>
            <td><Money cents={-(report.income.cogs + report.income.totalExpenses)} /></td>
          </tr>
          <tr>
            <th scope="row">Customers served</th>
            <td className="num">{report.customersServed.toLocaleString('en-US')}</td>
          </tr>
          <tr>
            <th scope="row">Walked out</th>
            <td className="num">{report.customersLost.toLocaleString('en-US')}</td>
          </tr>
          <tr>
            <th scope="row">Reputation</th>
            <td className="num">
              {Math.round(report.reputation)}
              {previous && ` (${repChange >= 0 ? '+' : ''}${repChange.toFixed(1)})`}
            </td>
          </tr>
          <tr className="strong">
            <th scope="row">Cash</th>
            <td><Money cents={report.balance.cash} /></td>
          </tr>
        </tbody>
      </table>
      {report.stores.length > 1 && (
        <table className="fin">
          <thead>
            <tr>
              <th scope="col">Store</th>
              <th scope="col">Sales</th>
              <th scope="col">Net income</th>
            </tr>
          </thead>
          <tbody>
            {report.stores.map((r) => (
              <tr key={r.storeId}>
                <th scope="row">{lot(r.lotId).address}</th>
                <td>{formatMoney(r.revenue)}</td>
                <td>{formatMoney(r.netIncome)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="dialog-actions">
        <button className="btn" onClick={onStatements}>Statements</button>
        <button className="btn btn-primary" onClick={onContinue}>Continue</button>
      </div>
    </Modal>
  );
}

function duration(hours: number): string {
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  if (days === 0) return plural(rest, 'hour');
  return rest === 0 ? plural(days, 'day') : `${plural(days, 'day')} and ${plural(rest, 'hour')}`;
}

export function AwayModal({ summary, onClose }: { summary: ProgressSummary; onClose: () => void }) {
  return (
    <Modal title="While you were away" onClose={onClose}>
      <p>Your company kept running for {duration(summary.hours)} of game time.</p>
      <table className="fin">
        <tbody>
          <tr>
            <th scope="row">Customers served</th>
            <td className="num">{summary.served.toLocaleString('en-US')}</td>
          </tr>
          <tr>
            <th scope="row">Sales</th>
            <td><Money cents={summary.revenue} /></td>
          </tr>
          <tr className="strong">
            <th scope="row">Change in cash</th>
            <td><Money cents={summary.cashChange} signed /></td>
          </tr>
          {summary.weeksClosed > 0 && (
            <tr>
              <th scope="row">Weeks closed</th>
              <td className="num">{summary.weeksClosed}</td>
            </tr>
          )}
          {summary.incidentsAutoResolved > 0 && (
            <tr>
              <th scope="row">Situations handled for you</th>
              <td className="num">{summary.incidentsAutoResolved}</td>
            </tr>
          )}
          {summary.staffQuit > 0 && (
            <tr>
              <th scope="row">Staff who quit</th>
              <td className="num neg">{summary.staffQuit}</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="muted small">Time away runs at one game day per real hour, up to two game weeks. Check the Activity log for details.</p>
      <div className="dialog-actions">
        <button className="btn btn-primary" onClick={onClose}>Back to work</button>
      </div>
    </Modal>
  );
}

export function CatchUpOverlay({ done, total }: { done: number; total: number }) {
  return (
    <div className="backdrop">
      <div className="dialog" role="status" aria-live="polite">
        <h2>Catching up</h2>
        <p className="muted">Running your store for the time you were away.</p>
        <div className="meter big" aria-hidden="true">
          <div className="meter-fill good" style={{ width: `${(done / Math.max(1, total)) * 100}%` }} />
        </div>
        <p className="small num">
          {Math.floor(done / 24)} of {Math.ceil(total / 24)} days
        </p>
      </div>
    </div>
  );
}

export interface ConfirmRequest {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

export function ConfirmModal({ request }: { request: ConfirmRequest }) {
  return (
    <Modal title={request.title} onClose={() => request.resolve(false)}>
      <p>{request.body}</p>
      <div className="dialog-actions">
        <button className="btn" onClick={() => request.resolve(false)}>Cancel</button>
        <button className={`btn ${request.danger ? 'btn-danger-solid' : 'btn-primary'}`} onClick={() => request.resolve(true)}>
          {request.confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [message, onDone]);
  return (
    <div className="toast" role="alert">
      {message}
    </div>
  );
}

export function FileButton({ label, onFile, className = 'btn' }: { label: string; onFile: (file: File) => void; className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [key, setKey] = useState(0);
  return (
    <>
      <button className={className} onClick={() => ref.current?.click()}>
        {label}
      </button>
      <input
        key={key}
        ref={ref}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          setKey((k) => k + 1);
        }}
      />
    </>
  );
}
