// City maps: water, roads, districts, lots, piers, and each city's rules. Pure data so the
// simulation, the renderer, and the tests all agree on where things are.
import { dollars, type Cents } from './money';

export type CityId = 'seattle' | 'portland' | 'san-francisco';

export interface Lot {
  id: string;
  cityId: CityId;
  districtId: string;
  x: number;
  y: number;
  address: string;
  trafficMod: number;
  rentMod: number;
}

// A fine the city can hand out. Fines only exist while local politics are switched on.
export interface CityFine {
  id: string;
  name: string;
  weeklyChance: number;
  amount: Cents;
}

// Every city-specific cost lives in this one table. Coffee Inc 2 scattered these checks
// through its fee code, so switching politics off still let regional fines through.
export interface CityRules {
  wageMultiplier: number;
  cupFee: Cents;
  licenseFeeWeekly: Cents;
  fines: readonly CityFine[];
}

export interface Pier {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Boat {
  kind: 'boat' | 'sail' | 'ferry';
  x: number;
  y: number;
  color?: string;
  length?: number;
}

export interface CityDef {
  id: CityId;
  name: string;
  blurb: string;
  w: number;
  h: number;
  roadX: readonly number[];
  roadY: readonly number[];
  water: (x: number, y: number) => boolean;
  // Roads that cross water on a bridge instead of stopping at the shore.
  bridge: (x: number, y: number) => boolean;
  // A district id, or 'park'.
  zone: (x: number, y: number) => string;
  piers: readonly Pier[];
  boats: readonly Boat[];
  landmark: { kind: 'needle' | 'pyramid'; x: number; y: number } | null;
  rules: CityRules;
  unlock: { fee: Cents; minStores: number } | null;
}

const seattleWater = (x: number, y: number) => y >= 21 || (x <= 2 && y >= 5) || (x <= 5 && y >= 16) || (x >= 21 && y <= 3);
const portlandWater = (x: number) => x === 10 || x === 11;
const sfWater = (x: number, y: number) => y <= 1 || x >= 22 || (x >= 20 && y <= 4);

export const CITIES: readonly CityDef[] = [
  {
    id: 'seattle',
    name: 'Seattle',
    blurb: 'Your home town, on Elliott Bay.',
    w: 26,
    h: 26,
    roadX: [3, 8, 13, 18, 23],
    roadY: [0, 5, 10, 15, 20],
    water: seattleWater,
    bridge: (x, y) => seattleWater(x, y) && y < 21 && ([3, 8, 13, 18, 23].includes(x) || [0, 5, 10, 15, 20].includes(y)),
    zone: (x, y) => {
      if (x >= 9 && x <= 12 && y >= 1 && y <= 4) return 'park';
      if (x >= 9 && x <= 17 && y >= 6 && y <= 14) return 'downtown';
      if (x <= 8 && y <= 9) return 'market';
      if (x >= 14 && y <= 9) return 'university';
      if (x >= 18 && y >= 10) return 'hillside';
      if (y >= 16) return 'waterfront';
      return 'old-town';
    },
    piers: [
      { x0: 7.3, y0: 20.8, x1: 7.7, y1: 24.9 },
      { x0: 11.3, y0: 20.8, x1: 11.7, y1: 25.9 },
      { x0: 15.3, y0: 20.8, x1: 15.7, y1: 24.9 },
    ],
    boats: [
      { kind: 'boat', x: 6.55, y: 23.2, color: '#c9573f', length: 0.9 },
      { kind: 'boat', x: 8.4, y: 22.6, color: '#3a6ea5', length: 0.8 },
      { kind: 'boat', x: 10.5, y: 24.3, color: '#f2efe8', length: 1.1 },
      { kind: 'boat', x: 12.4, y: 23.0, color: '#2f7a4a', length: 0.8 },
      { kind: 'ferry', x: 16.2, y: 23.6 },
      { kind: 'boat', x: 19.5, y: 24.5, color: '#6b6f78', length: 1.2 },
      { kind: 'sail', x: 4, y: 23.5 },
      { kind: 'sail', x: 22.4, y: 1.2 },
      { kind: 'sail', x: 24.3, y: 2.4 },
      { kind: 'sail', x: 1.2, y: 8.5 },
    ],
    landmark: { kind: 'needle', x: 11, y: 3 },
    rules: {
      wageMultiplier: 1,
      cupFee: 0,
      licenseFeeWeekly: 0,
      fines: [{ id: 'sidewalk-sign', name: 'Sidewalk sign citation', weeklyChance: 0.04, amount: dollars(250) }],
    },
    unlock: null,
  },
  {
    id: 'portland',
    name: 'Portland',
    blurb: 'Bridges over the Willamette and a serious coffee scene. Lower wages, a small weekly business license.',
    w: 22,
    h: 22,
    roadX: [2, 7, 14, 19],
    roadY: [0, 5, 10, 15, 20],
    water: (x) => portlandWater(x),
    bridge: (x, y) => portlandWater(x) && [0, 5, 10, 15, 20].includes(y),
    zone: (x, y) => {
      if (x <= 4 && y >= 16) return 'park';
      if (x <= 9) return y <= 9 ? 'pearl' : 'pdx-downtown';
      return y <= 9 ? 'alberta' : 'hawthorne';
    },
    piers: [
      { x0: 9.6, y0: 12.3, x1: 10.6, y1: 12.7 },
      { x0: 11.4, y0: 7.3, x1: 12.4, y1: 7.7 },
    ],
    boats: [
      { kind: 'boat', x: 10.5, y: 13.4, color: '#c9573f', length: 0.6 },
      { kind: 'sail', x: 10.8, y: 3 },
      { kind: 'sail', x: 10.4, y: 18 },
    ],
    landmark: null,
    rules: {
      wageMultiplier: 0.95,
      cupFee: 0,
      licenseFeeWeekly: dollars(150),
      fines: [{ id: 'noise', name: 'Late-night noise citation', weeklyChance: 0.05, amount: dollars(200) }],
    },
    unlock: { fee: dollars(20_000), minStores: 2 },
  },
  {
    id: 'san-francisco',
    name: 'San Francisco',
    blurb: 'Huge crowds and high prices. Wages are 25% higher, every cup carries a city fee, and inspectors are strict.',
    w: 24,
    h: 24,
    roadX: [3, 8, 13, 18],
    roadY: [3, 8, 13, 18],
    water: sfWater,
    bridge: () => false,
    zone: (x, y) => {
      if (x >= 2 && x <= 6 && y >= 14 && y <= 19) return 'park';
      if (x >= 19 && y >= 5) return 'embarcadero';
      if (x >= 13 && y <= 12) return 'financial';
      if (y <= 8) return 'north-beach';
      if (x >= 9) return 'mission';
      return 'sunset';
    },
    piers: [7, 11, 15, 19].map((y) => ({ x0: 21.8, y0: y + 0.3, x1: 23.9, y1: y + 0.7 })),
    boats: [
      { kind: 'ferry', x: 23.1, y: 13.4 },
      { kind: 'boat', x: 22.9, y: 9.4, color: '#3a6ea5', length: 0.7 },
      { kind: 'boat', x: 23.0, y: 17.4, color: '#c9573f', length: 0.8 },
      { kind: 'sail', x: 4, y: 0.6 },
      { kind: 'sail', x: 10, y: 0.8 },
      { kind: 'sail', x: 22.8, y: 2.5 },
    ],
    landmark: { kind: 'pyramid', x: 17, y: 7 },
    rules: {
      wageMultiplier: 1.25,
      cupFee: dollars(0.1),
      licenseFeeWeekly: dollars(400),
      fines: [
        { id: 'health-permit', name: 'Health permit penalty', weeklyChance: 0.06, amount: dollars(600) },
        { id: 'sidewalk-seating', name: 'Sidewalk seating citation', weeklyChance: 0.04, amount: dollars(300) },
      ],
    },
    unlock: { fee: dollars(45_000), minStores: 4 },
  },
];

export const STARTING_CITY: CityId = 'seattle';

export const city = (id: string): CityDef => {
  const c = CITIES.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown city ${id}`);
  return c;
};

export const isWater = (c: CityDef, x: number, y: number): boolean => c.water(x, y);
export const isRoad = (c: CityDef, x: number, y: number): boolean => !c.water(x, y) && (c.roadX.includes(x) || c.roadY.includes(y));
export const zoneAt = (c: CityDef, x: number, y: number): string => c.zone(x, y);

const lotRow = (n: number, cityId: CityId, districtId: string, x: number, y: number, address: string, trafficMod = 1, rentMod = 1): Lot => ({
  id: `${districtId}-${n}`,
  cityId,
  districtId,
  x,
  y,
  address,
  trafficMod,
  rentMod,
});

export const LOTS: readonly Lot[] = [
  // Seattle keeps the lot ids that saves from Phase 2 already use.
  { id: 'downtown-1', cityId: 'seattle', districtId: 'downtown', x: 11, y: 8, address: '700 Pine Street', trafficMod: 1, rentMod: 1 },
  { id: 'downtown-2', cityId: 'seattle', districtId: 'downtown', x: 15, y: 12, address: '1420 Fifth Avenue', trafficMod: 1.1, rentMod: 1.15 },
  { id: 'downtown-3', cityId: 'seattle', districtId: 'downtown', x: 10, y: 13, address: '301 Union Street', trafficMod: 0.9, rentMod: 0.9 },
  { id: 'old-town-1', cityId: 'seattle', districtId: 'old-town', x: 6, y: 12, address: '118 Cobble Lane', trafficMod: 1, rentMod: 1 },
  { id: 'old-town-2', cityId: 'seattle', districtId: 'old-town', x: 4, y: 14, address: '22 Tannery Row', trafficMod: 0.9, rentMod: 0.85 },
  { id: 'university-1', cityId: 'seattle', districtId: 'university', x: 16, y: 3, address: '4521 College Ave', trafficMod: 1, rentMod: 1 },
  { id: 'university-2', cityId: 'seattle', districtId: 'university', x: 20, y: 7, address: '812 Campus Parkway', trafficMod: 0.95, rentMod: 0.95 },
  { id: 'waterfront-1', cityId: 'seattle', districtId: 'waterfront', x: 10, y: 18, address: '88 Pier Street', trafficMod: 1, rentMod: 1 },
  { id: 'waterfront-2', cityId: 'seattle', districtId: 'waterfront', x: 16, y: 19, address: '1 Ferry Terminal Way', trafficMod: 1.15, rentMod: 1.2 },
  { id: 'waterfront-3', cityId: 'seattle', districtId: 'waterfront', x: 7, y: 17, address: '240 Harbor Walk', trafficMod: 0.9, rentMod: 0.9 },
  { id: 'hillside-1', cityId: 'seattle', districtId: 'hillside', x: 20, y: 12, address: '1604 Maple Terrace', trafficMod: 1, rentMod: 1 },
  { id: 'hillside-2', cityId: 'seattle', districtId: 'hillside', x: 22, y: 17, address: '930 Summit Road', trafficMod: 0.9, rentMod: 0.9 },
  { id: 'market-1', cityId: 'seattle', districtId: 'market', x: 6, y: 7, address: '410 Stall Street', trafficMod: 1, rentMod: 1 },
  { id: 'market-2', cityId: 'seattle', districtId: 'market', x: 5, y: 3, address: '55 Warehouse Lane', trafficMod: 0.9, rentMod: 0.9 },
  lotRow(1, 'portland', 'pearl', 5, 3, '1020 NW Glisan Street'),
  lotRow(2, 'portland', 'pearl', 9, 8, '33 NW Couch Street', 0.9, 0.9),
  lotRow(1, 'portland', 'pdx-downtown', 5, 12, '610 SW Alder Street'),
  lotRow(2, 'portland', 'pdx-downtown', 9, 17, '1200 SW Morrison Street', 1.1, 1.1),
  lotRow(1, 'portland', 'alberta', 16, 3, '2215 NE Alberta Street'),
  lotRow(2, 'portland', 'alberta', 21, 7, '4011 NE Killingsworth Street', 0.9, 0.85),
  lotRow(1, 'portland', 'hawthorne', 16, 12, '3528 SE Hawthorne Boulevard'),
  lotRow(2, 'portland', 'hawthorne', 21, 17, '1733 SE Division Street', 0.95, 0.9),
  lotRow(1, 'san-francisco', 'north-beach', 6, 5, '1500 Columbus Avenue'),
  lotRow(2, 'san-francisco', 'north-beach', 10, 6, '680 Green Street', 0.9, 0.9),
  lotRow(1, 'san-francisco', 'financial', 15, 6, '101 Montgomery Street', 1.1, 1.15),
  lotRow(2, 'san-francisco', 'financial', 16, 10, '345 California Street'),
  lotRow(1, 'san-francisco', 'embarcadero', 20, 10, 'Pier 7 Promenade'),
  lotRow(2, 'san-francisco', 'embarcadero', 20, 16, 'Pier 30 Waterfront', 0.95, 0.95),
  lotRow(1, 'san-francisco', 'mission', 11, 16, '2400 Valencia Street'),
  lotRow(2, 'san-francisco', 'mission', 15, 20, '3100 24th Street', 0.9, 0.9),
  lotRow(1, 'san-francisco', 'sunset', 5, 21, '1800 Irving Street'),
  lotRow(2, 'san-francisco', 'sunset', 1, 10, '4200 Judah Street', 0.9, 0.85),
];

export const lot = (id: string): Lot => {
  const l = LOTS.find((x) => x.id === id);
  if (!l) throw new Error(`Unknown lot ${id}`);
  return l;
};

export const lotsIn = (cityId: string): Lot[] => LOTS.filter((l) => l.cityId === cityId);

export const firstLotIn = (districtId: string): Lot => {
  const l = LOTS.find((x) => x.districtId === districtId);
  if (!l) throw new Error(`No lots in ${districtId}`);
  return l;
};

export const cityOfLot = (lotId: string): CityDef => city(lot(lotId).cityId);
