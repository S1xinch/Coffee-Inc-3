import { FIRST_NAMES, LAST_NAMES } from './catalog';
import { dollars, formatMoney, type Cents } from './money';
import { addLog } from './log';
import { pick, randomInt } from './rng';
import type { DepartmentId, Executive, GameState, Hq } from './state';

export const HQ_OPEN_COST = dollars(12_000);
export const HQ_WEEKLY_RENT = dollars(1_500);
export const HQ_MIN_STORES = 2;
export const BOARD_MEETING_WEEKS = 13;
export const MAX_DEPARTMENT_LEVEL = 3;

export interface Department {
  id: DepartmentId;
  name: string;
  blurb: string;
  // One-time build-out cost to reach level 1, 2, and 3.
  upgradeCost: readonly [Cents, Cents, Cents];
  weeklyPerLevel: Cents;
  chiefTitle: string;
  chiefSalary: Cents;
  effect: (level: number) => string;
}

export const DEPARTMENTS: readonly Department[] = [
  {
    id: 'hr',
    name: 'Human Resources',
    blurb: 'Keeps baristas happy and finds better applicants.',
    upgradeCost: [dollars(8_000), dollars(20_000), dollars(45_000)],
    weeklyPerLevel: dollars(500),
    chiefTitle: 'Chief People Officer',
    chiefSalary: dollars(2_400),
    effect: (l) => `${l * 15}% fewer quits, ${l} more applicants a week, stronger applicants`,
  },
  {
    id: 'finance',
    name: 'Finance',
    blurb: 'Better terms from the bank.',
    upgradeCost: [dollars(8_000), dollars(20_000), dollars(45_000)],
    weeklyPerLevel: dollars(500),
    chiefTitle: 'Chief Financial Officer',
    chiefSalary: dollars(2_800),
    effect: (l) => `Loan interest ${(l * 1.5).toFixed(1)} points lower, credit limit +${l * 15}%`,
  },
  {
    id: 'marketing',
    name: 'Marketing',
    blurb: 'A brand people recognize in every city.',
    upgradeCost: [dollars(10_000), dollars(24_000), dollars(50_000)],
    weeklyPerLevel: dollars(700),
    chiefTitle: 'Chief Marketing Officer',
    chiefSalary: dollars(2_600),
    effect: (l) => `+${l * 4}% foot traffic at every store, reputation grows faster`,
  },
  {
    id: 'engineering',
    name: 'Engineering',
    blurb: 'Maintenance crews for every machine you own.',
    upgradeCost: [dollars(8_000), dollars(18_000), dollars(40_000)],
    weeklyPerLevel: dollars(600),
    chiefTitle: 'Chief Operating Officer',
    chiefSalary: dollars(2_600),
    effect: (l) => `${l * 20}% fewer breakdowns, repairs ${l * 15}% cheaper`,
  },
  {
    id: 'executive',
    name: 'Executive Office',
    blurb: 'Runs board meetings and hires the C-suite.',
    upgradeCost: [dollars(12_000), dollars(30_000), dollars(60_000)],
    weeklyPerLevel: dollars(800),
    chiefTitle: 'Chief Executive Officer',
    chiefSalary: dollars(4_000),
    effect: (l) => `Board confidence +${l * 3} a meeting, company valuation +${l * 5}%`,
  },
  {
    id: 'investment',
    name: 'Investment',
    blurb: 'Stock market, real estate, and going public.',
    upgradeCost: [dollars(15_000), dollars(35_000), dollars(70_000)],
    weeklyPerLevel: dollars(700),
    chiefTitle: 'Chief Investment Officer',
    chiefSalary: dollars(3_000),
    effect: (l) => (l >= 2 ? 'Stocks, real estate, and an IPO' : l === 1 ? 'Stock market trading' : 'Nothing yet'),
  },
];

export const department = (id: DepartmentId): Department => DEPARTMENTS.find((d) => d.id === id)!;

export const emptyHq = (): Hq => ({
  open: false,
  openedHour: null,
  departments: { hr: 0, finance: 0, marketing: 0, engineering: 0, executive: 0, investment: 0 },
  executives: { hr: null, finance: null, marketing: null, engineering: null, executive: null, investment: null },
});

// A department's working level: its build-out level, plus one for a chief running it (up to 4).
export function deptLevel(state: GameState, id: DepartmentId): number {
  if (!state.hq.open) return 0;
  const built = state.hq.departments[id];
  return built + (built > 0 && state.hq.executives[id] ? 1 : 0);
}

// Hiring a chief needs the department built and, apart from the CEO, an Executive Office.
export function canHireChief(state: GameState, id: DepartmentId): string | null {
  if (!state.hq.open) return 'Open headquarters first.';
  if (state.hq.departments[id] < 1) return `Build the ${department(id).name} department first.`;
  if (id !== 'executive' && state.hq.departments.executive < 1) return 'Build the Executive Office first.';
  if (state.hq.executives[id]) return 'That seat is already filled.';
  return null;
}

export function newExecutive(state: GameState, id: DepartmentId): Executive {
  return {
    name: `${pick(state, FIRST_NAMES)} ${pick(state, LAST_NAMES)}`,
    look: randomInt(state, 0, 999),
    salary: department(id).chiefSalary,
    hiredHour: state.hour,
  };
}

export function hqWeeklyCost(state: GameState): Cents {
  if (!state.hq.open) return 0;
  let total = HQ_WEEKLY_RENT;
  for (const d of DEPARTMENTS) {
    total += state.hq.departments[d.id] * d.weeklyPerLevel;
    total += state.hq.executives[d.id]?.salary ?? 0;
  }
  return total;
}

// Quarter figures come from the weekly reports since the last meeting.
function quarter(state: GameState): { revenue: Cents; netIncome: Cents } {
  const recent = state.reports.slice(-BOARD_MEETING_WEEKS);
  return {
    revenue: recent.reduce((s, r) => s + r.income.revenue, 0),
    netIncome: recent.reduce((s, r) => s + r.income.netIncome, 0),
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Every quarter the board compares results to the targets it set last time and sets new ones.
export function boardMeeting(state: GameState, week: number): void {
  if (!state.hq.open || week % BOARD_MEETING_WEEKS !== 0) return;
  const b = state.board;
  const q = quarter(state);
  const hitRevenue = b.targetRevenue === null || q.revenue >= b.targetRevenue;
  const hitProfit = b.targetNetIncome === null || q.netIncome >= b.targetNetIncome;
  const exec = deptLevel(state, 'executive');
  const first = b.targetRevenue === null;
  const change = first ? 0 : (hitRevenue ? 8 : -8) + (hitProfit ? 8 : -10) + exec * 3;
  b.confidence = clamp(Math.round(b.confidence + change), 0, 100);

  const note = first
    ? `First meeting. The board set targets of ${formatMoney(Math.round(q.revenue * 1.08))} revenue for next quarter.`
    : hitRevenue && hitProfit
      ? 'Both targets met. The board is pleased.'
      : hitRevenue
        ? 'Revenue target met, but profit fell short.'
        : hitProfit
          ? 'Profit target met, but revenue fell short.'
          : 'Both targets missed. The board expects a turnaround.';
  b.meetings.push({ week, revenue: q.revenue, netIncome: q.netIncome, targetRevenue: b.targetRevenue, targetNetIncome: b.targetNetIncome, confidence: b.confidence, note });
  if (b.meetings.length > 8) b.meetings.splice(0, b.meetings.length - 8);
  b.targetRevenue = Math.round(q.revenue * 1.08);
  b.targetNetIncome = q.netIncome > 0 ? Math.round(q.netIncome * 1.05) : 0;
  addLog(state, first || (hitRevenue && hitProfit) ? 'good' : 'bad', `Board meeting: ${note} Confidence is ${b.confidence}.`);
}
