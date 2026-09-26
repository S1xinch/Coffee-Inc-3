import { post } from './ledger';
import { addLog } from './log';
import { formatMoney } from './money';
import { random } from './rng';
import { storeCity } from './store';
import type { GameState, Store } from './state';

// The single place where a city's rules turn into charges. Business licenses always apply;
// fines only exist while local politics are on. Coffee Inc 2 checked its politics setting in
// some fee paths but not others, so fines kept arriving after players turned politics off.
export function cityCharges(state: GameState, store: Store): void {
  const c = storeCity(store);
  if (c.rules.licenseFeeWeekly > 0) {
    post(state, `${c.name} business license`, 'operating', [['otherExpense', c.rules.licenseFeeWeekly], ['cash', -c.rules.licenseFeeWeekly]], store.id);
  }
  if (!state.settings.politics) return;
  for (const fine of c.rules.fines) {
    if (random(state) >= fine.weeklyChance) continue;
    post(state, `${c.name}: ${fine.name}`, 'operating', [['otherExpense', fine.amount], ['cash', -fine.amount]], store.id);
    addLog(state, 'bad', `${c.name} fined your store ${formatMoney(fine.amount)}: ${fine.name.toLowerCase()}.`);
  }
}
