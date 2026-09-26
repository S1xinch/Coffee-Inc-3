import { createContext, useContext } from 'react';
import type { Command } from '../sim/commands';
import type { GameState } from '../sim/state';

export type TabId = 'service' | 'product' | 'marketing' | 'finance';
export type SheetId = 'staff' | 'customize';

export interface GameUi {
  state: GameState;
  act: (command: Command) => Promise<boolean>;
  goTo: (tab: TabId) => void;
  openSheet: (sheet: SheetId) => void;
  confirm: (options: { title: string; body: string; confirmLabel: string; danger?: boolean }) => Promise<boolean>;
}

export const GameUiContext = createContext<GameUi | null>(null);

export function useGameUi(): GameUi {
  const ui = useContext(GameUiContext);
  if (!ui) throw new Error('useGameUi outside GameUiContext');
  return ui;
}
