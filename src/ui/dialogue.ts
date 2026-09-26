import { BANKRUPTCY_GRACE_WEEKS, OPEN_HOUR, equipmentType } from '../sim/catalog';
import { formatTime } from '../sim/clock';
import { incidentDef } from '../sim/incidents';
import type { GameState } from '../sim/state';
import { isOpenHour, readiness, starRating } from '../sim/store';

export interface Line {
  speaker: { name: string; look: number };
  text: string;
}

const ASSISTANT = { name: 'Your assistant', look: 57 };

// What the team would tell the owner right now, most urgent first. Every line reflects real game state.
export function dialogueLine(state: GameState, paused: boolean): Line {
  const lead = state.staff[0];
  const speaker = lead ? { name: lead.name.split(' ')[0]!, look: lead.look } : ASSISTANT;
  const ready = readiness(state);
  const say = (text: string): Line => ({ speaker, text });

  if (state.distressWeeks > 0) {
    const left = BANKRUPTCY_GRACE_WEEKS - state.distressWeeks + 1;
    return say(`Boss, we're in the red. The bank gives us ${left} more week${left === 1 ? '' : 's'} to fix it.`);
  }
  const broken = state.store.equipment.find((e) => e.broken);
  if (broken) return say(`Boss, the ${equipmentType(broken.typeId).name} broke down. Can we get it repaired?`);
  if (!ready.register) return say('Hello boss! We need a cash register before we can take any orders.');
  if (!ready.drinkMachine) return say('Hello boss! We need an espresso machine or a brewer.');
  if (state.staff.length === 0) return say('Hello boss! Nobody works here yet. Tap Staff to hire a barista.');
  if (!ready.menu) return say('Hello boss! Nothing on the menu can be made. Check the Product tab.');
  if (!ready.barista) return say("Hello boss. Everyone's out today, so we can't open.");
  const incident = state.incidents[0];
  if (incident) return say(`Boss, something came up: ${incidentDef(incident.defId).title.toLowerCase()}.`);
  if (paused && state.lifetime.served === 0) return say("Hello boss! We're ready. Press play to open the doors.");
  if (!state.store.open) return say('The store is closed. Say the word and we open back up.');
  if (!isOpenHour(state.hour % 24)) return say(`Hello boss. We open at ${formatTime(OPEN_HOUR)}.`);
  const last = state.lastHour;
  if (last && last.demand > last.served + 3) {
    return say(`Boss, the line is out the door. ${last.demand - last.served} people gave up last hour.`);
  }
  if (state.store.reviews === 0) return say(`Hello boss! ${state.today.served} customers so far today.`);
  return say(`Hello boss! ${state.today.served} served today. We're rated ${starRating(state).toFixed(1)} stars.`);
}
