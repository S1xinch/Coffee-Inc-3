import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LEASE_SIGNING_WEEKS, neighborhood } from '../sim/catalog';
import { CITIES, city as cityById, lot as lotById, lotsIn } from '../sim/city';
import type { Command, StoreCommand } from '../sim/commands';
import { calendarDate, clockInfo, formatTime, type Speed } from '../sim/clock';
import { incidentDef, incidentStaff } from '../sim/incidents';
import { cashBalance } from '../sim/ledger';
import { formatMoney } from '../sim/money';
import { lotTaken } from '../sim/rival';
import type { GameState } from '../sim/state';
import { lotRent, storeById } from '../sim/store';
import { exportSave, readImportFile } from '../persistence/storage';
import { BrandMark, Portrait } from './Brand';
import { CityView } from './CityView';
import { Money, plural } from './bits';
import { GameUiContext, type GameUi, type SheetId, type TabId } from './context';
import { AwayModal, CatchUpOverlay, ConfirmModal, FileButton, Modal, Toast, WeekReportModal, type ConfirmRequest } from './overlays';
import { readPref, writePref } from './prefs';
import { SpeedControls, StoreScreen } from './StoreScreen';
import { HqScreen } from './HqScreen';
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

const HqIcon = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 21V5l8-3 8 3v16" />
    <path d="M9 21v-4h6v4M8 8h2M14 8h2M8 12h2M14 12h2" />
  </svg>
);

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
  const store = storeById(state, incident.storeId);
  const speaker = staff ?? store?.staff[0];
  return (
    <Modal title={state.stores.length > 1 && store ? `${def.title} · ${lotById(store.lotId).address}` : def.title} onClose={onLater}>
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
  const [view, setView] = useState<'city' | 'store' | 'hq'>(startPaused ? 'store' : 'city');
  const [cityId, setCityId] = useState<string | null>(null);
  const [citiesOpen, setCitiesOpen] = useState(false);
  const [tab, setTab] = useState<TabId>('service');
  const [sheet, setSheet] = useState<SheetId | null>(null);
  const [lot, setLot] = useState<string | null>(null);
  const [rivalLot, setRivalLot] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [popup, setPopup] = useState<string | null>(null);
  const [pauseOnReport, setPauseOnReportState] = useState(() => readPref('pauseOnReport', true));
  const seenIncidents = useRef(new Set<string>());
  const [pendingOpen, setPendingOpen] = useState<{ lotId: string; before: Set<string> } | null>(null);
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

  const store = state ? ((storeId && storeById(state, storeId)) || state.stores[0]!) : null;
  const currentStoreId = store?.id ?? null;
  const storeAct = useCallback((command: StoreCommand) => (currentStoreId ? act({ ...command, storeId: currentStoreId }) : Promise.resolve(false)), [act, currentStoreId]);
  const ui = useMemo<GameUi | null>(
    () => (state && store ? { state, store, act, storeAct, selectStore: setStoreId, goTo, openSheet: setSheet, confirm } : null),
    [state, store, act, storeAct, goTo, confirm],
  );
  // The map shows the city picked in the Cities sheet, or else the current store's city.
  const viewCity = cityId ?? (store ? lotById(store.lotId).cityId : 'seattle');
  const openStore = useCallback((id: string) => {
    setStoreId(id);
    setView('store');
  }, []);
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

  // After a lease goes through, open the new store once it shows up in state.
  useEffect(() => {
    if (!pendingOpen || !state) return;
    const created = state.stores.find((s) => s.lotId === pendingOpen.lotId && !pendingOpen.before.has(s.id));
    if (!created) return;
    setPendingOpen(null);
    openStore(created.id);
    setSheet('customize');
  }, [pendingOpen, state, openStore]);

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
  const leaseLot = lot && !lotTaken(state, lot) ? lotById(lot) : null;
  const leaseDistrict = leaseLot ? neighborhood(leaseLot.districtId) : null;
  const leaseRent = leaseLot ? lotRent(leaseLot.id) : 0;
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
            <CityView
              state={state}
              cityId={viewCity}
              focusLotId={lotById(ui.store.lotId).cityId === viewCity ? ui.store.lotId : (state.stores.find((s) => lotById(s.lotId).cityId === viewCity)?.lotId ?? '')}
              onOpenStore={openStore}
              onLot={setLot}
              onRival={setRivalLot}
            />
            {!state.cities.includes(viewCity as (typeof state.cities)[number]) && (
              <div className="city-locked">
                <strong>{cityById(viewCity).name} is locked</strong>
                <span className="small">Unlock it from the Cities list to lease lots here.</span>
                <button className="btn btn-small btn-primary" onClick={() => setCitiesOpen(true)}>
                  Cities
                </button>
              </div>
            )}
            <div className="sr-only-list">
              {state.stores.filter((s) => lotById(s.lotId).cityId === viewCity).map((s) => (
                <button key={s.id} onClick={() => openStore(s.id)}>
                  Open your store at {lotById(s.lotId).address}
                </button>
              ))}
              {lotsIn(viewCity).filter((l) => state.cities.includes(l.cityId) && !lotTaken(state, l.id)).map((l) => (
                <button key={l.id} onClick={() => setLot(l.id)}>
                  Lot for lease at {l.address}, {neighborhood(l.districtId).name}
                </button>
              ))}
              {state.rival.stores.filter((r) => lotById(r.lotId).cityId === viewCity).map((r) => (
                <button key={r.lotId} onClick={() => setRivalLot(r.lotId)}>
                  {state.rival.name} at {lotById(r.lotId).address}
                </button>
              ))}
            </div>
            <div className="city-bar">
              <button className="chip city-chip" aria-label={`${cityById(viewCity).name}. Choose a city.`} onClick={() => setCitiesOpen(true)}>
                <PinIcon />
                <span>{cityById(viewCity).name}</span>
              </button>
              <SpeedControls speed={game.speed} onChange={setSpeed} />
              <button className="round-btn" aria-label="Headquarters" onClick={() => setView('hq')}>
                <HqIcon />
              </button>
              <button className="round-btn" aria-label="Menu" onClick={() => setMenuOpen(true)}>
                <MenuIcon />
              </button>
            </div>
            <p className="city-hint">Tap a pin to open it</p>
          </main>
        ) : view === 'hq' ? (
          <HqScreen speed={game.speed} onSpeed={setSpeed} onClose={() => setView('city')} />
        ) : (
          <StoreScreen
            tab={tab}
            onTab={setTab}
            speed={game.speed}
            onSpeed={setSpeed}
            onClose={() => {
              setCityId(null);
              setView('city');
            }}
            saveError={game.saveError}
          />
        )}

        {citiesOpen && (
          <Modal title="Cities" onClose={() => setCitiesOpen(false)}>
            <ul className="city-list">
              {CITIES.map((c) => {
                const unlocked = state.cities.includes(c.id);
                const count = state.stores.filter((s) => lotById(s.lotId).cityId === c.id).length;
                const r = c.rules;
                return (
                  <li key={c.id} className={`city-card ${viewCity === c.id ? 'on' : ''}`}>
                    <div className="city-card-head">
                      <strong>{c.name}</strong>
                      <span className={`tag ${unlocked ? 'good' : ''}`}>{unlocked ? plural(count, 'store') : 'Locked'}</span>
                    </div>
                    <p className="muted small">{c.blurb}</p>
                    <p className="small">
                      Wages {r.wageMultiplier === 1 ? 'normal' : `${r.wageMultiplier > 1 ? '+' : ''}${Math.round((r.wageMultiplier - 1) * 100)}%`}
                      {r.cupFee > 0 && ` · ${formatMoney(r.cupFee, true)} fee per cup`}
                      {r.licenseFeeWeekly > 0 && ` · ${formatMoney(r.licenseFeeWeekly)} a week business license`}
                      {r.fines.length > 0 && ` · fines for ${r.fines.map((f) => f.name.toLowerCase()).join(' and ')}`}
                    </p>
                    <div className="row-actions">
                      <button
                        className="btn btn-small"
                        onClick={() => {
                          setCityId(c.id);
                          setCitiesOpen(false);
                          setView('city');
                        }}
                      >
                        View map
                      </button>
                      {!unlocked && c.unlock && (
                        <button
                          className="btn btn-small btn-primary"
                          onClick={async () => {
                            if (await act({ type: 'unlockCity', cityId: c.id })) {
                              setCityId(c.id);
                              setCitiesOpen(false);
                              setView('city');
                            }
                          }}
                        >
                          Unlock <Money cents={c.unlock.fee} />
                        </button>
                      )}
                    </div>
                    {!unlocked && c.unlock && state.stores.length < c.unlock.minStores && (
                      <p className="muted small">Needs {plural(c.unlock.minStores, 'store')}. You run {state.stores.length}.</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </Modal>
        )}

        {sheet && (
          <Modal title={`${sheet === 'staff' ? 'Staff' : 'Customize'} · ${formatMoney(cash)} cash`} onClose={() => setSheet(null)} wide sheet>
            {sheet === 'staff' ? <StaffTab /> : <BuildTab />}
          </Modal>
        )}

        {leaseLot && leaseDistrict && (
          <Modal title={`For lease: ${leaseLot.address}`} onClose={() => setLot(null)}>
            <p className="muted">{leaseDistrict.name}</p>
            <p>{leaseDistrict.blurb}</p>
            <table className="fin">
              <tbody>
                <tr>
                  <th scope="row">Foot traffic</th>
                  <td className="num">{Math.round(leaseDistrict.trafficPerHour * leaseLot.trafficMod)} people per hour</td>
                </tr>
                <tr>
                  <th scope="row">Rent</th>
                  <td>
                    <Money cents={leaseRent} /> per week
                  </td>
                </tr>
                <tr>
                  <th scope="row">Signing fee</th>
                  <td>
                    <Money cents={leaseRent * LEASE_SIGNING_WEEKS} />
                  </td>
                </tr>
                <tr>
                  <th scope="row">Price sensitivity</th>
                  <td>{leaseDistrict.priceSensitivity >= 1.3 ? 'High' : leaseDistrict.priceSensitivity <= 0.8 ? 'Low' : 'Medium'}</td>
                </tr>
                <tr>
                  <th scope="row">Competition</th>
                  <td>
                    {[
                      state.stores.filter((s) => lotById(s.lotId).districtId === leaseLot.districtId).length > 0 ? 'Your own store nearby' : '',
                      state.rival.stores.some((r) => lotById(r.lotId).districtId === leaseLot.districtId) ? `${state.rival.name} is here` : '',
                    ]
                      .filter(Boolean)
                      .join(', ') || 'None yet'}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="muted small">The new store starts empty. Furnish it, hire a team, and consider a manager so it runs while you are elsewhere.</p>
            <div className="dialog-actions">
              <button className="btn" onClick={() => setLot(null)}>
                Not now
              </button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  const before = new Set(state.stores.map((s) => s.id));
                  const lotId = leaseLot.id;
                  if (!(await act({ type: 'leaseLot', lotId }))) return;
                  setLot(null);
                  setPendingOpen({ lotId, before });
                }}
              >
                Lease this lot <Money cents={leaseRent * LEASE_SIGNING_WEEKS} />
              </button>
            </div>
          </Modal>
        )}

        {rivalLot && (
          <Modal title={state.rival.name} onClose={() => setRivalLot(null)}>
            <p className="muted">
              {lotById(rivalLot).address}, {neighborhood(lotById(rivalLot).districtId).name}
            </p>
            <p>
              A rival chain with {state.rival.stores.length} stores. Customers here rate them {state.rival.stars.toFixed(1)} stars, and their prices are about{' '}
              {Math.round(state.rival.priceIndex * 100)}% of the typical menu. They cut prices when yours are high and open a new store every few weeks.
            </p>
            <p className="muted small">A store in the same district as theirs shares its walk-ins with them. Better ratings and fair prices win more of them.</p>
            <div className="dialog-actions">
              <button className="btn btn-primary" onClick={() => setRivalLot(null)}>
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
                Go to {lotById(ui.store.lotId).address}
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
            <label className="setting">
              <input type="checkbox" checked={state.settings.politics} onChange={(e) => act({ type: 'setPolitics', on: e.target.checked })} />
              <span>Local politics: cities can fine your stores</span>
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
