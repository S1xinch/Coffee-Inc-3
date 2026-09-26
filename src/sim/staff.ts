import { FIRST_NAMES, LAST_NAMES, marketWage } from './catalog';
import { newId, pick, random, randomInt } from './rng';
import type { Candidate, GameState, Store } from './state';
import { addLog } from './log';

export function generateCandidate(state: GameState): Candidate {
  const roll = random(state);
  const skill = roll < 0.5 ? randomInt(state, 1, 3) : roll < 0.9 ? randomInt(state, 3, 5) : randomInt(state, 6, 8);
  const offset = Math.round((random(state) * 3 - 1.5) * 4) * 25;
  return {
    id: newId(state, 'c'),
    name: `${pick(state, FIRST_NAMES)} ${pick(state, LAST_NAMES)}`,
    skill,
    askingWage: Math.max(marketWage(1), marketWage(skill) + offset),
    look: randomInt(state, 0, 999),
  };
}

export function refreshCandidates(state: GameState): void {
  state.candidates = Array.from({ length: 3 + state.stores.length }, () => generateCandidate(state));
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function updateMoraleAndQuits(state: GameState, store: Store, utilization: number): void {
  const overwork = Math.max(0, utilization - 0.85) * 100;
  for (const s of store.staff) {
    const wageDelta = (s.wage - marketWage(s.skill)) / 100;
    const target = clamp(65 + 8 * wageDelta - overwork, 5, 100);
    s.morale = clamp(Math.round((s.morale + (target - s.morale) * 0.15) * 10) / 10, 0, 100);
  }
  const quitters = store.staff.filter((s) => s.morale < 25 && random(state) < 0.15);
  for (const q of quitters) {
    addLog(state, 'bad', `${q.name} quit. Morale was too low.`);
    state.lifetime.staffQuit += 1;
  }
  store.staff = store.staff.filter((s) => !quitters.includes(s));
}
