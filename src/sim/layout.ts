import { equipmentType } from './catalog';
import type { Cell, Store } from './state';

// Furniture that can be moved around the floor. Counter equipment, wall art, and lights stay put.
export const PLACEABLE_TYPES = new Set(['table', 'armchair', 'plant']);

// Floor cells in front of the counter, keeping the queue lane, pickup spot, and doorway clear.
export const FLOOR_CELLS: readonly Cell[] = [
  { x: 0, y: 1 },
  ...[2, 3, 4, 5].flatMap((y) => [0, 1, 2, 3, 4, 5].map((x) => ({ x, y }))).filter((c) => !(c.y === 2 && c.x >= 4)),
  { x: 7, y: 2 },
  { x: 7, y: 3 },
];

const key = (c: Cell) => `${c.x},${c.y}`;
const ALLOWED = new Set(FLOOR_CELLS.map(key));
export const isFloorCell = (c: Cell): boolean => ALLOWED.has(key(c));

const PREFERRED: Record<string, readonly Cell[]> = {
  table: [3, 4, 5].flatMap((y) => [1, 3, 5, 0, 2, 4].map((x) => ({ x, y }))),
  armchair: [{ x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }],
  plant: [{ x: 0, y: 1 }, { x: 7, y: 2 }, { x: 0, y: 5 }, { x: 5, y: 5 }, { x: 7, y: 3 }],
};

export const isPlaceable = (typeId: string): boolean => PLACEABLE_TYPES.has(equipmentType(typeId).id);

function freeCell(typeId: string, taken: Set<string>): Cell | null {
  const order = [...(PREFERRED[typeId] ?? []), ...FLOOR_CELLS];
  return order.find((c) => isFloorCell(c) && !taken.has(key(c))) ?? null;
}

// Keeps the layout valid: drops entries for sold items, and moves anything off-grid,
// overlapping, or missing onto a free cell. A bad layout is repaired, never fatal.
export function normalizeLayout(store: Store): void {
  const next: Record<string, Cell> = {};
  const taken = new Set<string>();
  const placeable = store.equipment.filter((e) => isPlaceable(e.typeId));
  for (const e of placeable) {
    const c = store.layout[e.id];
    if (c && isFloorCell(c) && !taken.has(key(c))) {
      next[e.id] = { x: c.x, y: c.y };
      taken.add(key(c));
    }
  }
  for (const e of placeable) {
    if (next[e.id]) continue;
    const c = freeCell(e.typeId, taken);
    if (!c) continue;
    next[e.id] = c;
    taken.add(key(c));
  }
  store.layout = next;
}

export const layoutHasRoom = (store: Store): boolean => Object.keys(store.layout).length < FLOOR_CELLS.length;

export function occupant(store: Store, cell: Cell): string | undefined {
  return Object.entries(store.layout).find(([, c]) => c.x === cell.x && c.y === cell.y)?.[0];
}
