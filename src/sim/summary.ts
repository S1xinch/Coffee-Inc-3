import { cashBalance } from './ledger';
import type { GameState } from './state';

export interface ProgressSummary {
  hours: number;
  served: number;
  revenue: number;
  cashChange: number;
  weeksClosed: number;
  incidentsAutoResolved: number;
  staffQuit: number;
  bankrupt: boolean;
}

export function summarizeProgress(before: GameState, after: GameState): ProgressSummary {
  return {
    hours: after.hour - before.hour,
    served: after.lifetime.served - before.lifetime.served,
    revenue: after.lifetime.revenue - before.lifetime.revenue,
    cashChange: cashBalance(after) - cashBalance(before),
    weeksClosed: (after.reports.at(-1)?.week ?? 0) - (before.reports.at(-1)?.week ?? 0),
    incidentsAutoResolved: after.lifetime.incidentsAutoResolved - before.lifetime.incidentsAutoResolved,
    staffQuit: after.lifetime.staffQuit - before.lifetime.staffQuit,
    bankrupt: after.bankrupt && !before.bankrupt,
  };
}
