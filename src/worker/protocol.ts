import type { Command } from '../sim/commands';
import type { Speed } from '../sim/clock';
import type { GameState } from '../sim/state';
import type { ProgressSummary } from '../sim/summary';

export type ToWorker =
  | { type: 'load'; state: GameState; elapsedMs: number; speed: Speed; pauseOnReport: boolean }
  | { type: 'command'; id: number; command: Command }
  | { type: 'setSpeed'; speed: Speed }
  | { type: 'setPauseOnReport'; value: boolean }
  | { type: 'suspend' }
  | { type: 'resume'; elapsedMs: number };

export type FromWorker =
  | { type: 'state'; state: GameState; speed: Speed; progress: number }
  | { type: 'progress'; progress: number }
  | { type: 'commandResult'; id: number; error?: string }
  | { type: 'catchup'; done: number; total: number }
  | { type: 'away'; summary: ProgressSummary }
  | { type: 'fatal'; message: string };
