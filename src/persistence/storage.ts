import { del, get, set } from 'idb-keyval';
import { clockInfo } from '../sim/clock';
import { makeSave, parseSave, type ParseResult } from '../sim/save';
import type { GameState } from '../sim/state';

const SAVE_KEY = 'coffee-inc-3/save';
const BACKUP_KEY = 'coffee-inc-3/save-backup';
let lastBackupWeek = -1;

export type LoadResult = { kind: 'none' } | { kind: 'ok'; state: GameState; savedAtMs: number; fromBackup: boolean } | { kind: 'error'; error: string };

export async function loadSave(): Promise<LoadResult> {
  let raw: unknown;
  try {
    raw = await get(SAVE_KEY);
  } catch {
    return { kind: 'error', error: 'This browser is blocking storage, so progress cannot be loaded or saved here.' };
  }
  if (raw === undefined) return { kind: 'none' };
  const main = parseSave(raw);
  if (main.ok) return { kind: 'ok', state: main.save.state, savedAtMs: main.save.savedAtMs, fromBackup: false };
  const backup = parseSave(await get(BACKUP_KEY).catch(() => undefined));
  if (backup.ok) return { kind: 'ok', state: backup.save.state, savedAtMs: backup.save.savedAtMs, fromBackup: true };
  return { kind: 'error', error: main.error };
}

export async function writeSave(state: GameState): Promise<void> {
  const json = JSON.stringify(makeSave(state, Date.now()));
  await set(SAVE_KEY, json);
  const week = clockInfo(state.hour).week;
  if (week !== lastBackupWeek) {
    lastBackupWeek = week;
    await set(BACKUP_KEY, json);
  }
}

export async function deleteSave(): Promise<void> {
  lastBackupWeek = -1;
  await del(SAVE_KEY);
  await del(BACKUP_KEY);
}

// Home-screen web apps on iOS can still have storage evicted; asking for persistence lowers the odds.
export async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Not supported everywhere; export/import remains the safety net.
  }
}

export function exportSave(state: GameState): void {
  const blob = new Blob([JSON.stringify(makeSave(state, Date.now()), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const slug = state.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'coffee-inc-3';
  a.href = url;
  a.download = `${slug}-week-${clockInfo(state.hour).week}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readImportFile(file: File): Promise<ParseResult> {
  if (file.size > 5_000_000) return { ok: false, error: 'That file is too large to be a save.' };
  return parseSave(await file.text());
}
