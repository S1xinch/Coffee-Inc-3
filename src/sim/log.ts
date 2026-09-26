import { LOG_KEPT } from './catalog';
import type { GameState, LogEntry } from './state';

export function addLog(state: GameState, tone: LogEntry['tone'], text: string): void {
  state.log.push({ hour: state.hour, tone, text });
  if (state.log.length > LOG_KEPT) state.log.splice(0, state.log.length - LOG_KEPT);
}
