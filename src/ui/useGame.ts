import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Command } from '../sim/commands';
import type { Speed } from '../sim/clock';
import type { GameState } from '../sim/state';
import type { ProgressSummary } from '../sim/summary';
import { writeSave } from '../persistence/storage';
import type { FromWorker, ToWorker } from '../worker/protocol';
import { readPref } from './prefs';

const AUTOSAVE_MS = 15_000;

// Hour progress changes ten times a second; only the clock subscribes to it, not the whole screen.
function createProgressStore() {
  let value = 0;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(v: number) {
      value = v;
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}
export type ProgressStore = ReturnType<typeof createProgressStore>;

export interface GameController {
  state: GameState | null;
  speed: Speed;
  progress: ProgressStore;
  catchup: { done: number; total: number } | null;
  away: ProgressSummary | null;
  fatal: string | null;
  saveError: string | null;
  send: (command: Command) => Promise<string | undefined>;
  setSpeed: (speed: Speed) => void;
  setPauseOnReport: (value: boolean) => void;
  dismissAway: () => void;
  saveNow: () => Promise<void>;
  stopSaving: () => void;
}

export function useProgress(store: ProgressStore): number {
  return useSyncExternalStore(store.subscribe, store.get);
}

export function useGame(initial: GameState, savedAtMs: number, startPaused: boolean): GameController {
  const [state, setState] = useState<GameState | null>(null);
  const [speed, setSpeedState] = useState<Speed>(1);
  const [catchup, setCatchup] = useState<{ done: number; total: number } | null>(null);
  const [away, setAway] = useState<ProgressSummary | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [progress] = useState(createProgressStore);

  const worker = useRef<Worker | null>(null);
  const latest = useRef<GameState | null>(null);
  const dirty = useRef(false);
  const pending = useRef(new Map<number, (error: string | undefined) => void>());
  const nextId = useRef(1);
  const hiddenAt = useRef<number | null>(null);
  const saving = useRef(true);

  const post = useCallback((msg: ToWorker) => worker.current?.postMessage(msg), []);

  const saveNow = useCallback(async () => {
    const s = latest.current;
    if (!s || !saving.current) return;
    try {
      await writeSave(s);
      dirty.current = false;
      setSaveError(null);
    } catch {
      setSaveError('Progress could not be saved in this browser. Export your save from Settings to keep it.');
    }
  }, []);

  useEffect(() => {
    const w = new Worker(new URL('../worker/sim.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    w.onmessage = (e: MessageEvent<FromWorker>) => {
      const msg = e.data;
      switch (msg.type) {
        case 'state':
          latest.current = msg.state;
          dirty.current = true;
          setState(msg.state);
          setSpeedState(msg.speed);
          progress.set(msg.progress);
          setCatchup(null);
          return;
        case 'progress':
          progress.set(msg.progress);
          return;
        case 'commandResult':
          pending.current.get(msg.id)?.(msg.error);
          pending.current.delete(msg.id);
          return;
        case 'catchup':
          setCatchup({ done: msg.done, total: msg.total });
          return;
        case 'away':
          if (msg.summary.hours > 0) setAway(msg.summary);
          return;
        case 'fatal':
          setFatal(msg.message);
          return;
      }
    };
    w.onerror = (e) => setFatal(e.message || 'The simulation stopped unexpectedly.');
    w.postMessage({
      type: 'load',
      state: initial,
      elapsedMs: Date.now() - savedAtMs,
      speed: startPaused ? 0 : 1,
      pauseOnReport: readPref('pauseOnReport', true),
    } satisfies ToWorker);

    const interval = setInterval(() => {
      if (dirty.current) void saveNow();
    }, AUTOSAVE_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
        w.postMessage({ type: 'suspend' } satisfies ToWorker);
        void saveNow();
      } else {
        const elapsed = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
        hiddenAt.current = null;
        w.postMessage({ type: 'resume', elapsedMs: elapsed } satisfies ToWorker);
      }
    };
    const onPageHide = () => void saveNow();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      void saveNow();
      w.terminate();
      worker.current = null;
    };
  }, [initial, savedAtMs, startPaused, progress, saveNow]);

  const send = useCallback(
    (command: Command) =>
      new Promise<string | undefined>((resolve) => {
        const id = nextId.current++;
        pending.current.set(id, (error) => {
          if (!error) setTimeout(() => void saveNow(), 500);
          resolve(error);
        });
        post({ type: 'command', id, command });
      }),
    [post, saveNow],
  );

  const setSpeed = useCallback((s: Speed) => post({ type: 'setSpeed', speed: s }), [post]);
  const setPauseOnReport = useCallback((value: boolean) => post({ type: 'setPauseOnReport', value }), [post]);
  const dismissAway = useCallback(() => setAway(null), []);
  const stopSaving = useCallback(() => {
    saving.current = false;
  }, []);

  return { state, speed, progress, catchup, away, fatal, saveError, send, setSpeed, setPauseOnReport, dismissAway, saveNow, stopSaving };
}
