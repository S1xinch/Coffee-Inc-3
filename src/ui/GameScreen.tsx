import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CLOSE_HOUR, OPEN_HOUR } from '../sim/catalog';
import type { Command } from '../sim/commands';
import { SPEEDS, clockInfo, formatTime, type Speed } from '../sim/clock';
import { cashBalance } from '../sim/ledger';
import { formatMoney } from '../sim/money';
import type { GameState } from '../sim/state';
import { isOpenHour, readiness } from '../sim/store';
import { exportSave, readImportFile } from '../persistence/storage';
import { BuildIcon, CupIcon, FinanceIcon, GearIcon, PauseIcon, PlayIcon, StaffIcon, StoreIcon } from './Icons';
import { GameUiContext, type GameUi, type TabId } from './context';
import { AwayModal, CatchUpOverlay, ConfirmModal, FileButton, Modal, Toast, WeekReportModal, type ConfirmRequest } from './overlays';
import { readPref, writePref } from './prefs';
import { StoreView } from './StoreView';
import { BuildTab } from './tabs/BuildTab';
import { FinanceTab } from './tabs/FinanceTab';
import { MenuTab } from './tabs/MenuTab';
import { StaffTab } from './tabs/StaffTab';
import { StoreTab } from './tabs/StoreTab';
import { useGame, useProgress, type ProgressStore } from './useGame';

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: 'store', label: 'Store', icon: <StoreIcon /> },
  { id: 'menu', label: 'Menu', icon: <CupIcon /> },
  { id: 'staff', label: 'Staff', icon: <StaffIcon /> },
  { id: 'build', label: 'Build', icon: <BuildIcon /> },
  { id: 'finance', label: 'Finance', icon: <FinanceIcon /> },
];

function Clock({ hour, progress }: { hour: number; progress: ProgressStore }) {
  const p = useProgress(progress);
  const c = clockInfo(hour);
  const minutes = Math.min(50, Math.floor((p * 60) / 10) * 10);
  return (
    <div className="clock">
      <span className="clock-day">
        Week {c.week} · {c.dayName}
      </span>
      <span className="clock-time num">{formatTime(c.hourOfDay, minutes)}</span>
    </div>
  );
}

function SpeedControls({ speed, onChange }: { speed: Speed; onChange: (s: Speed) => void }) {
  return (
    <div className="speed" role="group" aria-label="Game speed">
      {SPEEDS.map((s) => (
        <button key={s} aria-pressed={speed === s} aria-label={s === 0 ? 'Pause' : `Speed ${s}x`} className={speed === s ? 'on' : ''} onClick={() => onChange(s)}>
          {s === 0 ? <PauseIcon /> : <PlayIcon count={s === 1 ? 1 : s === 2 ? 2 : 3} />}
        </button>
      ))}
    </div>
  );
}

function StageStatus({ state, speed }: { state: GameState; speed: Speed }) {
  const hod = state.hour % 24;
  const ready = readiness(state).ready;
  let text: string;
  let tone: 'good' | 'warn' | 'idle';
  if (speed === 0) {
    text = state.reports.length === 0 && state.lifetime.served === 0 ? 'Paused · Press play to start the clock' : 'Paused';
    tone = 'idle';
  } else if (!state.store.open) {
    text = 'Closed by you';
    tone = 'warn';
  } else if (!isOpenHour(hod)) {
    text = `Closed · Opens ${formatTime(OPEN_HOUR)}`;
    tone = 'idle';
  } else if (!ready) {
    text = 'Not ready to open';
    tone = 'warn';
  } else {
    text = `Open until ${formatTime(CLOSE_HOUR)} · ${state.lastHour?.served ?? 0} served last hour`;
    tone = 'good';
  }
  return <div className={`stage-status ${tone}`}>{text}</div>;
}

interface Props {
  initial: GameState;
  savedAtMs: number;
  startPaused: boolean;
  onImported: (state: GameState, savedAtMs: number) => void;
  onNewCompany: () => void;
}

export function GameScreen({ initial, savedAtMs, startPaused, onImported, onNewCompany: startOver }: Props) {
  const game = useGame(initial, savedAtMs, startPaused);
  const onNewCompany = () => {
    game.stopSaving();
    startOver();
  };
  const [tab, setTab] = useState<TabId>('store');
  const [toast, setToast] = useState<string | null>(null);
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pauseOnReport, setPauseOnReportState] = useState(() => readPref('pauseOnReport', true));
  const { state, send, setSpeed } = game;

  const act = useCallback(
    async (command: Command) => {
      const error = await send(command);
      if (error) setToast(error);
      return !error;
    },
    [send],
  );

  const confirm = useCallback(
    (options: Omit<ConfirmRequest, 'resolve'>) =>
      new Promise<boolean>((resolve) => {
        setConfirmReq({
          ...options,
          resolve: (ok) => {
            setConfirmReq(null);
            resolve(ok);
          },
        });
      }),
    [],
  );

  const ui = useMemo<GameUi | null>(() => (state ? { state, act, goTo: setTab, confirm } : null), [state, act, confirm]);
  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    document.title = state ? `${state.companyName} · Coffee Inc 3` : 'Coffee Inc 3';
  }, [state]);

  if (game.fatal) {
    return (
      <Modal title="The simulation hit a problem">
        <p>Your company is safe at its last good moment. Export a copy of your save, then reload the app.</p>
        <p className="muted small">{game.fatal}</p>
        <div className="dialog-actions">
          {state && (
            <button className="btn" onClick={() => exportSave(state)}>
              Export save
            </button>
          )}
          <button className="btn btn-primary" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      </Modal>
    );
  }

  if (!state || !ui) {
    return game.catchup ? <CatchUpOverlay done={game.catchup.done} total={game.catchup.total} /> : <div className="loading">Opening the store…</div>;
  }

  const latestReport = state.reports.at(-1);
  const showReport = !game.away && !game.catchup && latestReport && latestReport.week > state.lastSeenReportWeek;
  const cash = cashBalance(state);

  const ackReport = async (then: 'continue' | 'statements') => {
    if (!latestReport) return;
    await send({ type: 'ackReport', week: latestReport.week });
    if (then === 'statements') setTab('finance');
    if (game.speed === 0) setSpeed(1);
  };

  return (
    <GameUiContext.Provider value={ui}>
      <div className="game">
        <header className="topbar">
          <div className="topbar-money">
            <span className="company">{state.companyName}</span>
            <span className={`cash num ${cash < 0 ? 'neg' : ''}`}>{formatMoney(cash)}</span>
          </div>
          <Clock hour={state.hour} progress={game.progress} />
          <button className="btn btn-icon btn-quiet" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
            <GearIcon />
          </button>
        </header>

        <div className="game-body">
          <section className="stage">
            <StoreView state={state} speed={game.speed} />
            <StageStatus state={state} speed={game.speed} />
            <SpeedControls speed={game.speed} onChange={setSpeed} />
          </section>

          <section className="panel">
            <nav className="tabbar" aria-label="Sections">
              {TABS.map((t) => (
                <button key={t.id} className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
                  {t.icon}
                  <span>{t.label}</span>
                  {t.id === 'store' && state.incidents.length > 0 && <span className="badge">{state.incidents.length}</span>}
                </button>
              ))}
            </nav>
            <div className="panel-scroll" key={tab}>
              {tab === 'store' && <StoreTab saveError={game.saveError} />}
              {tab === 'menu' && <MenuTab />}
              {tab === 'staff' && <StaffTab />}
              {tab === 'build' && <BuildTab />}
              {tab === 'finance' && <FinanceTab />}
            </div>
          </section>
        </div>

        {toast && <Toast message={toast} onDone={clearToast} />}
        {game.catchup && <CatchUpOverlay done={game.catchup.done} total={game.catchup.total} />}
        {game.away && <AwayModal summary={game.away} onClose={game.dismissAway} />}
        {showReport && (
          <WeekReportModal report={latestReport} previous={state.reports.at(-2)} onContinue={() => ackReport('continue')} onStatements={() => ackReport('statements')} />
        )}
        {confirmReq && <ConfirmModal request={confirmReq} />}

        {state.bankrupt && (
          <Modal title="Bankrupt">
            <p>
              {state.companyName} ran out of cash for too long and the bank closed the doors. You served {state.lifetime.served.toLocaleString('en-US')} customers along the way.
            </p>
            <div className="dialog-actions">
              <button className="btn" onClick={() => exportSave(state)}>
                Export save
              </button>
              <button className="btn btn-primary" onClick={onNewCompany}>
                Start a new company
              </button>
            </div>
          </Modal>
        )}

        {settingsOpen && (
          <Modal title="Settings" onClose={() => setSettingsOpen(false)}>
            <label className="setting">
              <input
                type="checkbox"
                checked={pauseOnReport}
                onChange={(e) => {
                  setPauseOnReportState(e.target.checked);
                  writePref('pauseOnReport', e.target.checked);
                  game.setPauseOnReport(e.target.checked);
                }}
              />
              <span>Pause when a week ends</span>
            </label>
            <h3 className="setting-head">Your save</h3>
            <p className="muted small">
              Progress is saved on this device automatically. Safari can clear website data for apps you have not opened in a while, so export a copy now and then.
            </p>
            <div className="row-actions">
              <button className="btn" onClick={() => exportSave(state)}>
                Export save
              </button>
              <FileButton
                label="Import save"
                onFile={async (file) => {
                  const r = await readImportFile(file);
                  if (!r.ok) {
                    setToast(r.error);
                    return;
                  }
                  const ok = await confirm({ title: 'Replace your current company?', body: `This loads ${r.save.state.companyName} and replaces what is running now.`, confirmLabel: 'Load save', danger: true });
                  if (ok) {
                    game.stopSaving();
                    setSettingsOpen(false);
                    onImported(r.save.state, r.save.savedAtMs);
                  }
                }}
              />
            </div>
            <h3 className="setting-head">Start over</h3>
            <div className="row-actions">
              <button
                className="btn btn-danger"
                onClick={async () => {
                  const ok = await confirm({ title: 'Start a new company?', body: 'Your current company will be deleted from this device. Export it first if you want to keep it.', confirmLabel: 'Delete and start over', danger: true });
                  if (ok) onNewCompany();
                }}
              >
                New company
              </button>
            </div>
            <p className="legal-links small">
              <a href="/privacy.html">Privacy Policy</a>
              <a href="/terms.html">Terms and Conditions</a>
              <span className="muted">Version {__APP_VERSION__}</span>
            </p>
          </Modal>
        )}
      </div>
    </GameUiContext.Provider>
  );
}
