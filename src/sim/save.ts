import { EQUIPMENT, MENU, NEIGHBORHOODS } from './catalog';
import { INCIDENTS } from './incidents';
import { ledgerIsBalanced } from './ledger';
import { GameStateSchema, type GameState } from './state';

export const SAVE_FORMAT = 'coffee-inc-3-save';
export const SAVE_VERSION = 1;

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: number;
  savedAtMs: number;
  state: GameState;
}

export type ParseResult = { ok: true; save: SaveFile } | { ok: false; error: string };

// Each entry upgrades a save from version N to N + 1.
export const MIGRATIONS: Record<number, (state: Record<string, unknown>) => Record<string, unknown>> = {};

export const makeSave = (state: GameState, savedAtMs: number): SaveFile => ({
  format: SAVE_FORMAT,
  version: SAVE_VERSION,
  savedAtMs,
  state,
});

function semanticProblem(state: GameState): string | null {
  if (!NEIGHBORHOODS.some((n) => n.id === state.neighborhoodId)) return `unknown neighborhood "${state.neighborhoodId}"`;
  const badEquipment = state.store.equipment.find((e) => !EQUIPMENT.some((t) => t.id === e.typeId));
  if (badEquipment) return `unknown equipment "${badEquipment.typeId}"`;
  const badIncident = state.incidents.find((i) => !INCIDENTS.some((d) => d.id === i.defId));
  if (badIncident) return `unknown incident "${badIncident.defId}"`;
  if (new Set(state.staff.map((s) => s.id)).size !== state.staff.length) return 'duplicate staff ids';
  if (!ledgerIsBalanced(state)) return 'the books do not balance';
  return null;
}

export function parseSave(raw: unknown, migrations = MIGRATIONS, currentVersion = SAVE_VERSION): ParseResult {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'This file is not valid JSON.' };
    }
  }
  if (typeof data !== 'object' || data === null) return { ok: false, error: 'This is not a Coffee Inc 3 save.' };
  const file = data as Record<string, unknown>;
  if (file.format !== SAVE_FORMAT) return { ok: false, error: 'This is not a Coffee Inc 3 save.' };
  if (typeof file.version !== 'number' || !Number.isInteger(file.version) || file.version < 1) {
    return { ok: false, error: 'The save has no valid version number.' };
  }
  if (file.version > currentVersion) {
    return { ok: false, error: 'This save was made by a newer version of the game. Update the app and try again.' };
  }
  if (typeof file.state !== 'object' || file.state === null) return { ok: false, error: 'The save has no game data.' };

  let state = file.state as Record<string, unknown>;
  for (let v = file.version; v < currentVersion; v++) {
    const migrate = migrations[v];
    if (!migrate) return { ok: false, error: `No upgrade path from save version ${v}.` };
    state = migrate(state);
  }

  const parsed = GameStateSchema.safeParse(state);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `The save is damaged (${issue ? `${issue.path.join('.')}: ${issue.message}` : 'invalid data'}).` };
  }
  const game = parsed.data;
  for (const item of MENU) game.store.menu[item.id] ??= { enabled: false, price: item.refPrice };
  const problem = semanticProblem(game);
  if (problem) return { ok: false, error: `The save is damaged (${problem}).` };

  const savedAtMs = typeof file.savedAtMs === 'number' && Number.isFinite(file.savedAtMs) ? file.savedAtMs : Date.now();
  return { ok: true, save: { format: SAVE_FORMAT, version: currentVersion, savedAtMs, state: game } };
}
