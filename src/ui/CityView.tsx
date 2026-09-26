import { useEffect, useMemo, useRef, useState } from 'react';
import { NEIGHBORHOODS } from '../sim/catalog';
import type { GameState } from '../sim/state';
import { CityMap, type CityModel } from '../render/city';

export function CityView({ state, onOpenStore, onLot }: { state: GameState; onOpenStore: () => void; onLot: (id: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const map = useRef<CityMap | null>(null);
  const handlers = useRef({ onOpenStore, onLot });
  handlers.current = { onOpenStore, onLot };
  const [failed, setFailed] = useState(false);

  const hourOfDay = state.hour % 24;
  const model = useMemo<CityModel>(
    () => ({
      storeLot: state.neighborhoodId,
      leaseLots: NEIGHBORHOODS.map((n) => n.id).filter((id) => id !== state.neighborhoodId),
      brandIcon: state.brand.icon,
      brandColor: state.brand.color,
      hourOfDay,
    }),
    [state.neighborhoodId, state.brand.icon, state.brand.color, hourOfDay],
  );

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let m: CityMap;
    try {
      m = new CityMap(el, { onStore: () => handlers.current.onOpenStore(), onLot: (id) => handlers.current.onLot(id) });
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
        <button className="btn btn-primary" onClick={onOpenStore}>
          Open your store
        </button>
      </div>
    );
  }
  return <canvas ref={canvas} className="city-canvas" aria-label={`Map of the city. Tap your store's pin to open it.`} role="img" />;
}
