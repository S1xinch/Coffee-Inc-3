/// <reference lib="webworker" />
import { applyCommand } from '../sim/commands';
import { msPerGameHour, offlineHours, type Speed } from '../sim/clock';
import type { GameState } from '../sim/state';
import { summarizeProgress } from '../sim/summary';
import { advanceHoursInPlace } from '../sim/tick';
import type { FromWorker, ToWorker } from './protocol';

const TICK_MS = 100;
const MAX_HOURS_PER_TICK = 48;
const FROZEN_GAP_MS = 5000;

let state: GameState | null = null;
let speed: Speed = 1;
let speedBeforeSuspend: Speed | null = null;
let pauseOnReport = true;
let acc = 0;
let last = performance.now();
let busy = false;

const send = (msg: FromWorker) => postMessage(msg);
const progress = () => (state ? Math.min(1, acc / msPerGameHour(state.hour)) : 0);
const sendState = () => state && send({ type: 'state', state, speed, progress: progress() });
const lastReportWeek = (s: GameState) => s.reports.at(-1)?.week ?? 0;

// Steps run on a copy, so an unexpected error keeps the last good state instead of a half-updated one.
function guarded(fn: (draft: GameState) => void): boolean {
  if (!state) return false;
  const draft = structuredClone(state);
  try {
    fn(draft);
    state = draft;
    return true;
  } catch (err) {
    speed = 0;
    send({ type: 'fatal', message: err instanceof Error ? err.message : String(err) });
    sendState();
    return false;
  }
}

function tick(): void {
  const now = performance.now();
  const dt = now - last;
  last = now;
  if (!state || busy || speed === 0 || state.bankrupt) return;
  // A long gap means the page was frozen; resume() decides how much of it to simulate.
  if (dt > FROZEN_GAP_MS) return;
  acc += dt * speed;
  const need = msPerGameHour(state.hour);
  if (acc < need) {
    send({ type: 'progress', progress: progress() });
    return;
  }
  guarded((draft) => {
    let steps = 0;
    const weekBefore = lastReportWeek(draft);
    while (acc >= msPerGameHour(draft.hour) && steps < MAX_HOURS_PER_TICK && !draft.bankrupt) {
      acc -= msPerGameHour(draft.hour);
      advanceHoursInPlace(draft, 1);
      steps += 1;
      if (pauseOnReport && lastReportWeek(draft) !== weekBefore) {
        speed = 0;
        acc = 0;
        break;
      }
    }
    if (steps >= MAX_HOURS_PER_TICK) acc = 0;
  });
  sendState();
}

async function catchUp(hours: number): Promise<void> {
  if (!state || hours <= 0) return;
  busy = true;
  const before = structuredClone(state);
  let done = 0;
  while (done < hours && state && !state.bankrupt) {
    const n = Math.min(24, hours - done);
    if (!guarded((draft) => advanceHoursInPlace(draft, n))) break;
    done += n;
    send({ type: 'catchup', done, total: hours });
    await new Promise((r) => setTimeout(r, 0));
  }
  if (state) send({ type: 'away', summary: summarizeProgress(before, state) });
  busy = false;
  acc = 0;
  last = performance.now();
}

async function handle(msg: ToWorker): Promise<void> {
  switch (msg.type) {
    case 'load':
      state = msg.state;
      speed = msg.speed;
      pauseOnReport = msg.pauseOnReport;
      acc = 0;
      last = performance.now();
      await catchUp(offlineHours(msg.elapsedMs));
      sendState();
      return;
    case 'command': {
      if (!state || busy) {
        send({ type: 'commandResult', id: msg.id, error: 'Still catching up. Try again in a moment.' });
        return;
      }
      const result = applyCommand(state, msg.command);
      state = result.state;
      send({ type: 'commandResult', id: msg.id, error: result.error });
      sendState();
      return;
    }
    case 'setSpeed':
      speed = msg.speed;
      last = performance.now();
      sendState();
      return;
    case 'setPauseOnReport':
      pauseOnReport = msg.value;
      return;
    case 'suspend':
      if (speedBeforeSuspend === null) speedBeforeSuspend = speed;
      speed = 0;
      return;
    case 'resume':
      await catchUp(offlineHours(msg.elapsedMs));
      speed = speedBeforeSuspend ?? speed;
      speedBeforeSuspend = null;
      last = performance.now();
      sendState();
      return;
  }
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  handle(e.data).catch((err: unknown) => send({ type: 'fatal', message: err instanceof Error ? err.message : String(err) }));
};

setInterval(tick, TICK_MS);
