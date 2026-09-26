import { useEffect, useMemo, useRef, useState } from 'react';
import { LOTS } from '../sim/city';
import { managerStatus } from '../sim/manager';
import { RIVAL_COLOR, lotTaken } from '../sim/rival';
import type { GameState } from '../sim/state';
import { readiness } from '../sim/store';
import { CityMap, type CityModel } from '../render/city';

interface Props {
  state: GameState;
  focusLotId: string;
  onOpenStore: (storeId: string) => void;
  onLot: (lotId: string) => void;
  onRival: (lotId: string) => void;
}

export function CityView({ state, focusLotId, onOpenStore, onLot, onRival }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const map = useRef<CityMap | null>(null);
  const handlers = useRef({ onOpenStore, onLot, onRival });
  handlers.current = { onOpenStore, onLot, onRival };
  const [failed, setFailed] = useState(false);

  const hourOfDay = state.hour % 24;
  // A store pin gets a badge when it needs the owner: a manager asking for help, an open incident, or a store that cannot open.
  const stores = state.stores.map((s) => ({
    id: s.id,
    lotId: s.lotId,
    alert: managerStatus(state, s)?.state === 'needsAttention' || state.incidents.some((i) => i.storeId === s.id) || !readiness(state, s).ready,
  }));
  const storesKey = stores.map((s) => `${s.id}@${s.lotId}:${s.alert}`).join(',');
  const rivalKey = state.rival.stores.map((r) => r.lotId).join(',');

  const model = useMemo<CityModel>(
    () => ({
      stores,
      rivalLots: state.rival.stores.map((r) => r.lotId),
      leaseLots: LOTS.filter((l) => !lotTaken(state, l.id)).map((l) => l.id),
      rivalColor: RIVAL_COLOR,
      brandIcon: state.brand.icon,
      brandColor: state.brand.color,
      hourOfDay,
      focusLotId,
    }),
    // Keys stand in for the arrays so the map only repaints when something visible changes.
    [storesKey, rivalKey, state.brand.icon, state.brand.color, hourOfDay, focusLotId],
  );

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let m: CityMap;
    try {
      m = new CityMap(el, {
        onStore: (id) => handlers.current.onOpenStore(id),
        onLot: (id) => handlers.current.onLot(id),
        onRival: (id) => handlers.current.onRival(id),
      });
    } catch {
      setFailed(true);
      return;
    }
    map.current = m;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) m.resize(entry.contentRect.width, entry.contentRect.height, window.devicePixelRatio || 1);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      m.destroy();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    map.current?.setModel(model);
  }, [model]);

  if (failed) {
    return (
      <div className="stage-fallback">
        <button className="btn btn-primary" onClick={() => onOpenStore(state.stores[0]!.id)}>
          Open your store
        </button>
      </div>
    );
  }
  return <canvas ref={canvas} className="city-canvas" aria-label="Map of Seattle with your stores, the rival chain, and lots for lease" role="img" />;
}
