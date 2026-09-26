import { dollars, formatMoney, type Cents } from './money';
import { post } from './ledger';
import { addLog } from './log';
import { newId, pick, random } from './rng';
import { deptLevel } from './hq';
import { isWorking, readiness, workingEquipment } from './store';
import type { GameState, PendingIncident, Staff, Store } from './state';

export interface IncidentOption {
  label: string;
  detail: string;
  cost: Cents;
  apply: (state: GameState, store: Store, staff: Staff | undefined) => void;
}

export interface IncidentDef {
  id: string;
  title: string;
  weight: number;
  staff: 'none' | 'any' | 'working';
  condition: (state: GameState, store: Store) => boolean;
  text: (staffName: string) => string;
  options: IncidentOption[];
  defaultOption: number;
}

export const MAX_PENDING_INCIDENTS = 3;
export const INCIDENT_DAILY_CHANCE = 0.35;
export const INCIDENT_DEADLINE_HOURS = 24;

const clampMorale = (v: number) => Math.min(100, Math.max(0, v));
const adjustReputation = (store: Store, delta: number) => {
  store.reputation = Math.min(100, Math.max(0, store.reputation + delta));
};
const spend = (state: GameState, store: Store, memo: string, account: 'repairs' | 'marketing' | 'otherExpense', amount: Cents) =>
  post(state, memo, 'operating', [[account, amount], ['cash', -amount]], store.id);

export const INCIDENTS: readonly IncidentDef[] = [
  {
    id: 'leaky-machine',
    title: 'Leaky espresso machine',
    weight: 1,
    staff: 'none',
    condition: (_s, st) => workingEquipment(st, 'espresso') !== undefined,
    text: () => 'Water is dripping from the group head of the espresso machine.',
    options: [
      {
        label: 'Call the technician',
        detail: 'Fixed today, no risk.',
        cost: dollars(350),
        apply: (s, st) => {
          spend(s, st, 'Espresso machine service call', 'repairs', dollars(350));
          addLog(s, 'info', 'The technician fixed the leak.');
        },
      },
      {
        label: 'Keep pulling shots',
        detail: 'Free, but the machine may break down.',
        cost: 0,
        apply: (s, st) => {
          const machine = workingEquipment(st, 'espresso');
          // Engineering's maintenance crews make breakdowns rarer.
          if (machine && random(s) < 0.35 * (1 - 0.2 * deptLevel(s, 'engineering'))) {
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
    condition: (_s, st) => st.staff.length > 0,
    text: (name) => `${name} asks for a raise of $1.50 an hour.`,
    options: [
      {
        label: 'Approve the raise',
        detail: '+$1.50/h wage, morale up.',
        cost: 0,
        apply: (s, _st, staff) => {
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
        apply: (s, _st, staff) => {
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
    condition: (s, st) => readiness(s, st).ready,
    text: () => 'A local food blogger with a big following just walked in.',
    options: [
      {
        label: 'Comp their order',
        detail: 'Small cost, reputation up.',
        cost: dollars(25),
        apply: (s, st) => {
          spend(s, st, 'Comped order for food blogger', 'marketing', dollars(25));
          adjustReputation(st, 3);
          addLog(s, 'good', 'The blogger posted a glowing review.');
        },
      },
      {
        label: 'Treat them like any customer',
        detail: 'Result depends on customer satisfaction.',
        cost: 0,
        apply: (s, st) => {
          const good = st.satisfaction >= 60;
          adjustReputation(st, good ? 1 : -1);
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
    condition: (_s, st) => !!st.yesterday && st.yesterday.lost > 10 && st.yesterday.lost > 0.1 * (st.yesterday.served + st.yesterday.lost),
    text: () => 'A regular says the line was so long yesterday that they left without ordering.',
    options: [
      {
        label: 'Hand out drink vouchers',
        detail: 'Win some goodwill back.',
        cost: dollars(40),
        apply: (s, st) => {
          spend(s, st, 'Drink vouchers', 'marketing', dollars(40));
          adjustReputation(st, 1);
          addLog(s, 'good', 'Customers appreciated the vouchers.');
        },
      },
      {
        label: 'Apologize and move on',
        detail: 'Reputation dips a little.',
        cost: 0,
        apply: (s, st) => {
          adjustReputation(st, -1);
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
    condition: (s, st) => !s.modifiers.some((m) => m.storeId === st.id && m.kind === 'supplierCost' && m.untilHour > s.hour),
    text: () => 'Your dairy supplier raised prices for the coming week.',
    options: [
      {
        label: 'Accept the new price',
        detail: 'Ingredient costs +15% for 7 days.',
        cost: 0,
        apply: (s, st) => {
          s.modifiers.push({ storeId: st.id, kind: 'supplierCost', value: 1.15, untilHour: s.hour + 168 });
          addLog(s, 'info', 'Ingredient costs are up 15% this week.');
        },
      },
      {
        label: 'Switch to a cheaper supplier',
        detail: 'Drink quality drops for 7 days.',
        cost: 0,
        apply: (s, st) => {
          s.modifiers.push({ storeId: st.id, kind: 'qualityPenalty', value: 0.1, untilHour: s.hour + 168 });
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
    condition: (s, st) => readiness(s, st).ready,
    text: () => 'A city health inspector is here for a surprise visit.',
    options: [
      {
        label: 'Welcome them in',
        detail: 'A motivated team keeps the place spotless.',
        cost: 0,
        apply: (s, st) => {
          const avgMorale = st.staff.reduce((a, b) => a + b.morale, 0) / Math.max(1, st.staff.length);
          if (avgMorale >= 45) {
            adjustReputation(st, 1);
            addLog(s, 'good', 'Passed the health inspection with no notes.');
          } else {
            spend(s, st, 'Health code fine', 'otherExpense', dollars(400));
            adjustReputation(st, -3);
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
    condition: (s, st) => st.staff.some((p) => isWorking(p, s.hour)),
    text: (name) => `${name} woke up with a fever.`,
    options: [
      {
        label: 'Tell them to rest',
        detail: 'Paid day off, morale up.',
        cost: 0,
        apply: (s, _st, staff) => {
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
        apply: (s, _st, staff) => {
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
    condition: (s, st) => readiness(s, st).ready,
    text: () => 'The neighborhood is holding a street festival over the next two days.',
    options: [
      {
        label: 'Run a sidewalk stand',
        detail: 'Foot traffic +35% for 2 days.',
        cost: dollars(250),
        apply: (s, st) => {
          spend(s, st, 'Street festival stand', 'marketing', dollars(250));
          s.modifiers.push({ storeId: st.id, kind: 'trafficBoost', value: 1.35, untilHour: s.hour + 48 });
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

const incidentStore = (state: GameState, incident: PendingIncident): Store | undefined => state.stores.find((s) => s.id === incident.storeId);

export function maybeRollIncident(state: GameState, store: Store): void {
  // Nothing happens at a store that has not opened yet.
  if (!readiness(state, store).ready) return;
  if (state.incidents.filter((i) => i.storeId === store.id).length >= MAX_PENDING_INCIDENTS) return;
  if (random(state) >= INCIDENT_DAILY_CHANCE) return;
  const eligible = INCIDENTS.filter((d) => d.condition(state, store) && !state.incidents.some((p) => p.defId === d.id && p.storeId === store.id));
  if (eligible.length === 0) return;
  const total = eligible.reduce((s, d) => s + d.weight, 0);
  let roll = random(state) * total;
  const def = eligible.find((d) => (roll -= d.weight) < 0) ?? eligible[eligible.length - 1]!;
  let staffId: string | null = null;
  if (def.staff !== 'none') {
    const pool = def.staff === 'working' ? store.staff.filter((s) => isWorking(s, state.hour)) : store.staff;
    if (pool.length === 0) return;
    staffId = pick(state, pool).id;
  }
  const incident: PendingIncident = {
    id: newId(state, 'i'),
    defId: def.id,
    createdHour: state.hour,
    deadlineHour: state.hour + INCIDENT_DEADLINE_HOURS,
    staffId,
    storeId: store.id,
  };
  state.incidents.push(incident);
  // A store manager deals with situations on the spot instead of waiting for you.
  if (store.manager) {
    addLog(state, 'info', `${store.manager.name} handled "${def.title}" (${def.options[def.defaultOption]!.label}).`);
    applyIncidentOption(state, incident, def.defaultOption);
  }
}

export function incidentStaff(state: GameState, incident: PendingIncident): Staff | undefined {
  return incident.staffId ? incidentStore(state, incident)?.staff.find((s) => s.id === incident.staffId) : undefined;
}

export function applyIncidentOption(state: GameState, incident: PendingIncident, optionIndex: number): void {
  const def = incidentDef(incident.defId);
  const option = def.options[optionIndex];
  if (!option) throw new Error(`Incident ${def.id} has no option ${optionIndex}`);
  state.incidents = state.incidents.filter((i) => i.id !== incident.id);
  const store = incidentStore(state, incident);
  if (store) option.apply(state, store, incidentStaff(state, incident));
}

// Every incident ends by its deadline, so nothing can sit unresolved and block play.
export function autoResolveOverdue(state: GameState): void {
  for (const incident of state.incidents.filter((i) => i.deadlineHour <= state.hour || !incidentStore(state, i))) {
    const def = incidentDef(incident.defId);
    addLog(state, 'info', `Handled automatically: ${def.title} (${def.options[def.defaultOption]!.label}).`);
    state.lifetime.incidentsAutoResolved += 1;
    applyIncidentOption(state, incident, def.defaultOption);
  }
}
