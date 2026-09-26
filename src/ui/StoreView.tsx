import { useEffect, useMemo, useRef, useState } from 'react';
import { equipmentType } from '../sim/catalog';
import type { Speed } from '../sim/clock';
import { lot } from '../sim/city';
import { FLOOR_CELLS, occupant } from '../sim/layout';
import type { Cell, GameState, Store } from '../sim/state';
import { isOpenHour, isWorking, readiness } from '../sim/store';
import { StoreScene, type SceneModel } from '../render/scene';

export function SceneCanvas({ model, label, insetTop = 0, onCell }: { model: SceneModel; label: string; insetTop?: number; onCell?: (cell: Cell) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<StoreScene | null>(null);
  const latest = useRef(model);
  latest.current = model;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let s: StoreScene;
    try {
      s = new StoreScene(el, { insetTop });
    } catch {
      setFailed(true);
      return;
    }
    scene.current = s;
    s.setModel(latest.current);
    const ro = new ResizeObserver(([entry]) => {
      if (entry) s.resize(entry.contentRect.width, entry.contentRect.height, window.devicePixelRatio || 1);
    });
    ro.observe(el);
    s.start();
    return () => {
      ro.disconnect();
      s.stop();
      scene.current = null;
    };
  }, [insetTop]);

  useEffect(() => {
    scene.current?.setModel(model);
  }, [model]);

  if (failed) return <div className="stage-fallback">The store view is not available in this browser, but everything else works.</div>;
  return (
    <canvas
      ref={canvas}
      className={`stage-canvas ${onCell ? 'arranging' : ''}`}
      aria-label={label}
      role="img"
      onClick={
        onCell
          ? (e) => {
              const cell = scene.current?.cellAt(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
              if (cell) onCell(cell);
            }
          : undefined
      }
    />
  );
}

export interface ArrangeProps {
  selected: string | null;
  onCell: (cell: Cell) => void;
}

export function StoreView({ state, store, speed, arrange }: { state: GameState; store: Store; speed: Speed; arrange: ArrangeProps | null }) {
  const hourOfDay = state.hour % 24;
  const serving = store.open && isOpenHour(hourOfDay) && readiness(state, store).ready;
  const equipmentKey = store.equipment.map((e) => `${e.typeId}:${e.broken}`).join(',');
  const layoutKey = Object.entries(store.layout)
    .map(([id, c]) => `${id}@${c.x},${c.y}`)
    .join(',');
  const working = store.staff.filter((s) => isWorking(s, state.hour));
  const baristaKey = working.map((s) => `${s.id}:${s.look}`).join(',');
  const served = store.lastHour?.served ?? 0;
  const selected = arrange?.selected ?? null;
  const arranging = !!arrange;

  const model = useMemo<SceneModel>(
    () => ({
      equipment: store.equipment.map((e) => e.typeId),
      broken: store.equipment.filter((e) => e.broken).map((e) => equipmentType(e.typeId).category),
      baristas: working.map((s) => ({ id: s.id, look: s.look })),
      serving,
      hourOfDay,
      servedLastHour: served,
      speed,
      companyName: state.companyName,
      brandColor: state.brand.color,
      placed: store.equipment.flatMap((e) => {
        const c = store.layout[e.id];
        return c ? [{ id: e.id, typeId: e.typeId, x: c.x, y: c.y }] : [];
      }),
      arrange: arranging ? { selected, free: FLOOR_CELLS.filter((c) => !occupant(store, c)) } : null,
    }),
    // Keys stand in for the arrays so the scene only updates when something visible changes.
    [equipmentKey, layoutKey, baristaKey, serving, hourOfDay, served, speed, state.companyName, state.brand.color, arranging, selected],
  );

  return <SceneCanvas model={model} label={`Isometric view of ${state.companyName} at ${lot(store.lotId).address}`} insetTop={44} onCell={arrange?.onCell} />;
}
