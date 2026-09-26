// The Seattle map: water, roads, districts, lots, and piers. Pure data so the simulation,
// the renderer, and the tests all agree on where things are.

export const CITY_W = 26;
export const CITY_H = 26;
export const ROAD_X: readonly number[] = [3, 8, 13, 18, 23];
export const ROAD_Y: readonly number[] = [0, 5, 10, 15, 20];

export type DistrictId = 'downtown' | 'old-town' | 'university' | 'waterfront' | 'hillside' | 'market';
export type Zone = DistrictId | 'park';

// Elliott Bay along the west and south, and a lake in the northeast corner.
export function isWater(x: number, y: number): boolean {
  return y >= 21 || (x <= 2 && y >= 5) || (x <= 5 && y >= 16) || (x >= 21 && y <= 3);
}

export function isRoad(x: number, y: number): boolean {
  return !isWater(x, y) && (ROAD_X.includes(x) || ROAD_Y.includes(y));
}

export function zoneAt(x: number, y: number): Zone {
  if (x >= 9 && x <= 12 && y >= 1 && y <= 4) return 'park';
  if (x >= 9 && x <= 17 && y >= 6 && y <= 14) return 'downtown';
  if (x <= 8 && y <= 9) return 'market';
  if (x >= 14 && y <= 9) return 'university';
  if (x >= 18 && y >= 10) return 'hillside';
  if (y >= 16) return 'waterfront';
  return 'old-town';
}

export interface Lot {
  id: string;
  districtId: DistrictId;
  x: number;
  y: number;
  address: string;
  trafficMod: number;
  rentMod: number;
}

export const LOTS: readonly Lot[] = [
  { id: 'downtown-1', districtId: 'downtown', x: 11, y: 8, address: '700 Pine Street', trafficMod: 1, rentMod: 1 },
  { id: 'downtown-2', districtId: 'downtown', x: 15, y: 12, address: '1420 Fifth Avenue', trafficMod: 1.1, rentMod: 1.15 },
  { id: 'downtown-3', districtId: 'downtown', x: 10, y: 13, address: '301 Union Street', trafficMod: 0.9, rentMod: 0.9 },
  { id: 'old-town-1', districtId: 'old-town', x: 6, y: 12, address: '118 Cobble Lane', trafficMod: 1, rentMod: 1 },
  { id: 'old-town-2', districtId: 'old-town', x: 4, y: 14, address: '22 Tannery Row', trafficMod: 0.9, rentMod: 0.85 },
  { id: 'university-1', districtId: 'university', x: 16, y: 3, address: '4521 College Ave', trafficMod: 1, rentMod: 1 },
  { id: 'university-2', districtId: 'university', x: 20, y: 7, address: '812 Campus Parkway', trafficMod: 0.95, rentMod: 0.95 },
  { id: 'waterfront-1', districtId: 'waterfront', x: 10, y: 18, address: '88 Pier Street', trafficMod: 1, rentMod: 1 },
  { id: 'waterfront-2', districtId: 'waterfront', x: 16, y: 19, address: '1 Ferry Terminal Way', trafficMod: 1.15, rentMod: 1.2 },
  { id: 'waterfront-3', districtId: 'waterfront', x: 7, y: 17, address: '240 Harbor Walk', trafficMod: 0.9, rentMod: 0.9 },
  { id: 'hillside-1', districtId: 'hillside', x: 20, y: 12, address: '1604 Maple Terrace', trafficMod: 1, rentMod: 1 },
  { id: 'hillside-2', districtId: 'hillside', x: 22, y: 17, address: '930 Summit Road', trafficMod: 0.9, rentMod: 0.9 },
  { id: 'market-1', districtId: 'market', x: 6, y: 7, address: '410 Stall Street', trafficMod: 1, rentMod: 1 },
  { id: 'market-2', districtId: 'market', x: 5, y: 3, address: '55 Warehouse Lane', trafficMod: 0.9, rentMod: 0.9 },
];

export const lot = (id: string): Lot => {
  const l = LOTS.find((x) => x.id === id);
  if (!l) throw new Error(`Unknown lot ${id}`);
  return l;
};

export const firstLotIn = (districtId: string): Lot => {
  const l = LOTS.find((x) => x.districtId === districtId);
  if (!l) throw new Error(`No lots in ${districtId}`);
  return l;
};

// Wooden piers reaching into the bay from the waterfront, with room for boats alongside.
export const PIERS: readonly { x: number; from: number; to: number }[] = [
  { x: 7, from: 21, to: 24 },
  { x: 11, from: 21, to: 25 },
  { x: 15, from: 21, to: 24 },
];
