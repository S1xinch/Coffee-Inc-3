import { applyCommand, type Command } from '../../src/sim/commands';
import { newGame } from '../../src/sim/game';
import type { GameState } from '../../src/sim/state';

export function run(state: GameState, ...cmds: Command[]): GameState {
  let s = state;
  for (const cmd of cmds) {
    const r = applyCommand(s, cmd);
    if (r.error) throw new Error(`${cmd.type}: ${r.error}`);
    s = r.state;
  }
  return s;
}

export function openStore(seed = 42, neighborhoodId = 'old-town'): GameState {
  let s = newGame({ companyName: 'Test Beans', neighborhoodId, seed });
  s = run(
    s,
    { type: 'buyEquipment', typeId: 'register' },
    { type: 'buyEquipment', typeId: 'espresso-1' },
    { type: 'buyEquipment', typeId: 'drip' },
    { type: 'buyEquipment', typeId: 'pastry' },
    { type: 'buyEquipment', typeId: 'table' },
    { type: 'buyEquipment', typeId: 'plant' },
  );
  const [a, b] = s.candidates;
  return run(s, { type: 'hireStaff', candidateId: a!.id }, { type: 'hireStaff', candidateId: b!.id });
}
