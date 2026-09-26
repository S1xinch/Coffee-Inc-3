import { useEffect, useMemo, useRef, useState } from 'react';
import { equipmentType } from '../sim/catalog';
import type { Speed } from '../sim/clock';
import type { GameState } from '../sim/state';
import { isOpenHour, isWorking, readiness } from '../sim/store';
import { StoreScene, type SceneModel } from '../render/scene';

export function SceneCanvas({ model, label }: { model: SceneModel; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<StoreScene | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let s: StoreScene;
    try {
      s = new StoreScene(el);
    } catch {
      setFailed(true);
      return;
    }
    scene.current = s;
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
  }, []);

  useEffect(() => {
    scene.current?.setModel(model);
  }, [model]);

  if (failed) return <div className="stage-fallback">The store view is not available in this browser, but everything else works.</div>;
  return <canvas ref={canvas} className="stage-canvas" aria-label={label} role="img" />;
}

export function StoreView({ state, speed }: { state: GameState; speed: Speed }) {
  const hourOfDay = state.hour % 24;
  const serving = state.store.open && isOpenHour(hourOfDay) && readiness(state).ready;
  const equipmentKey = state.store.equipment.map((e) => `${e.typeId}:${e.broken}`).join(',');
  const working = state.staff.filter((s) => isWorking(s, state.hour));
  const baristaKey = working.map((s) => `${s.id}:${s.look}`).join(',');
  const served = state.lastHour?.served ?? 0;

  const model = useMemo<SceneModel>(
    () => ({
      equipment: state.store.equipment.map((e) => e.typeId),
      broken: state.store.equipment.filter((e) => e.broken).map((e) => equipmentType(e.typeId).category),
      baristas: working.map((s) => ({ id: s.id, look: s.look })),
      serving,
      hourOfDay,
      servedLastHour: served,
      speed,
      companyName: state.companyName,
    }),
    // Keys stand in for the arrays so the scene only updates when something visible changes.
    [equipmentKey, baristaKey, serving, hourOfDay, served, speed, state.companyName],
  );

  return <SceneCanvas model={model} label={`Isometric view of ${state.companyName}`} />;
}
