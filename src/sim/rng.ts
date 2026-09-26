import type { GameState } from './state';

// mulberry32: the seed lives in GameState so every run is replayable from a save.
export function random(state: GameState): number {
  let t = (state.rng + 0x6d2b79f5) >>> 0;
  state.rng = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomInt(state: GameState, min: number, max: number): number {
  return min + Math.floor(random(state) * (max - min + 1));
}

export function pick<T>(state: GameState, items: readonly T[]): T {
  const item = items[Math.floor(random(state) * items.length)];
  if (item === undefined) throw new Error('pick from empty list');
  return item;
}

export function newId(state: GameState, prefix: string): string {
  state.nextId += 1;
  return `${prefix}${state.nextId}`;
}
