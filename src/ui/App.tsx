import { useEffect, useState } from 'react';
import { NEIGHBORHOODS, STARTING_CAPITAL } from '../sim/catalog';
import { clockInfo } from '../sim/clock';
import { newGame } from '../sim/game';
import { formatMoney } from '../sim/money';
import type { GameState } from '../sim/state';
import type { SceneModel } from '../render/scene';
import { deleteSave, loadSave, readImportFile, requestPersistentStorage, writeSave } from '../persistence/storage';
import { GameScreen } from './GameScreen';
import { Logo } from './Icons';
import { FileButton } from './overlays';
import { SceneCanvas } from './StoreView';

type Screen =
  | { kind: 'loading' }
  | { kind: 'title'; existing: { state: GameState; savedAtMs: number } | null; error: string | null }
  | { kind: 'new'; hasExisting: boolean }
  | { kind: 'game'; state: GameState; savedAtMs: number; startPaused: boolean; session: number };

const DEMO_SCENE: SceneModel = {
  equipment: ['register', 'espresso-2', 'grinder-1', 'drip', 'coldbrew', 'pastry', 'table', 'table', 'table', 'table', 'armchair', 'armchair', 'plant', 'plant', 'plant', 'art', 'art', 'lights'],
  broken: [],
  baristas: [{ id: 'a', look: 212 }, { id: 'b', look: 447 }, { id: 'c', look: 83 }],
  serving: true,
  hourOfDay: 10,
  servedLastHour: 28,
  speed: 1,
  companyName: 'Coffee Inc 3',
};

function isIosBrowser(): boolean {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

function Legal() {
  return (
    <p className="legal-links small">
      <a href="/privacy.html">Privacy Policy</a>
      <a href="/terms.html">Terms and Conditions</a>
    </p>
  );
}

function Title({ existing, error, onContinue, onNew, onImport }: {
  existing: { state: GameState; savedAtMs: number } | null;
  error: string | null;
  onContinue: () => void;
  onNew: () => void;
  onImport: (file: File) => void;
}) {
  const [showHint] = useState(isIosBrowser);
  return (
    <main className="title">
      <div className="title-art">
        <SceneCanvas model={DEMO_SCENE} label="A busy Coffee Inc 3 cafe" />
      </div>
      <div className="title-card">
        <div className="title-brand">
          <Logo size={48} />
          <div>
            <h1>Coffee Inc 3</h1>
            <p className="muted">Open a cafe, set the prices, hire the team, and keep the books.</p>
          </div>
        </div>
        {error && <p className="alert bad small">{error}</p>}
        <div className="title-actions">
          {existing && (
            <button className="btn btn-primary btn-large" onClick={onContinue}>
              Continue {existing.state.companyName}
              <span className="btn-sub">Week {clockInfo(existing.state.hour).week}</span>
            </button>
          )}
          <button className={`btn btn-large ${existing ? '' : 'btn-primary'}`} onClick={onNew}>
            New company
          </button>
          <FileButton label="Import a save file" className="btn btn-quiet" onFile={onImport} />
        </div>
        {showHint && (
          <p className="install-hint small">
            Play it like an app: tap the Share button in Safari, then Add to Home Screen.
          </p>
        )}
        <Legal />
      </div>
    </main>
  );
}

function NewCompany({ hasExisting, onStart, onBack }: { hasExisting: boolean; onStart: (name: string, neighborhoodId: string) => void; onBack: () => void }) {
  const [name, setName] = useState('');
  const [hood, setHood] = useState(NEIGHBORHOODS[0]!.id);
  return (
    <main className="newgame">
      <form
        className="newgame-card"
        onSubmit={(e) => {
          e.preventDefault();
          onStart(name, hood);
        }}
      >
        <h1>New company</h1>
        {hasExisting && (
          <p className="alert warn small">Starting a new company replaces the one saved on this device. Export it from Settings first if you want to keep it.</p>
        )}
        <label className="field">
          <span>Company name</span>
          <input value={name} maxLength={40} placeholder="Blue Door Coffee" onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </label>
        <fieldset className="hoods">
          <legend>Where is your first store?</legend>
          {NEIGHBORHOODS.map((n) => (
            <label key={n.id} className={`hood ${hood === n.id ? 'on' : ''}`}>
              <input type="radio" name="hood" value={n.id} checked={hood === n.id} onChange={() => setHood(n.id)} />
              <span className="hood-name">{n.name}</span>
              <span className="muted small">{n.blurb}</span>
              <span className="hood-stats small">
                <span>{n.trafficPerHour} people pass by per hour</span>
                <span>{formatMoney(n.weeklyRent)} rent per week</span>
                <span>Price sensitivity: {n.priceSensitivity >= 1.3 ? 'high' : n.priceSensitivity <= 0.8 ? 'low' : 'medium'}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="muted small">You start with {formatMoney(STARTING_CAPITAL)} of your own money and an empty shop.</p>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onBack}>
            Back
          </button>
          <button type="submit" className="btn btn-primary">
            Open the doors
          </button>
        </div>
      </form>
    </main>
  );
}

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });

  useEffect(() => {
    void requestPersistentStorage();
    loadSave().then((r) => {
      if (r.kind === 'ok') setScreen({ kind: 'title', existing: { state: r.state, savedAtMs: r.savedAtMs }, error: r.fromBackup ? 'Your latest save was damaged, so the most recent backup was loaded.' : null });
      else setScreen({ kind: 'title', existing: null, error: r.kind === 'error' ? r.error : null });
    });
  }, []);

  const startGame = (state: GameState, savedAtMs: number, startPaused = false) =>
    setScreen((prev) => ({ kind: 'game', state, savedAtMs, startPaused, session: (prev.kind === 'game' ? prev.session : 0) + 1 }));

  const importFile = async (file: File) => {
    const r = await readImportFile(file);
    if (!r.ok) {
      setScreen((s) => (s.kind === 'title' ? { ...s, error: r.error } : s));
      return;
    }
    await writeSave(r.save.state).catch(() => undefined);
    startGame(r.save.state, Date.now());
  };

  switch (screen.kind) {
    case 'loading':
      return <div className="loading">Brewing…</div>;
    case 'title':
      return (
        <Title
          existing={screen.existing}
          error={screen.error}
          onContinue={() => screen.existing && startGame(screen.existing.state, screen.existing.savedAtMs)}
          onNew={() => setScreen({ kind: 'new', hasExisting: !!screen.existing })}
          onImport={importFile}
        />
      );
    case 'new':
      return (
        <NewCompany
          hasExisting={screen.hasExisting}
          onBack={() => loadSave().then((r) => setScreen({ kind: 'title', existing: r.kind === 'ok' ? { state: r.state, savedAtMs: r.savedAtMs } : null, error: null }))}
          onStart={async (name, neighborhoodId) => {
            const state = newGame({ companyName: name, neighborhoodId, seed: Math.floor(Math.random() * 2 ** 32) });
            await writeSave(state).catch(() => undefined);
            startGame(state, Date.now(), true);
          }}
        />
      );
    case 'game':
      return (
        <GameScreen
          key={screen.session}
          initial={screen.state}
          savedAtMs={screen.savedAtMs}
          startPaused={screen.startPaused}
          onImported={async (state) => {
            await writeSave(state).catch(() => undefined);
            startGame(state, Date.now());
          }}
          onNewCompany={async () => {
            await deleteSave().catch(() => undefined);
            setScreen({ kind: 'new', hasExisting: false });
          }}
        />
      );
  }
}
