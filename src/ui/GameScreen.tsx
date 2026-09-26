import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CITY_NAME, NEIGHBORHOODS, neighborhood } from '../sim/catalog';
import type { Command } from '../sim/commands';
import { calendarDate, clockInfo, formatTime, type Speed } from '../sim/clock';
import { incidentDef, incidentStaff } from '../sim/incidents';
import { cashBalance } from '../sim/ledger';
import { formatMoney } from '../sim/money';
import type { GameState } from '../sim/state';
import { exportSave, readImportFile } from '../persistence/storage';
import { BrandMark, Portrait } from './Brand';
import { CityView } from './CityView';
import { Money } from './bits';
import { GameUiContext, type GameUi, type SheetId, type TabId } from './context';
import { AwayModal, CatchUpOverlay, ConfirmModal, FileButton, Modal, Toast, WeekReportModal, type ConfirmRequest } from './overlays';
import { readPref, writePref } from './prefs';
import { SpeedControls, StoreScreen } from './StoreScreen';
import { BuildTab } from './tabs/BuildTab';
import { StaffTab } from './tabs/StaffTab';
import { useGame, useProgress, type ProgressStore } from './useGame';

function DateChip({ hour, progress }: { hour: number; progress: ProgressStore }) {
  const p = useProgress(progress);
  const c = clockInfo(hour);
  const minutes = Math.min(50, Math.floor((p * 60) / 10) * 10);
  return (
    <div className="chip date-chip">
      <span className="chip-sub num">
        {c.dayName} {formatTime(c.hourOfDay, minutes)}
      </span>
      <span className="chip-main">{calendarDate(hour)}</span>
    </div>
  );
}

const MenuIcon = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

const PinIcon = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.3" />
  </svg>
);

function IncidentModal({ state, incidentId, onChoose, onLater }: { state: GameState; incidentId: string; onChoose: (option: number) => void; onLater: () => void }) {
  const incident = state.incidents.find((i) => i.id === incidentId);
  if (!incident) return null;
  const def = incidentDef(incident.defId);
  const staff = incidentStaff(state, incident);
  const speaker = staff ?? state.staff[0];
  return (
    <Modal title={def.title} onClose={onLater}>
      <div className="dialogue in-modal">
        <Portrait look={speaker?.look ?? 57} size={44} />
        <p>
          <strong>{speaker ? speaker.name.split(' ')[0] : 'Your assistant'}</strong>
          <span>{def.text(staff?.name ?? 'A barista')}</span>
        </p>
      </div>
      <div className="choices">
        {def.options.map((o, i) => (
          <button key={o.label} className="choice" onClick={() => onChoose(i)}>
            <span className="choice-label">
              {o.label}
              {o.cost > 0 && (
                <>
                  {' '}
                  (<Money cents={o.cost} />)
                </>
              )}
            </span>
            <span className="choice-detail">{o.detail}</span>
          </button>
        ))}
      </div>
      <div className="dialog-actions">
        <button className="btn btn-quiet" onClick={onLater}>
          Decide later
        </button>
      </div>
    </Modal>
  );
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
  const [view, setView] = useState<'city' | 'store'>(startPaused ? 'store' : 'city');
  const [tab, setTab] = useState<TabId>('service');
  const [sheet, setSheet] = useState<SheetId | null>(null);
  const [lot, setLot] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [popup, setPopup] = useState<string | null>(null);
  const [pauseOnReport, setPauseOnReportState] = useState(() => readPref('pauseOnReport', true));
  const seenIncidents = useRef(new Set<string>());
  const resumeSpeed = useRef<Speed | null>(null);
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

  const goTo = useCallback((t: TabId) => {
    setSheet(null);
    setView('store');
    setTab(t);
  }, []);

  const ui = useMemo<GameUi | null>(() => (state ? { state, act, goTo, openSheet: setSheet, confirm } : null), [state, act, goTo, confirm]);
  const clearToast = useCallback(() => setToast(null), []);

  const latestReport = state?.reports.at(-1);
  const showReport = !!state && !game.away && !game.catchup && !!latestReport && latestReport.week > state.lastSeenReportWeek;

  // New incidents pop up once, like Coffee Inc 2's prompts, and pause the clock while you decide.
  useEffect(() => {
    if (!state || popup || game.away || game.catchup || showReport || state.bankrupt) return;
    const next = state.incidents.find((i) => !seenIncidents.current.has(i.id));
    if (!next) return;
    seenIncidents.current.add(next.id);
    resumeSpeed.current = game.speed;
    if (game.speed !== 0) setSpeed(0);
    setPopup(next.id);
  }, [state, popup, game.away, game.catchup, game.speed, showReport, setSpeed]);

  const closePopup = useCallback(() => {
    setPopup(null);
    if (resumeSpeed.current) setSpeed(resumeSpeed.current);
    resumeSpeed.current = null;
  }, [setSpeed]);

  useEffect(() => {
    if (popup && state && !state.incidents.some((i) => i.id === popup)) closePopup();
  }, [popup, state, closePopup]);

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

  const cash = cashBalance(state);
  const lotInfo = lot ? neighborhood(lot) : null;
  const legalBase = import.meta.env.BASE_URL;

  const ackReport = async (then: 'continue' | 'statements') => {
    if (!latestReport) return;
    await send({ type: 'ackReport', week: latestReport.week });
    if (then === 'statements') goTo('finance');
    if (game.speed === 0) setSpeed(1);
  };

  return (
    <GameUiContext.Provider value={ui}>
      <div className={`game view-${view}`}>
        <header className="topbar" hidden={view !== 'city'}>
          <button className="chip company-chip" onClick={() => goTo('finance')} aria-label={`${state.companyName}, cash ${formatMoney(cash)}. Open finances.`}>
            <BrandMark brand={state.brand} size={30} />
            <span className="chip-text">
              <span className="chip-sub">{state.companyName}</span>
              <span className={`chip-main num ${cash < 0 ? 'neg' : ''}`}>{formatMoney(cash)}</span>
            </span>
          </button>
          <DateChip hour={state.hour} progress={game.progress} />
        </header>

        {view === 'city' ? (
          <main className="city">
            <CityView state={state} onOpenStore={() => setView('store')} onLot={setLot} />
            <div className="sr-only-list">
              <button onClick={() => setView('store')}>Open {state.companyName}</button>
              {NEIGHBORHOODS.filter((n) => n.id !== state.neighborhoodId).map((n) => (
                <button key={n.id} onClick={() => setLot(n.id)}>
                  Lot for lease in {n.name}
                </button>
              ))}
            </div>
            <div className="city-bar">
              <div className="chip city-chip">
                <PinIcon />
                <span>{CITY_NAME}</span>
              </div>
              <SpeedControls speed={game.speed} onChange={setSpeed} />
              <button className="round-btn" aria-label="Menu" onClick={() => setMenuOpen(true)}>
                <MenuIcon />
              </button>
            </div>
            <p className="city-hint">Tap your pin to open {state.companyName}</p>
          </main>
        ) : (
          <StoreScreen tab={tab} onTab={setTab} speed={game.speed} onSpeed={setSpeed} onClose={() => setView('city')} saveError={game.saveError} />
        )}

        {sheet && (
          <Modal title={`${sheet === 'staff' ? 'Staff' : 'Customize'} · ${formatMoney(cash)} cash`} onClose={() => setSheet(null)} wide sheet>
            {sheet === 'staff' ? <StaffTab /> : <BuildTab />}
          </Modal>
        )}

        {lotInfo && (
          <Modal title={`For lease: ${lotInfo.name}`} onClose={() => setLot(null)}>
            <p className="muted">{lotInfo.address}</p>
            <p>{lotInfo.blurb}</p>
            <table className="fin">
              <tbody>
                <tr>
                  <th scope="row">Foot traffic</th>
                  <td className="num">{lotInfo.trafficPerHour} people per hour</td>
                </tr>
                <tr>
                  <th scope="row">Rent</th>
                  <td>
                    <Money cents={lotInfo.weeklyRent} /> per week
                  </td>
                </tr>
                <tr>
                  <th scope="row">Price sensitivity</th>
                  <td>{lotInfo.priceSensitivity >= 1.3 ? 'High' : lotInfo.priceSensitivity <= 0.8 ? 'Low' : 'Medium'}</td>
                </tr>
              </tbody>
            </table>
            <p className="muted small">Leasing a second location comes with multi-store support in the next update. For now, one store is the whole company.</p>
            <div className="dialog-actions">
              <button className="btn btn-primary" onClick={() => setLot(null)}>
                Got it
              </button>
            </div>
          </Modal>
        )}

        {toast && <Toast message={toast} onDone={clearToast} />}
        {game.catchup && <CatchUpOverlay done={game.catchup.done} total={game.catchup.total} />}
        {game.away && <AwayModal summary={game.away} onClose={game.dismissAway} />}
        {showReport && latestReport && (
          <WeekReportModal report={latestReport} previous={state.reports.at(-2)} onContinue={() => ackReport('continue')} onStatements={() => ackReport('statements')} />
        )}
        {popup && !showReport && (
          <IncidentModal
            state={state}
            incidentId={popup}
            onLater={closePopup}
            onChoose={async (option) => {
              const ok = await act({ type: 'resolveIncident', incidentId: popup, option });
              if (ok) closePopup();
            }}
          />
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

        {menuOpen && (
          <Modal title="Menu" onClose={() => setMenuOpen(false)}>
            <div className="row-actions">
              <button
                className="btn btn-primary"
                onClick={() => {
                  setMenuOpen(false);
                  setView('store');
                }}
              >
                Go to {state.companyName}
              </button>
            </div>
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
                    setMenuOpen(false);
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
              <a href={`${legalBase}privacy.html`}>Privacy Policy</a>
              <a href={`${legalBase}terms.html`}>Terms and Conditions</a>
              <span className="muted">Version {__APP_VERSION__}</span>
            </p>
          </Modal>
        )}
      </div>
    </GameUiContext.Provider>
  );
}
