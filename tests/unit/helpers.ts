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

export function openStore(seed = 42, districtId = 'old-town'): GameState {
  let s = newGame({ companyName: 'Test Beans', districtId, seed });
  s = run(
    s,
    { storeId: 'store1', type: 'buyEquipment', typeId: 'register' },
    { storeId: 'store1', type: 'buyEquipment', typeId: 'espresso-1' },
    { storeId: 'store1', type: 'buyEquipment', typeId: 'drip' },
    { storeId: 'store1', type: 'buyEquipment', typeId: 'pastry' },
    { storeId: 'store1', type: 'buyEquipment', typeId: 'table' },
    { storeId: 'store1', type: 'buyEquipment', typeId: 'plant' },
  );
  const [a, b] = s.candidates;
  return run(s, { storeId: 'store1', type: 'hireStaff', candidateId: a!.id }, { storeId: 'store1', type: 'hireStaff', candidateId: b!.id });
}
