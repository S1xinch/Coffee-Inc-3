import { LOTS, city as cityById, isRoad, lot as lotById, type CityDef } from '../sim/city';
import { districtsIn, neighborhood, type DistrictStyle } from '../sim/catalog';
import type { BrandIcon } from '../sim/state';
import { drawBrandIcon } from './brandIcons';

export interface CityModel {
  cityId: string;
  stores: readonly { id: string; lotId: string; alert: boolean }[];
  rivalLots: readonly string[];
  leaseLots: readonly string[];
  rivalColor: string;
  brandIcon: BrandIcon;
  brandColor: string;
  hourOfDay: number;
  focusLotId: string;
}

export interface CityCallbacks {
  onStore: (storeId: string) => void;
  onLot: (lotId: string) => void;
  onRival: (lotId: string) => void;
}

interface Pt {
  x: number;
  y: number;
}

type PinKind = 'store' | 'rival' | 'lease';
interface Pin {
  kind: PinKind;
  id: string;
  lotId: string;
  alert: boolean;
  at: Pt;
}

const TW = 64;
const TH = 32;
const MAX_CACHE_PX = 12_000_000;
const WATER = '#17abc8';

const iso = (x: number, y: number, z = 0): Pt => ({ x: ((x - y) * TW) / 2, y: ((x + y) * TH) / 2 - z });

function hash(x: number, y: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

type Style = DistrictStyle | 'park';

const PALETTES: Record<Style, string[]> = {
  park: ['#e9e2d2'],
  towers: ['#9fb8c8', '#8aa7ba', '#b9c7cf', '#7f97a8', '#c4ced3', '#aebfca'],
  warehouse: ['#9c5a47', '#8c6f5a', '#a8b2b8', '#b5654a'],
  campus: ['#b8674a', '#c27a55', '#a95c42'],
  houses: ['#e8d6b8', '#c9dbe3', '#e4c7c0', '#d8e3c8', '#f0e3c8'],
  harbor: ['#a8b2b8', '#c48a5c', '#8f9ca3', '#d6c7ae'],
  brick: ['#b5654a', '#a55840', '#c47c5c', '#9c5a47', '#d6c7ae'],
};

const HEIGHTS: Record<Style, [number, number]> = {
  park: [0, 0],
  towers: [70, 140],
  warehouse: [18, 30],
  campus: [22, 40],
  houses: [14, 22],
  harbor: [18, 34],
  brick: [20, 42],
};

const styleAt = (c: CityDef, x: number, y: number): Style => {
  const zone = c.zone(x, y);
  return zone === 'park' ? 'park' : neighborhood(zone).style;
};

const worldOf = (c: CityDef) => ({ minX: -(c.h * TW) / 2 - 40, maxX: (c.w * TW) / 2 + 40, minY: -200, maxY: ((c.w + c.h) * TH) / 2 + 40 });

// Where each district's name sits on the map: the middle of its dry, non-road tiles.
function labelsOf(c: CityDef): { name: string; at: Pt }[] {
  return districtsIn(c.id).map((n) => {
    let sx = 0;
    let sy = 0;
    let count = 0;
    for (let y = 0; y < c.h; y++) {
      for (let x = 0; x < c.w; x++) {
        if (c.zone(x, y) === n.id && !c.water(x, y) && !isRoad(c, x, y)) {
          sx += x + 0.5;
          sy += y + 0.5;
          count++;
        }
      }
    }
    return { name: n.name, at: iso(sx / Math.max(1, count), sy / Math.max(1, count), 0) };
  });
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amount < 0 ? c * amount : (255 - c) * amount))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

const isNight = (h: number) => h < 6 || h >= 20;
const isDusk = (h: number) => h >= 18 && h < 20;

type Ctx = CanvasRenderingContext2D;

function poly(c: Ctx, pts: Pt[], fill: string): void {
  c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}

function box(c: Ctx, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, color: string): void {
  poly(c, [iso(x0, y1, z0), iso(x1, y1, z0), iso(x1, y1, z1), iso(x0, y1, z1)], shade(color, -0.08));
  poly(c, [iso(x1, y0, z0), iso(x1, y1, z0), iso(x1, y1, z1), iso(x1, y0, z1)], shade(color, -0.24));
  poly(c, [iso(x0, y0, z1), iso(x1, y0, z1), iso(x1, y1, z1), iso(x0, y1, z1)], shade(color, 0.12));
}

function windows(c: Ctx, x0: number, y0: number, x1: number, y1: number, h: number, glass: string, lit: (i: number) => boolean): void {
  let i = 0;
  for (let z = 8; z < h - 5; z += 10) {
    for (const [a, b] of [[x0 + 0.08, x1 - 0.08]] as const) {
      const steps = Math.max(1, Math.floor((b - a) / 0.22));
      for (let s = 0; s < steps; s++) {
        const wx = a + ((b - a) * (s + 0.2)) / steps;
        const ww = ((b - a) / steps) * 0.6;
        poly(c, [iso(wx, y1, z), iso(wx + ww, y1, z), iso(wx + ww, y1, z + 5), iso(wx, y1, z + 5)], lit(i++) ? '#ffd98a' : glass);
      }
    }
    const steps = Math.max(1, Math.floor((y1 - y0 - 0.16) / 0.22));
    for (let s = 0; s < steps; s++) {
      const wy = y0 + 0.08 + ((y1 - y0 - 0.16) * (s + 0.2)) / steps;
      const wh = ((y1 - y0 - 0.16) / steps) * 0.6;
      poly(c, [iso(x1, wy, z), iso(x1, wy + wh, z), iso(x1, wy + wh, z + 5), iso(x1, wy, z + 5)], lit(i++) ? '#f2c26b' : shade(glass, -0.2));
    }
  }
}

function tree(c: Ctx, x: number, y: number, size: number): void {
  const base = iso(x, y, 0);
  c.fillStyle = 'rgba(40,60,30,0.18)';
  c.beginPath();
  c.ellipse(base.x, base.y, 9 * size, 4.5 * size, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#6b4a30';
  c.fillRect(base.x - 1.2, base.y - 9 * size, 2.4, 9 * size);
  for (const [dx, dy, r, col] of [[0, -16, 8, '#4c9e3c'], [-4, -12, 6, '#62b34d'], [4, -13, 6, '#3f8a33']] as const) {
    c.fillStyle = col;
    c.beginPath();
    c.arc(base.x + dx * size, base.y + dy * size, r * size, 0, Math.PI * 2);
    c.fill();
  }
}

function tower(c: Ctx, x: number, y: number): void {
  const legs = [iso(x - 0.25, y, 0), iso(x + 0.25, y, 0)];
  const top = iso(x, y, 150);
  c.strokeStyle = '#e8e4dc';
  c.lineWidth = 3;
  for (const l of legs) {
    c.beginPath();
    c.moveTo(l.x, l.y);
    c.quadraticCurveTo(top.x, (l.y + top.y) / 2 + 10, top.x, top.y);
    c.stroke();
  }
  c.fillStyle = '#f2efe8';
  c.beginPath();
  c.ellipse(top.x, top.y, 22, 7, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#d98b4a';
  c.beginPath();
  c.ellipse(top.x, top.y - 4, 17, 5, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#e8e4dc';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(top.x, top.y - 6);
  c.lineTo(top.x, top.y - 34);
  c.stroke();
}

function boat(c: Ctx, x: number, y: number, color: string, length: number): void {
  const a = iso(x - length / 2, y, 0);
  const b = iso(x + length / 2, y, 0);
  const bow = iso(x + length / 2 + 0.18, y, 2);
  c.fillStyle = 'rgba(10, 60, 80, 0.25)';
  c.beginPath();
  c.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2 + 2, length * 20, length * 6, Math.atan2(b.y - a.y, b.x - a.x), 0, Math.PI * 2);
  c.fill();
  poly(c, [iso(x - length / 2, y - 0.12, 0), iso(x + length / 2, y - 0.12, 0), bow, iso(x + length / 2, y + 0.12, 0), iso(x - length / 2, y + 0.12, 0)], color);
  poly(c, [iso(x - length / 2, y - 0.12, 5), iso(x + length / 2, y - 0.12, 5), iso(x + length / 2 + 0.18, y, 6), iso(x + length / 2, y + 0.12, 5), iso(x - length / 2, y + 0.12, 5)], shade(color, 0.25));
  box(c, x - length * 0.25, y - 0.08, x + length * 0.1, y + 0.08, 5, 11, '#f2efe8');
}

function sailboat(c: Ctx, x: number, y: number): void {
  poly(c, [iso(x - 0.25, y - 0.08), iso(x + 0.25, y - 0.08), iso(x + 0.35, y), iso(x + 0.25, y + 0.08), iso(x - 0.25, y + 0.08)], '#f2efe8');
  const mast = iso(x, y, 0);
  poly(c, [{ x: mast.x, y: mast.y - 30 }, { x: mast.x, y: mast.y - 3 }, { x: mast.x + 13, y: mast.y - 5 }], '#ffffff');
  poly(c, [{ x: mast.x - 1, y: mast.y - 26 }, { x: mast.x - 1, y: mast.y - 4 }, { x: mast.x - 9, y: mast.y - 5 }], '#e3e8ea');
}

function ferry(c: Ctx, x: number, y: number): void {
  // Green and white like the Puget Sound car ferries, tied up at the end of the terminal pier.
  box(c, x - 0.3, y - 1.1, x + 0.3, y + 1.1, 0, 8, '#e9ecef');
  box(c, x - 0.3, y - 1.1, x + 0.3, y + 1.1, 0, 3, '#2f7a4a');
  box(c, x - 0.22, y - 0.8, x + 0.22, y + 0.8, 8, 17, '#f5f5f2');
  box(c, x - 0.16, y - 0.35, x + 0.16, y + 0.35, 17, 24, '#f5f5f2');
  box(c, x - 0.05, y - 0.05, x + 0.05, y + 0.05, 24, 34, '#2f7a4a');
}

const RIVAL_TEXT = '#ffffff';

// A tall white pyramid tower, San Francisco's skyline landmark.
function pyramid(c: Ctx, x: number, y: number): void {
  const base = [iso(x + 0.1, y + 0.1), iso(x + 0.9, y + 0.1), iso(x + 0.9, y + 0.9), iso(x + 0.1, y + 0.9)];
  const top = iso(x + 0.5, y + 0.5, 190);
  poly(c, [base[3]!, base[2]!, top], '#e6e9ec');
  poly(c, [base[2]!, base[1]!, top], '#c3c9ce');
  c.strokeStyle = 'rgba(80, 96, 110, 0.35)';
  c.lineWidth = 0.6;
  for (let z = 14; z < 180; z += 12) {
    const t = z / 190;
    const l = { x: base[3]!.x + (top.x - base[3]!.x) * t, y: base[3]!.y + (top.y - base[3]!.y) * t };
    const r = { x: base[1]!.x + (top.x - base[1]!.x) * t, y: base[1]!.y + (top.y - base[1]!.y) * t };
    const m = { x: base[2]!.x + (top.x - base[2]!.x) * t, y: base[2]!.y + (top.y - base[2]!.y) * t };
    c.beginPath();
    c.moveTo(l.x, l.y);
    c.lineTo(m.x, m.y);
    c.lineTo(r.x, r.y);
    c.stroke();
  }
}

export class CityMap {
  private readonly ctx: Ctx;
  private readonly cache = document.createElement('canvas');
  private cacheScale = 0;
  private cacheKey = '';
  private width = 0;
  private height = 0;
  private dpr = 1;
  private zoom = 1;
  private camX = 0;
  private camY = 300;
  private model: CityModel | null = null;
  private pointers = new Map<number, Pt>();
  private gesture: { startX: number; startY: number; t: number; moved: boolean; pinch: number | null; zoom0: number } | null = null;
  private raf = 0;
  private placed = false;
  private c: CityDef = cityById('seattle');
  private world = worldOf(this.c);
  private cityLabels = labelsOf(this.c);

  constructor(private readonly canvas: HTMLCanvasElement, private readonly callbacks: CityCallbacks) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot draw the city map.');
    this.ctx = ctx;
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointercancel', this.onUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = Math.min(dpr, 2);
    this.canvas.width = Math.max(1, Math.round(width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(height * this.dpr));
    if (!this.placed && this.model) this.focus(this.model.focusLotId);
    this.clampCamera();
    this.request();
  }

  setModel(model: CityModel): void {
    const cityChanged = model.cityId !== this.c.id;
    const first = !this.model;
    if (cityChanged) {
      this.c = cityById(model.cityId);
      this.world = worldOf(this.c);
      this.cityLabels = labelsOf(this.c);
      this.cacheKey = '';
    }
    const refocus = first || cityChanged || model.focusLotId !== this.model?.focusLotId;
    this.model = model;
    if (refocus && this.width > 0) this.focus(model.focusLotId);
    this.request();
  }

  private minZoom(): number {
    return Math.min(this.width / (this.world.maxX - this.world.minX), this.height / (this.world.maxY - this.world.minY));
  }

  focus(lotId: string): void {
    const l = LOTS.find((x) => x.id === lotId && x.cityId === this.c.id);
    // Without a lot to look at, frame the middle of the city.
    const p = l ? iso(l.x + 0.5, l.y + 0.5, 30) : iso(this.c.w / 2, this.c.h / 2, 30);
    this.zoom = Math.max(this.minZoom(), Math.min(1.3, this.width / 360));
    this.camX = p.x;
    this.camY = p.y;
    this.placed = true;
    this.clampCamera();
    this.request();
  }

  private clampCamera(): void {
    this.zoom = Math.min(2.4, Math.max(this.minZoom(), this.zoom));
    const halfW = this.width / 2 / this.zoom;
    const halfH = this.height / 2 / this.zoom;
    const clampAxis = (v: number, lo: number, hi: number, half: number) => (hi - lo < half * 2 ? (lo + hi) / 2 : Math.min(hi - half, Math.max(lo + half, v)));
    this.camX = clampAxis(this.camX, this.world.minX, this.world.maxX, halfW);
    this.camY = clampAxis(this.camY, this.world.minY, this.world.maxY, halfH);
  }

  private toScreen(p: Pt): Pt {
    return { x: (p.x - this.camX) * this.zoom + this.width / 2, y: (p.y - this.camY) * this.zoom + this.height / 2 };
  }

  private request(): void {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.draw());
  }

  private pins(): Pin[] {
    const m = this.model;
    if (!m) return [];
    const at = (lotId: string, z: number) => {
      const l = lotById(lotId);
      return this.toScreen(iso(l.x + 0.5, l.y + 0.5, z));
    };
    return [
      ...m.leaseLots.map((lotId): Pin => ({ kind: 'lease', id: lotId, lotId, alert: false, at: at(lotId, 6) })),
      ...m.rivalLots.map((lotId): Pin => ({ kind: 'rival', id: lotId, lotId, alert: false, at: at(lotId, 30) })),
      ...m.stores.map((s): Pin => ({ kind: 'store', id: s.id, lotId: s.lotId, alert: s.alert, at: at(s.lotId, 30) })),
    ];
  }

  private onDown = (e: PointerEvent) => {
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (this.pointers.size === 1) {
      this.gesture = { startX: e.offsetX, startY: e.offsetY, t: performance.now(), moved: false, pinch: null, zoom0: this.zoom };
    } else if (this.pointers.size === 2 && this.gesture) {
      const [a, b] = [...this.pointers.values()];
      this.gesture.pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      this.gesture.zoom0 = this.zoom;
      this.gesture.moved = true;
    }
  };

  private onMove = (e: PointerEvent) => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev || !this.gesture) return;
    const next = { x: e.offsetX, y: e.offsetY };
    this.pointers.set(e.pointerId, next);
    if (this.pointers.size >= 2 && this.gesture.pinch) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      this.zoomAround((a!.x + b!.x) / 2, (a!.y + b!.y) / 2, (this.gesture.zoom0 * dist) / this.gesture.pinch);
      return;
    }
    if (Math.hypot(next.x - this.gesture.startX, next.y - this.gesture.startY) > 8) this.gesture.moved = true;
    if (this.gesture.moved) {
      this.camX -= (next.x - prev.x) / this.zoom;
      this.camY -= (next.y - prev.y) / this.zoom;
      this.clampCamera();
      this.request();
    }
  };

  private onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    const g = this.gesture;
    if (this.pointers.size > 0) return;
    this.gesture = null;
    if (!g) return;
    if (!g.moved && performance.now() - g.t < 500) this.tap(e.offsetX, e.offsetY);
    this.request();
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoomAround(e.offsetX, e.offsetY, this.zoom * Math.exp(-e.deltaY * 0.0015));
  };

  private zoomAround(sx: number, sy: number, zoom: number): void {
    const wx = (sx - this.width / 2) / this.zoom + this.camX;
    const wy = (sy - this.height / 2) / this.zoom + this.camY;
    this.zoom = zoom;
    this.clampCamera();
    this.camX = wx - (sx - this.width / 2) / this.zoom;
    this.camY = wy - (sy - this.height / 2) / this.zoom;
    this.clampCamera();
    this.request();
  }

  private tap(x: number, y: number): void {
    // Front-most pin wins: your stores are drawn last, so check them first.
    const hit = this.pins()
      .reverse()
      .find((p) => Math.abs(p.at.x - x) < 24 && y < p.at.y + 4 && y > p.at.y - 60);
    if (!hit) return;
    if (hit.kind === 'store') this.callbacks.onStore(hit.id);
    else if (hit.kind === 'rival') this.callbacks.onRival(hit.lotId);
    else this.callbacks.onLot(hit.lotId);
  }

  private draw(): void {
    const m = this.model;
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!m || this.width === 0) return;

    const worldW = this.world.maxX - this.world.minX;
    const worldH = this.world.maxY - this.world.minY;
    const wanted = Math.min(this.zoom * this.dpr, Math.sqrt(MAX_CACHE_PX / (worldW * worldH)));
    const key = `${this.c.id}|${m.stores.map((s) => s.lotId).join(',')}|${m.rivalLots.join(',')}|${m.brandColor}|${m.hourOfDay}`;
    const gesturing = this.gesture?.pinch != null;
    if (key !== this.cacheKey || (!gesturing && Math.abs(wanted - this.cacheScale) > 0.01)) {
      this.cacheKey = key;
      this.cacheScale = wanted;
      this.paint(m);
    }

    c.fillStyle = WATER;
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const tl = this.toScreen({ x: this.world.minX, y: this.world.minY });
    c.imageSmoothingQuality = 'high';
    c.drawImage(this.cache, tl.x * this.dpr, tl.y * this.dpr, worldW * this.zoom * this.dpr, worldH * this.zoom * this.dpr);

    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.labels();
    for (const pin of this.pins()) this.drawPin(pin, m);
  }

  // District names, readable over the buildings at any zoom.
  private labels(): void {
    const c = this.ctx;
    c.font = `700 ${Math.round(Math.max(11, Math.min(15, 13 * this.zoom)))}px -apple-system, system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    for (const l of this.cityLabels) {
      const p = this.toScreen({ x: l.at.x, y: l.at.y - 40 });
      const text = l.name.toUpperCase();
      c.lineWidth = 4;
      c.strokeStyle = 'rgba(20, 26, 36, 0.75)';
      c.strokeText(text, p.x, p.y);
      c.fillStyle = 'rgba(255, 255, 255, 0.92)';
      c.fillText(text, p.x, p.y);
    }
  }

  // Rounded-square badge with a pointer tail, like the map pins in Coffee Inc 2.
  private drawPin(pin: Pin, m: CityModel): void {
    const c = this.ctx;
    const own = pin.kind === 'store';
    const size = own ? 44 : 36;
    const { at } = pin;
    const x = at.x - size / 2;
    const y = at.y - size - 12;
    const fill = own ? m.brandColor : pin.kind === 'rival' ? m.rivalColor : 'rgba(34, 52, 50, 0.9)';
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.3)';
    c.shadowBlur = 6;
    c.shadowOffsetY = 2;
    c.fillStyle = fill;
    c.beginPath();
    c.roundRect(x, y, size, size, 9);
    c.moveTo(at.x - 7, y + size - 1);
    c.lineTo(at.x, at.y);
    c.lineTo(at.x + 7, y + size - 1);
    c.fill();
    c.restore();
    c.strokeStyle = pin.kind === 'lease' ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.85)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.roundRect(x + 0.75, y + 0.75, size - 1.5, size - 1.5, 8.5);
    c.stroke();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    if (own) {
      drawBrandIcon(c, m.brandIcon, at.x, y + size / 2, size * 0.72, '#ffffff', m.brandColor);
      if (pin.alert) {
        c.fillStyle = '#e0452f';
        c.beginPath();
        c.arc(x + size - 2, y + 2, 9, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#ffffff';
        c.lineWidth = 1.5;
        c.stroke();
        c.fillStyle = '#ffffff';
        c.font = '800 12px -apple-system, system-ui, sans-serif';
        c.fillText('!', x + size - 2, y + 2.5);
      }
      return;
    }
    if (pin.kind === 'rival') {
      c.fillStyle = RIVAL_TEXT;
      c.font = '800 19px Georgia, serif';
      c.fillText('N', at.x, y + size / 2 + 1);
      return;
    }
    c.fillStyle = '#c8412c';
    c.beginPath();
    c.roundRect(x + 4, y + 5, size - 8, size - 10, 3);
    c.fill();
    c.strokeStyle = '#f3e7df';
    c.lineWidth = 1;
    c.stroke();
    c.fillStyle = '#ffffff';
    c.font = '700 8px -apple-system, system-ui, sans-serif';
    c.fillText('FOR', at.x, y + size / 2 - 5);
    c.fillText('LEASE', at.x, y + size / 2 + 5);
  }

  private paint(m: CityModel): void {
    const s = this.cacheScale;
    this.cache.width = Math.ceil((this.world.maxX - this.world.minX) * s);
    this.cache.height = Math.ceil((this.world.maxY - this.world.minY) * s);
    const c = this.cache.getContext('2d');
    if (!c) return;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = WATER;
    c.fillRect(0, 0, this.cache.width, this.cache.height);
    c.setTransform(s, 0, 0, s, -this.world.minX * s, -this.world.minY * s);
    const night = isNight(m.hourOfDay);

    const tiles: Pt[] = [];
    for (let y = 0; y < this.c.h; y++) for (let x = 0; x < this.c.w; x++) tiles.push({ x, y });
    tiles.sort((a, b) => a.x + a.y - (b.x + b.y) || a.x - b.x);

    for (const { x, y } of tiles) this.ground(c, x, y);
    for (const p of this.c.piers) box(c, p.x0, p.y0, p.x1, p.y1, 0, 4, '#a5825f');
    const own = new Map(m.stores.map((st) => [st.lotId, true]));
    const rival = new Set(m.rivalLots);
    for (const { x, y } of tiles) this.structure(c, x, y, m, night, own, rival);
    this.harbor(c);

    if (night || isDusk(m.hourOfDay)) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = night ? 'rgba(18, 24, 58, 0.42)' : 'rgba(120, 60, 40, 0.12)';
      c.fillRect(0, 0, this.cache.width, this.cache.height);
    }
  }

  // Boats tied up along the piers, ferries at the terminals, and sailboats out on the water.
  private harbor(c: Ctx): void {
    for (const b of this.c.boats) {
      if (b.kind === 'ferry') ferry(c, b.x, b.y);
      else if (b.kind === 'sail') sailboat(c, b.x, b.y);
      else boat(c, b.x, b.y, b.color ?? '#c9573f', b.length ?? 0.9);
    }
  }

  private ground(c: Ctx, x: number, y: number): void {
    const isWater = (xx: number, yy: number) => this.c.water(xx, yy);
    const onRoad = (xx: number, yy: number) => isRoad(this.c, xx, yy);
    const quad = [iso(x, y), iso(x + 1, y), iso(x + 1, y + 1), iso(x, y + 1)];
    if (isWater(x, y)) {
      poly(c, quad, WATER);
      if (hash(x, y, 9) > 0.6) {
        const p = iso(x + 0.5, y + 0.5);
        c.strokeStyle = 'rgba(255,255,255,0.35)';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(p.x - 6, p.y);
        c.quadraticCurveTo(p.x, p.y - 3, p.x + 6, p.y);
        c.stroke();
      }
      // Roads cross narrow water on bridges.
      if (this.c.bridge(x, y)) {
        const vertical = this.c.roadX.includes(x) && !this.c.roadY.includes(y);
        const q = vertical ? [iso(x + 0.1, y), iso(x + 0.9, y), iso(x + 0.9, y + 1), iso(x + 0.1, y + 1)] : [iso(x, y + 0.1), iso(x + 1, y + 0.1), iso(x + 1, y + 0.9), iso(x, y + 0.9)];
        poly(c, q.map((p) => ({ x: p.x, y: p.y - 6 })), '#9aa0a3');
        poly(c, q.map((p) => ({ x: p.x, y: p.y - 6 })).slice(0, 2).concat(q.slice(0, 2).reverse()), '#6d7275');
      }
      return;
    }
    if (onRoad(x, y)) {
      poly(c, quad, '#8e9396');
      const roadX = this.c.roadX.includes(x);
      const roadY = this.c.roadY.includes(y);
      c.strokeStyle = 'rgba(255,255,255,0.7)';
      c.lineWidth = 1;
      c.setLineDash([4, 5]);
      c.beginPath();
      if (roadX && !roadY) {
        const a = iso(x + 0.5, y);
        const b = iso(x + 0.5, y + 1);
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
      } else if (roadY && !roadX) {
        const a = iso(x, y + 0.5);
        const b = iso(x + 1, y + 0.5);
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
      }
      c.stroke();
      c.setLineDash([]);
      return;
    }
    const zone = styleAt(this.c, x, y);
    const green = zone === 'park' || zone === 'campus' || zone === 'houses';
    const shore = isWater(x, y + 1) || isWater(x + 1, y) || isWater(x - 1, y) || isWater(x, y - 1);
    poly(c, quad, shore && zone === 'harbor' ? '#d9ccb0' : green ? '#9be36b' : '#e2e8dc');
    // Mint curb along any edge that meets a road, as on the Coffee Inc 2 map.
    const curb = '#b3e79c';
    const edge = (a: Pt, b: Pt, cc: Pt, dd: Pt) => poly(c, [a, b, cc, dd], curb);
    const w = 0.12;
    if (onRoad(x, y - 1)) edge(iso(x, y), iso(x + 1, y), iso(x + 1, y + w), iso(x, y + w));
    if (onRoad(x, y + 1)) edge(iso(x, y + 1 - w), iso(x + 1, y + 1 - w), iso(x + 1, y + 1), iso(x, y + 1));
    if (onRoad(x - 1, y)) edge(iso(x, y), iso(x + w, y), iso(x + w, y + 1), iso(x, y + 1));
    if (onRoad(x + 1, y)) edge(iso(x + 1 - w, y), iso(x + 1, y), iso(x + 1, y + 1), iso(x + 1 - w, y + 1));
    // Seawall where land meets the bay.
    if (isWater(x, y + 1)) poly(c, [iso(x, y + 1), iso(x + 1, y + 1), iso(x + 1, y + 1, -8), iso(x, y + 1, -8)], '#8b8478');
    if (isWater(x + 1, y)) poly(c, [iso(x + 1, y), iso(x + 1, y + 1), iso(x + 1, y + 1, -8), iso(x + 1, y, -8)], '#766f64');
  }

  private structure(c: Ctx, x: number, y: number, m: CityModel, night: boolean, own: Map<string, boolean>, rival: Set<string>): void {
    if (this.c.water(x, y) || isRoad(this.c, x, y)) return;
    const l = LOTS.find((k) => k.cityId === this.c.id && k.x === x && k.y === y);
    if (l) {
      if (own.has(l.id)) this.cafe(c, x, y, m.brandColor, night);
      else if (rival.has(l.id)) this.cafe(c, x, y, m.rivalColor, night);
      else this.vacantLot(c, x, y);
      return;
    }
    const zone = styleAt(this.c, x, y);
    const r = hash(x, y, 1);
    const landmark = this.c.landmark;
    if (landmark && landmark.x === x && landmark.y === y) {
      if (landmark.kind === 'needle') tower(c, x + 0.5, y + 0.5);
      else pyramid(c, x, y);
      return;
    }
    if (zone === 'park') {
      if (r > 0.3) tree(c, x + 0.5, y + 0.5, 1);
      return;
    }
    if ((zone === 'campus' || zone === 'houses') && r > 0.7) {
      tree(c, x + 0.3 + hash(x, y, 2) * 0.4, y + 0.5, 0.9);
      return;
    }
    if (zone !== 'towers' && r > 0.9) {
      tree(c, x + 0.5, y + 0.5, 0.8);
      return;
    }
    const palette = PALETTES[zone];
    const color = palette[Math.floor(hash(x, y, 3) * palette.length)]!;
    const [lo, hi] = HEIGHTS[zone];
    const h = Math.round(lo + (hi - lo) * hash(x, y, 4));
    if (zone === 'warehouse') {
      // Long warehouses with sawtooth roofs.
      box(c, x + 0.06, y + 0.12, x + 0.94, y + 0.88, 0, h, color);
      for (let i = 0; i < 3; i++) {
        const x0 = x + 0.06 + i * 0.293;
        poly(c, [iso(x0, y + 0.88, h), iso(x0 + 0.293, y + 0.88, h), iso(x0 + 0.293, y + 0.88, h + 8)], shade(color, -0.3));
        poly(c, [iso(x0 + 0.293, y + 0.12, h), iso(x0 + 0.293, y + 0.88, h), iso(x0 + 0.293, y + 0.88, h + 8), iso(x0 + 0.293, y + 0.12, h + 8)], '#b9c7cf');
      }
      poly(c, [iso(x + 0.3, y + 0.88, 2), iso(x + 0.7, y + 0.88, 2), iso(x + 0.7, y + 0.88, h * 0.6), iso(x + 0.3, y + 0.88, h * 0.6)], night ? '#ffd98a' : '#5a4638');
      return;
    }
    const inset = zone === 'houses' ? 0.2 : 0.1;
    box(c, x + inset, y + inset, x + 1 - inset, y + 1 - inset, 0, h, color);
    if (zone === 'houses') {
      poly(c, [iso(x + inset, y + 1 - inset, h), iso(x + 1 - inset, y + 1 - inset, h), iso(x + 0.5, y + 0.5, h + 9)], shade('#8f5a44', 0.05));
      poly(c, [iso(x + 1 - inset, y + inset, h), iso(x + 1 - inset, y + 1 - inset, h), iso(x + 0.5, y + 0.5, h + 9)], '#7a4a38');
      return;
    }
    const glass = zone === 'towers' ? '#5f7d92' : '#6f7f88';
    windows(c, x + inset, y + inset, x + 1 - inset, y + 1 - inset, h, glass, (i) => night && hash(x * 31 + i, y, 5) > 0.55);
    if (h > 90) box(c, x + 0.4, y + 0.4, x + 0.6, y + 0.6, h, h + 6, '#9aa4ab');
  }

  private cafe(c: Ctx, x: number, y: number, brand: string, night: boolean): void {
    poly(c, [iso(x + 0.05, y + 0.05), iso(x + 0.95, y + 0.05), iso(x + 0.95, y + 0.95), iso(x + 0.05, y + 0.95)], '#e9e0cf');
    box(c, x + 0.15, y + 0.15, x + 0.85, y + 0.75, 0, 26, '#f3e9d8');
    poly(c, [iso(x + 0.2, y + 0.75, 4), iso(x + 0.8, y + 0.75, 4), iso(x + 0.8, y + 0.75, 16), iso(x + 0.2, y + 0.75, 16)], night ? '#ffd98a' : '#8fb4c6');
    poly(c, [iso(x + 0.15, y + 0.75, 20), iso(x + 0.85, y + 0.75, 20), iso(x + 0.85, y + 0.92, 15), iso(x + 0.15, y + 0.92, 15)], brand);
    poly(c, [iso(x + 0.85, y + 0.2, 4), iso(x + 0.85, y + 0.7, 4), iso(x + 0.85, y + 0.7, 16), iso(x + 0.85, y + 0.2, 16)], night ? '#f2c26b' : '#7898a8');
    tree(c, x + 0.9, y + 0.1, 0.55);
  }

  private vacantLot(c: Ctx, x: number, y: number): void {
    poly(c, [iso(x + 0.08, y + 0.08), iso(x + 0.92, y + 0.08), iso(x + 0.92, y + 0.92), iso(x + 0.08, y + 0.92)], '#cbbd9f');
    for (let i = 0; i < 6; i++) {
      const p = iso(x + 0.15 + hash(x, i, 7) * 0.7, y + 0.15 + hash(y, i, 8) * 0.7);
      c.fillStyle = '#b3a483';
      c.fillRect(p.x - 1, p.y - 0.5, 2, 1);
    }
    const post = iso(x + 0.5, y + 0.8);
    c.fillStyle = '#6b4a30';
    c.fillRect(post.x - 1, post.y - 14, 2, 14);
    c.fillStyle = '#ffffff';
    c.fillRect(post.x - 9, post.y - 22, 18, 9);
    c.fillStyle = '#c2553a';
    c.fillRect(post.x - 7, post.y - 20, 14, 2);
    c.fillRect(post.x - 7, post.y - 16.5, 10, 1.5);
  }
}
