import { dollars, formatMoney, type Cents } from './money';
import { post } from './ledger';
import { addLog } from './log';
import { newId, pick, random } from './rng';
import { isWorking, readiness, workingEquipment } from './store';
import type { GameState, PendingIncident, Staff } from './state';

export interface IncidentOption {
  label: string;
  detail: string;
  cost: Cents;
  apply: (state: GameState, staff: Staff | undefined) => void;
}

export interface IncidentDef {
  id: string;
  title: string;
  weight: number;
  staff: 'none' | 'any' | 'working';
  condition: (state: GameState) => boolean;
  text: (staffName: string) => string;
  options: IncidentOption[];
  defaultOption: number;
}

export const MAX_PENDING_INCIDENTS = 3;
export const INCIDENT_DAILY_CHANCE = 0.35;
export const INCIDENT_DEADLINE_HOURS = 24;

const clampMorale = (v: number) => Math.min(100, Math.max(0, v));
const adjustReputation = (state: GameState, delta: number) => {
  state.store.reputation = Math.min(100, Math.max(0, state.store.reputation + delta));
};
const spend = (state: GameState, memo: string, account: 'repairs' | 'marketing' | 'otherExpense', amount: Cents) =>
  post(state, memo, 'operating', [[account, amount], ['cash', -amount]]);

export const INCIDENTS: readonly IncidentDef[] = [
  {
    id: 'leaky-machine',
    title: 'Leaky espresso machine',
    weight: 1,
    staff: 'none',
    condition: (s) => workingEquipment(s, 'espresso') !== undefined,
    text: () => 'Water is dripping from the group head of the espresso machine.',
    options: [
      {
        label: 'Call the technician',
        detail: 'Fixed today, no risk.',
        cost: dollars(350),
        apply: (s) => {
          spend(s, 'Espresso machine service call', 'repairs', dollars(350));
          addLog(s, 'info', 'The technician fixed the leak.');
        },
      },
      {
        label: 'Keep pulling shots',
        detail: 'Free, but the machine may break down.',
        cost: 0,
        apply: (s) => {
          const machine = workingEquipment(s, 'espresso');
          if (machine && random(s) < 0.35) {
            machine.broken = true;
            addLog(s, 'bad', 'The espresso machine broke down. Repair it from the Build tab.');
          } else {
            addLog(s, 'info', 'The leak stopped on its own.');
          }
        },
      },
    ],
    defaultOption: 1,
  },
  {
    id: 'raise-request',
    title: 'Raise request',
    weight: 1,
    staff: 'any',
    condition: (s) => s.staff.length > 0,
    text: (name) => `${name} asks for a raise of $1.50 an hour.`,
    options: [
      {
        label: 'Approve the raise',
        detail: '+$1.50/h wage, morale up.',
        cost: 0,
        apply: (s, staff) => {
          if (!staff) return;
          staff.wage += dollars(1.5);
          staff.morale = clampMorale(staff.morale + 10);
          addLog(s, 'good', `${staff.name} is happy with the raise.`);
        },
      },
      {
        label: 'Decline',
        detail: 'Morale down.',
        cost: 0,
        apply: (s, staff) => {
          if (!staff) return;
          staff.morale = clampMorale(staff.morale - 12);
          addLog(s, 'bad', `${staff.name} is disappointed.`);
        },
      },
    ],
    defaultOption: 1,
  },
  {
    id: 'food-blogger',
    title: 'Food blogger visiting',
    weight: 0.8,
    staff: 'none',
    condition: (s) => readiness(s).ready,
    text: () => 'A local food blogger with a big following just walked in.',
    options: [
      {
        label: 'Comp their order',
        detail: 'Small cost, reputation up.',
        cost: dollars(25),
        apply: (s) => {
          spend(s, 'Comped order for food blogger', 'marketing', dollars(25));
          adjustReputation(s, 3);
          addLog(s, 'good', 'The blogger posted a glowing review.');
        },
      },
      {
        label: 'Treat them like any customer',
        detail: 'Result depends on customer satisfaction.',
        cost: 0,
        apply: (s) => {
          const good = s.store.satisfaction >= 60;
          adjustReputation(s, good ? 1 : -1);
          addLog(s, good ? 'good' : 'bad', good ? 'The blogger liked the place.' : 'The blogger was not impressed.');
        },
      },
    ],
    defaultOption: 1,
  },
  {
    id: 'long-line',
    title: 'Complaint about the line',
    weight: 1,
    staff: 'none',
    condition: (s) => !!s.yesterday && s.yesterday.lost > 10 && s.yesterday.lost > 0.1 * (s.yesterday.served + s.yesterday.lost),
    text: () => 'A regular says the line was so long yesterday that they left without ordering.',
    options: [
      {
        label: 'Hand out drink vouchers',
        detail: 'Win some goodwill back.',
        cost: dollars(40),
        apply: (s) => {
          spend(s, 'Drink vouchers', 'marketing', dollars(40));
          adjustReputation(s, 1);
          addLog(s, 'good', 'Customers appreciated the vouchers.');
        },
      },
      {
        label: 'Apologize and move on',
        detail: 'Reputation dips a little.',
        cost: 0,
        apply: (s) => {
          adjustReputation(s, -1);
          addLog(s, 'bad', 'Word is getting around about the long lines.');
        },
      },
    ],
    defaultOption: 1,
  },
  {
    id: 'supplier-spike',
    title: 'Milk prices went up',
    weight: 0.8,
    staff: 'none',
    condition: (s) => !s.modifiers.some((m) => m.kind === 'supplierCost' && m.untilHour > s.hour),
    text: () => 'Your dairy supplier raised prices for the coming week.',
    options: [
      {
        label: 'Accept the new price',
        detail: 'Ingredient costs +15% for 7 days.',
        cost: 0,
        apply: (s) => {
          s.modifiers.push({ kind: 'supplierCost', value: 1.15, untilHour: s.hour + 168 });
          addLog(s, 'info', 'Ingredient costs are up 15% this week.');
        },
      },
      {
        label: 'Switch to a cheaper supplier',
        detail: 'Drink quality drops for 7 days.',
        cost: 0,
        apply: (s) => {
          s.modifiers.push({ kind: 'qualityPenalty', value: 0.1, untilHour: s.hour + 168 });
          addLog(s, 'info', 'You switched suppliers. Drinks taste a bit flatter this week.');
        },
      },
    ],
    defaultOption: 0,
  },
  {
    id: 'health-inspection',
    title: 'Health inspection',
    weight: 0.6,
    staff: 'none',
    condition: (s) => readiness(s).ready,
    text: () => 'A city health inspector is here for a surprise visit.',
    options: [
      {
        label: 'Welcome them in',
        detail: 'A motivated team keeps the place spotless.',
        cost: 0,
        apply: (s) => {
          const avgMorale = s.staff.reduce((a, b) => a + b.morale, 0) / Math.max(1, s.staff.length);
          if (avgMorale >= 45) {
            adjustReputation(s, 1);
            addLog(s, 'good', 'Passed the health inspection with no notes.');
          } else {
            spend(s, 'Health code fine', 'otherExpense', dollars(400));
            adjustReputation(s, -3);
            addLog(s, 'bad', `Failed the inspection. Fined ${formatMoney(dollars(400))}. A tired, unhappy team cuts corners.`);
          }
        },
      },
    ],
    defaultOption: 0,
  },
  {
    id: 'barista-sick',
    title: 'Called in sick',
    weight: 1,
    staff: 'working',
    condition: (s) => s.staff.some((st) => isWorking(st, s.hour)),
    text: (name) => `${name} woke up with a fever.`,
    options: [
      {
        label: 'Tell them to rest',
        detail: 'Paid day off, morale up.',
        cost: 0,
        apply: (s, staff) => {
          if (!staff) return;
          staff.sickUntilHour = s.hour + 24;
          staff.morale = clampMorale(staff.morale + 5);
          addLog(s, 'info', `${staff.name} is resting today.`);
        },
      },
      {
        label: 'Ask them to come in anyway',
        detail: 'Morale drops sharply.',
        cost: 0,
        apply: (s, staff) => {
          if (!staff) return;
          staff.morale = clampMorale(staff.morale - 15);
          addLog(s, 'bad', `${staff.name} came in, but is not happy about it.`);
        },
      },
    ],
    defaultOption: 0,
  },
  {
    id: 'street-festival',
    title: 'Street festival',
    weight: 0.7,
    staff: 'none',
    condition: (s) => readiness(s).ready,
    text: () => 'The neighborhood is holding a street festival over the next two days.',
    options: [
      {
        label: 'Run a sidewalk stand',
        detail: 'Foot traffic +35% for 2 days.',
        cost: dollars(250),
        apply: (s) => {
          spend(s, 'Street festival stand', 'marketing', dollars(250));
          s.modifiers.push({ kind: 'trafficBoost', value: 1.35, untilHour: s.hour + 48 });
          addLog(s, 'good', 'Your sidewalk stand is drawing a crowd.');
        },
      },
      {
        label: 'Skip it',
        detail: 'No cost, no boost.',
        cost: 0,
        apply: (s) => addLog(s, 'info', 'You sat out the festival.'),
      },
    ],
    defaultOption: 1,
  },
];

export const incidentDef = (id: string): IncidentDef => {
  const d = INCIDENTS.find((i) => i.id === id);
  if (!d) throw new Error(`Unknown incident ${id}`);
  return d;
};

export function maybeRollIncident(state: GameState): void {
  if (state.incidents.length >= MAX_PENDING_INCIDENTS) return;
  if (random(state) >= INCIDENT_DAILY_CHANCE) return;
  const eligible = INCIDENTS.filter((d) => d.condition(state) && !state.incidents.some((p) => p.defId === d.id));
  if (eligible.length === 0) return;
  const total = eligible.reduce((s, d) => s + d.weight, 0);
  let roll = random(state) * total;
  const def = eligible.find((d) => (roll -= d.weight) < 0) ?? eligible[eligible.length - 1]!;
  let staffId: string | null = null;
  if (def.staff !== 'none') {
    const pool = def.staff === 'working' ? state.staff.filter((s) => isWorking(s, state.hour)) : state.staff;
    if (pool.length === 0) return;
    staffId = pick(state, pool).id;
  }
  state.incidents.push({
    id: newId(state, 'i'),
    defId: def.id,
    createdHour: state.hour,
    deadlineHour: state.hour + INCIDENT_DEADLINE_HOURS,
    staffId,
  });
}

export function incidentStaff(state: GameState, incident: PendingIncident): Staff | undefined {
  return incident.staffId ? state.staff.find((s) => s.id === incident.staffId) : undefined;
}

export function applyIncidentOption(state: GameState, incident: PendingIncident, optionIndex: number): void {
  const def = incidentDef(incident.defId);
  const option = def.options[optionIndex];
  if (!option) throw new Error(`Incident ${def.id} has no option ${optionIndex}`);
  state.incidents = state.incidents.filter((i) => i.id !== incident.id);
  option.apply(state, incidentStaff(state, incident));
}

// Every incident ends by its deadline, so nothing can sit unresolved and block play.
export function autoResolveOverdue(state: GameState): void {
  for (const incident of state.incidents.filter((i) => i.deadlineHour <= state.hour)) {
    const def = incidentDef(incident.defId);
    addLog(state, 'info', `Handled automatically: ${def.title} (${def.options[def.defaultOption]!.label}).`);
    state.lifetime.incidentsAutoResolved += 1;
    applyIncidentOption(state, incident, def.defaultOption);
  }
}
