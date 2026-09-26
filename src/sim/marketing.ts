import { dollars, type Cents } from './money';
import type { GameState } from './state';

export interface CampaignLevel {
  label: string;
  weeklyCost: Cents;
  perCup: Cents;
  traffic: number;
  buzz: number;
  atmosphere: number;
}

export interface Campaign {
  id: string;
  name: string;
  description: string;
  levels: readonly CampaignLevel[];
}

const OFF: CampaignLevel = { label: 'Off', weeklyCost: 0, perCup: 0, traffic: 0, buzz: 0, atmosphere: 0 };
const level = (l: Partial<CampaignLevel> & { label: string }): CampaignLevel => ({ ...OFF, ...l });

export const CAMPAIGNS: readonly Campaign[] = [
  {
    id: 'cups',
    name: 'Recyclable Cups',
    description: 'Customers notice. The room feels better to people who care.',
    levels: [OFF, level({ label: 'On', perCup: dollars(0.06), atmosphere: 0.08 })],
  },
  {
    id: 'mail',
    name: 'Direct Mail',
    description: 'Postcards to nearby homes and offices.',
    levels: [OFF, level({ label: 'On', weeklyCost: dollars(250), traffic: 0.08 })],
  },
  {
    id: 'catering',
    name: 'Catering',
    description: 'Coffee for local meetings and events.',
    levels: [OFF, level({ label: 'On', weeklyCost: dollars(350), traffic: 0.05, buzz: 0.1 })],
  },
  {
    id: 'sponsors',
    name: 'Community Sponsors',
    description: 'Little league jerseys, street fairs, school fundraisers.',
    levels: [OFF, level({ label: 'Modest', weeklyCost: dollars(200), buzz: 0.1 }), level({ label: 'Generous', weeklyCost: dollars(500), buzz: 0.25 })],
  },
  {
    id: 'social',
    name: 'Social Media',
    description: 'Photos of the latte art, posted daily.',
    levels: [OFF, level({ label: 'On', weeklyCost: dollars(300), traffic: 0.1 })],
  },
  {
    id: 'search',
    name: 'Local Paid Search',
    description: 'Top result for "coffee near me".',
    levels: [OFF, level({ label: 'On', weeklyCost: dollars(450), traffic: 0.14 })],
  },
];

export const campaign = (id: string): Campaign => {
  const c = CAMPAIGNS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown campaign ${id}`);
  return c;
};

export function activeLevels(state: GameState): CampaignLevel[] {
  return CAMPAIGNS.map((c) => c.levels[state.store.marketing[c.id] ?? 0] ?? OFF);
}

export const marketingTraffic = (state: GameState): number => activeLevels(state).reduce((m, l) => m * (1 + l.traffic), 1);
export const marketingBuzz = (state: GameState): number => activeLevels(state).reduce((s, l) => s + l.buzz, 0);
export const marketingAtmosphere = (state: GameState): number => activeLevels(state).reduce((s, l) => s + l.atmosphere, 0);
export const perCupCost = (state: GameState): Cents => activeLevels(state).reduce((s, l) => s + l.perCup, 0);
export const weeklyMarketingCost = (state: GameState): Cents => activeLevels(state).reduce((s, l) => s + l.weeklyCost, 0);
