import { dollars, type Cents } from './money';

export const OPEN_HOUR = 7;
export const CLOSE_HOUR = 19;
export const START_HOUR = 6;
export const HOURS_PER_WEEK = 24 * 7;

export const STARTING_CAPITAL = dollars(40_000);
export const MAX_STAFF = 6;
export const TRAINING_COST = dollars(300);
export const TRAINING_HOURS = 24;
export const RECRUITING_COST = dollars(150);
export const RAISE_STEP = dollars(1);
export const UTILITIES_PER_OPEN_DAY = dollars(60);
export const LOAN_APR = 0.09;
export const LOAN_STEP = dollars(5_000);
export const BANKRUPTCY_GRACE_WEEKS = 3;
export const RESALE_RATE = 0.4;
export const REPAIR_RATE = 0.12;
export const MIN_PRICE = dollars(0.5);
export const MAX_PRICE = dollars(20);
export const REPORTS_KEPT = 52;
export const LOG_KEPT = 80;
export const MANAGER_SALARY = dollars(1_100);
export const LEASE_SIGNING_WEEKS = 1;

export type DistrictStyle = 'towers' | 'brick' | 'campus' | 'warehouse' | 'harbor' | 'houses';

export interface Neighborhood {
  id: string;
  cityId: string;
  name: string;
  blurb: string;
  style: DistrictStyle;
  trafficPerHour: number;
  weeklyRent: Cents;
  priceSensitivity: number;
}

const district = (cityId: string, id: string, name: string, style: DistrictStyle, trafficPerHour: number, rent: number, priceSensitivity: number, blurb: string): Neighborhood => ({
  id,
  cityId,
  name,
  blurb,
  style,
  trafficPerHour,
  weeklyRent: dollars(rent),
  priceSensitivity,
});

export const NEIGHBORHOODS: readonly Neighborhood[] = [
  district('seattle', 'old-town', 'Old Town', 'brick', 200, 1_100, 1.0, 'Quiet brick streets and loyal locals. Cheapest lease, slowest foot traffic.'),
  district('seattle', 'hillside', 'Hillside', 'houses', 180, 950, 1.2, 'Leafy streets of houses. Neighbors who come back every day.'),
  district('seattle', 'university', 'University District', 'campus', 260, 1_500, 1.6, 'Busy all day with students who watch every dollar.'),
  district('seattle', 'market', 'Market District', 'warehouse', 240, 1_700, 1.1, 'Old warehouses turned into food halls and studios.'),
  district('seattle', 'waterfront', 'Waterfront', 'harbor', 290, 2_200, 0.9, 'Ferry commuters and tourists walking the piers.'),
  district('seattle', 'downtown', 'Downtown', 'towers', 330, 3_000, 0.7, 'Office crowds with big morning rushes. Premium lease.'),
  district('portland', 'pearl', 'Pearl District', 'warehouse', 250, 1_600, 1.0, 'Converted warehouses full of galleries and lofts.'),
  district('portland', 'pdx-downtown', 'Downtown Portland', 'towers', 300, 2_300, 0.8, 'Office towers and food carts on every corner.'),
  district('portland', 'alberta', 'Alberta Arts', 'houses', 190, 900, 1.3, 'Murals, bungalows, and neighbors on bikes.'),
  district('portland', 'hawthorne', 'Hawthorne', 'brick', 220, 1_050, 1.2, 'Vintage shops and a crowd that knows its roasts.'),
  district('san-francisco', 'financial', 'Financial District', 'towers', 380, 4_200, 0.6, 'Bankers who never ask the price. The most expensive leases in the game.'),
  district('san-francisco', 'north-beach', 'North Beach', 'brick', 260, 2_600, 0.9, 'Old espresso bars and late nights.'),
  district('san-francisco', 'embarcadero', 'Embarcadero', 'harbor', 340, 3_600, 0.8, 'Ferry crowds along the bay.'),
  district('san-francisco', 'mission', 'Mission District', 'warehouse', 300, 2_400, 1.2, 'Sunny, busy, and full of coffee snobs.'),
  district('san-francisco', 'sunset', 'Sunset', 'houses', 210, 1_700, 1.3, 'Foggy rows of houses near the ocean.'),
];

export const districtsIn = (cityId: string): Neighborhood[] => NEIGHBORHOODS.filter((n) => n.cityId === cityId);

export type EquipmentCategory =
  | 'register'
  | 'espresso'
  | 'grinder'
  | 'drip'
  | 'coldbrew'
  | 'pastry'
  | 'seating'
  | 'decor';

export interface EquipmentType {
  id: string;
  name: string;
  category: EquipmentCategory;
  cost: Cents;
  lifeWeeks: number;
  max: number;
  quality: number;
  capacity: number;
  ambiance: number;
  description: string;
}

// Categories where only one unit may exist; buying another tier trades the old one in.
export const SINGLE_UNIT_CATEGORIES: readonly EquipmentCategory[] = [
  'register',
  'espresso',
  'grinder',
  'drip',
  'coldbrew',
  'pastry',
];

export const EQUIPMENT: readonly EquipmentType[] = [
  { id: 'register', name: 'Cash Register', category: 'register', cost: dollars(900), lifeWeeks: 156, max: 1, quality: 0, capacity: 90, ambiance: 0, description: 'Required to take orders. Handles up to 90 orders an hour.' },
  { id: 'espresso-1', name: 'Single Group Espresso Machine', category: 'espresso', cost: dollars(3_200), lifeWeeks: 104, max: 1, quality: 1, capacity: 35, ambiance: 0, description: 'Unlocks espresso drinks. Up to 35 drinks an hour.' },
  { id: 'espresso-2', name: 'Double Group Espresso Machine', category: 'espresso', cost: dollars(8_500), lifeWeeks: 104, max: 1, quality: 2, capacity: 70, ambiance: 0, description: 'Better shots, twice the output. Up to 70 drinks an hour.' },
  { id: 'espresso-3', name: 'Triple Group Pro Espresso Machine', category: 'espresso', cost: dollars(19_000), lifeWeeks: 104, max: 1, quality: 3, capacity: 110, ambiance: 1, description: 'Cafe-show quality. Up to 110 drinks an hour.' },
  { id: 'grinder-1', name: 'Burr Grinder', category: 'grinder', cost: dollars(1_400), lifeWeeks: 104, max: 1, quality: 0.1, capacity: 0, ambiance: 0, description: 'Fresh grounds raise coffee quality.' },
  { id: 'grinder-2', name: 'Precision Grinder', category: 'grinder', cost: dollars(3_800), lifeWeeks: 104, max: 1, quality: 0.2, capacity: 0, ambiance: 0, description: 'Dialed-in grind for the best cup.' },
  { id: 'drip', name: 'Batch Brewer', category: 'drip', cost: dollars(1_100), lifeWeeks: 104, max: 1, quality: 0, capacity: 80, ambiance: 0, description: 'Unlocks drip coffee. Up to 80 cups an hour.' },
  { id: 'coldbrew', name: 'Cold Brew Tower', category: 'coldbrew', cost: dollars(1_600), lifeWeeks: 104, max: 1, quality: 0, capacity: 60, ambiance: 1, description: 'Unlocks cold brew. Up to 60 cups an hour.' },
  { id: 'pastry', name: 'Pastry Case', category: 'pastry', cost: dollars(1_300), lifeWeeks: 156, max: 1, quality: 0, capacity: 0, ambiance: 1, description: 'Unlocks croissants and muffins.' },
  { id: 'table', name: 'Two-Top Table', category: 'seating', cost: dollars(350), lifeWeeks: 156, max: 6, quality: 0, capacity: 0, ambiance: 1, description: 'Seats two. Seating makes people stay and come back.' },
  { id: 'armchair', name: 'Lounge Armchairs', category: 'seating', cost: dollars(900), lifeWeeks: 156, max: 2, quality: 0, capacity: 0, ambiance: 2, description: 'A cozy corner for regulars.' },
  { id: 'plant', name: 'Potted Plant', category: 'decor', cost: dollars(120), lifeWeeks: 156, max: 4, quality: 0, capacity: 0, ambiance: 1, description: 'A little green goes a long way.' },
  { id: 'art', name: 'Wall Art', category: 'decor', cost: dollars(400), lifeWeeks: 156, max: 2, quality: 0, capacity: 0, ambiance: 2, description: 'Local artists on your walls.' },
  { id: 'lights', name: 'Pendant Lighting', category: 'decor', cost: dollars(1_500), lifeWeeks: 156, max: 1, quality: 0, capacity: 0, ambiance: 3, description: 'Warm light over the whole room.' },
];

export type MenuCategory = 'espresso' | 'drip' | 'coldbrew' | 'pastry';

export interface MenuItem {
  id: string;
  name: string;
  category: MenuCategory;
  unitCost: Cents;
  refPrice: Cents;
  popularity: number;
  elasticity: number;
}

export const MENU: readonly MenuItem[] = [
  { id: 'espresso', name: 'Espresso', category: 'espresso', unitCost: dollars(0.45), refPrice: dollars(2.75), popularity: 0.6, elasticity: 1.1 },
  { id: 'americano', name: 'Americano', category: 'espresso', unitCost: dollars(0.55), refPrice: dollars(3.25), popularity: 1.0, elasticity: 1.2 },
  { id: 'latte', name: 'Latte', category: 'espresso', unitCost: dollars(0.95), refPrice: dollars(4.75), popularity: 1.6, elasticity: 1.0 },
  { id: 'cappuccino', name: 'Cappuccino', category: 'espresso', unitCost: dollars(0.9), refPrice: dollars(4.5), popularity: 1.1, elasticity: 1.0 },
  { id: 'mocha', name: 'Mocha', category: 'espresso', unitCost: dollars(1.15), refPrice: dollars(5.25), popularity: 0.8, elasticity: 1.1 },
  { id: 'drip', name: 'Drip Coffee', category: 'drip', unitCost: dollars(0.35), refPrice: dollars(2.5), popularity: 1.2, elasticity: 1.4 },
  { id: 'coldbrew', name: 'Cold Brew', category: 'coldbrew', unitCost: dollars(0.7), refPrice: dollars(4.25), popularity: 0.9, elasticity: 1.1 },
  { id: 'croissant', name: 'Croissant', category: 'pastry', unitCost: dollars(0.8), refPrice: dollars(3.25), popularity: 1.0, elasticity: 1.2 },
  { id: 'muffin', name: 'Blueberry Muffin', category: 'pastry', unitCost: dollars(0.7), refPrice: dollars(3.0), popularity: 0.9, elasticity: 1.2 },
];

export const MENU_CATEGORY_EQUIPMENT: Record<MenuCategory, EquipmentCategory> = {
  espresso: 'espresso',
  drip: 'drip',
  coldbrew: 'coldbrew',
  pastry: 'pastry',
};

// Hour-of-day traffic shape for open hours 7..18.
export const TRAFFIC_CURVE: Record<number, number> = {
  7: 1.0, 8: 1.4, 9: 1.1, 10: 0.7, 11: 0.8, 12: 1.2,
  13: 1.0, 14: 0.6, 15: 0.8, 16: 0.7, 17: 0.6, 18: 0.4,
};

// Index 0 is Monday; day 1 of a new game is a Monday.
export const DAY_TRAFFIC = [1.0, 1.0, 1.0, 1.0, 1.05, 1.15, 0.9];
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const FIRST_NAMES = [
  'Ava', 'Ben', 'Carmen', 'Dev', 'Elena', 'Felix', 'Grace', 'Hiro', 'Imani', 'Jonah',
  'Kai', 'Lena', 'Marco', 'Nia', 'Omar', 'Priya', 'Quinn', 'Rosa', 'Sam', 'Tariq',
  'Uma', 'Victor', 'Wren', 'Ximena', 'Yusuf', 'Zoe', 'Leo', 'Maya', 'Noah', 'Iris',
];
export const LAST_NAMES = [
  'Alvarez', 'Brooks', 'Chen', 'Dubois', 'Evans', 'Fischer', 'Garcia', 'Hale', 'Ito', 'Jensen',
  'Kim', 'Lopez', 'Moreau', 'Nguyen', 'Okafor', 'Park', 'Quist', 'Rossi', 'Singh', 'Tanaka',
];

export const equipmentType = (id: string): EquipmentType => {
  const t = EQUIPMENT.find((e) => e.id === id);
  if (!t) throw new Error(`Unknown equipment type ${id}`);
  return t;
};

export const menuItem = (id: string): MenuItem => {
  const m = MENU.find((e) => e.id === id);
  if (!m) throw new Error(`Unknown menu item ${id}`);
  return m;
};

export const neighborhood = (id: string): Neighborhood => {
  const n = NEIGHBORHOODS.find((e) => e.id === id);
  if (!n) throw new Error(`Unknown neighborhood ${id}`);
  return n;
};

export const BRAND_COLORS = ['#2f6f8f', '#b4501a', '#2f7d4a', '#8a3b5c', '#c28a1e', '#3a4a8c'] as const;

export const marketWage = (skill: number): Cents => dollars(14 + skill * 1.4);
