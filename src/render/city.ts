import type { BrandIcon } from '../sim/state';
import { drawBrandIcon } from './brandIcons';

export interface CityModel {
  storeLot: string;
  leaseLots: readonly string[];
  brandIcon: BrandIcon;
  brandColor: string;
  hourOfDay: number;
}

export interface CityCallbacks {
  onStore: () => void;
  onLot: (neighborhoodId: string) => void;
}

interface Pt {
  x: number;
  y: number;
}

const TW = 64;
const TH = 32;
const GX = 15;
const GY = 18;
const LAND_Y = 15;
const ROADS_X = new Set([0, 5, 10]);
const ROADS_Y = new Set([0, 5, 10, 14]);
const isRoad = (x: number, y: number) => ROADS_X.has(x) || ROADS_Y.has(y);
const WORLD = { minX: -600, maxX: 500, minY: -300, maxY: 560 };
const MAX_CACHE_PX = 11_000_000;

export const LOTS: Record<string, Pt> = {
  downtown: { x: 7, y: 7 },
  university: { x: 12, y: 2 },
  'old-town': { x: 2, y: 12 },
};

const iso = (x: number, y: number, z = 0): Pt => ({ x: ((x - y) * TW) / 2, y: ((x + y) * TH) / 2 - z });

function hash(x: number, y: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

type District = 'park' | 'mid' | 'campus' | 'houses' | 'towers' | 'uptown' | 'oldtown' | 'mixed' | 'harbor';
const DISTRICTS: District[][] = [
  ['park', 'mid', 'campus'],
  ['houses', 'towers', 'uptown'],
  ['oldtown', 'mixed', 'harbor'],
];

const PALETTES: Record<District, string[]> = {
  park: ['#e9e2d2'],
  mid: ['#d8cbb7', '#c9b8a0', '#b7c3c9', '#e0d6c4'],
  campus: ['#b8674a', '#c27a55', '#a95c42'],
  houses: ['#e8d6b8', '#c9dbe3', '#e4c7c0', '#d8e3c8', '#f0e3c8'],
  towers: ['#9fb8c8', '#8aa7ba', '#b9c7cf', '#7f97a8', '#c4ced3'],
  uptown: ['#aebfca', '#cfc6b5', '#94abbb'],
  oldtown: ['#b5654a', '#a55840', '#c47c5c', '#9c5a47'],
  mixed: ['#d6c7ae', '#b9c4c9', '#c8a98c'],
  harbor: ['#a8b2b8', '#c48a5c', '#8f9ca3'],
};

const HEIGHTS: Record<District, [number, number]> = {
  park: [0, 0],
  mid: [34, 64],
  campus: [22, 36],
  houses: [14, 22],
  towers: [70, 135],
  uptown: [45, 95],
  oldtown: [20, 38],
  mixed: [28, 58],
  harbor: [18, 28],
};

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
  private camY = 150;
  private model: CityModel | null = null;
  private pointers = new Map<number, Pt>();
  private gesture: { startX: number; startY: number; t: number; moved: boolean; pinch: number | null; zoom0: number } | null = null;
  private raf = 0;
  private placed = false;

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
    if (!this.placed && this.model) this.centerOnStore();
    this.clampCamera();
    this.request();
  }

  setModel(model: CityModel): void {
    const first = !this.model;
    this.model = model;
    if (first && this.width > 0) this.centerOnStore();
    this.request();
  }

  private minZoom(): number {
    return Math.min(this.width / (WORLD.maxX - WORLD.minX), this.height / (WORLD.maxY - WORLD.minY)) * 1.15;
  }

  private centerOnStore(): void {
    const lot = this.model ? LOTS[this.model.storeLot] : undefined;
    if (!lot) return;
    const p = iso(lot.x + 0.5, lot.y + 0.5, 30);
    this.zoom = Math.max(this.minZoom(), Math.min(1.5, this.width / 300));
    this.camX = p.x;
    this.camY = p.y;
    this.placed = true;
    this.clampCamera();
  }

  private clampCamera(): void {
    this.zoom = Math.min(2.4, Math.max(this.minZoom(), this.zoom));
    const halfW = this.width / 2 / this.zoom;
    const halfH = this.height / 2 / this.zoom;
    const clampAxis = (v: number, lo: number, hi: number, half: number) => (hi - lo < half * 2 ? (lo + hi) / 2 : Math.min(hi - half, Math.max(lo + half, v)));
    this.camX = clampAxis(this.camX, WORLD.minX, WORLD.maxX, halfW);
    this.camY = clampAxis(this.camY, WORLD.minY, WORLD.maxY, halfH);
  }

  private toScreen(p: Pt): Pt {
    return { x: (p.x - this.camX) * this.zoom + this.width / 2, y: (p.y - this.camY) * this.zoom + this.height / 2 };
  }

  private request(): void {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.draw());
  }

  private pins(): { id: string; own: boolean; at: Pt }[] {
    const m = this.model;
    if (!m) return [];
    const out: { id: string; own: boolean; at: Pt }[] = [];
    for (const id of [m.storeLot, ...m.leaseLots]) {
      const lot = LOTS[id];
      if (!lot) continue;
      const own = id === m.storeLot;
      out.push({ id, own, at: this.toScreen(iso(lot.x + 0.5, lot.y + 0.5, own ? 30 : 6)) });
    }
    return out;
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
    const hit = this.pins().find((p) => Math.abs(p.at.x - x) < 26 && y < p.at.y + 4 && y > p.at.y - 64);
    if (!hit) return;
    if (hit.own) this.callbacks.onStore();
    else this.callbacks.onLot(hit.id);
  }

  private draw(): void {
    const m = this.model;
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!m || this.width === 0) return;

    const worldW = WORLD.maxX - WORLD.minX;
    const worldH = WORLD.maxY - WORLD.minY;
    const wanted = Math.min(this.zoom * this.dpr, Math.sqrt(MAX_CACHE_PX / (worldW * worldH)));
    const key = `${m.storeLot}|${m.leaseLots.join(',')}|${m.brandColor}|${m.hourOfDay}`;
    const gesturing = this.gesture?.pinch != null;
    if (key !== this.cacheKey || (!gesturing && Math.abs(wanted - this.cacheScale) > 0.01)) {
      this.cacheKey = key;
      this.cacheScale = wanted;
      this.paint(m);
    }

    const tl = this.toScreen({ x: WORLD.minX, y: WORLD.minY });
    c.imageSmoothingQuality = 'high';
    c.drawImage(this.cache, tl.x * this.dpr, tl.y * this.dpr, worldW * this.zoom * this.dpr, worldH * this.zoom * this.dpr);

    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    for (const pin of this.pins().sort((a, b) => Number(a.own) - Number(b.own))) this.drawPin(pin.at, pin.own, m);
  }

  // Rounded-square badge with a pointer tail, like the map pins in Coffee Inc 2.
  private drawPin(at: Pt, own: boolean, m: CityModel): void {
    const c = this.ctx;
    const size = own ? 44 : 38;
    const x = at.x - size / 2;
    const y = at.y - size - 12;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.3)';
    c.shadowBlur = 6;
    c.shadowOffsetY = 2;
    c.fillStyle = own ? m.brandColor : 'rgba(34, 52, 50, 0.9)';
    c.beginPath();
    c.roundRect(x, y, size, size, 9);
    c.moveTo(at.x - 7, y + size - 1);
    c.lineTo(at.x, at.y);
    c.lineTo(at.x + 7, y + size - 1);
    c.fill();
    c.restore();
    c.strokeStyle = own ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.35)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.roundRect(x + 0.75, y + 0.75, size - 1.5, size - 1.5, 8.5);
    c.stroke();
    if (own) {
      drawBrandIcon(c, m.brandIcon, at.x, y + size / 2, size * 0.72, '#ffffff', m.brandColor);
      return;
    }
    c.fillStyle = '#c8412c';
    c.beginPath();
    c.roundRect(x + 5, y + 6, size - 10, size - 12, 3);
    c.fill();
    c.strokeStyle = '#f3e7df';
    c.lineWidth = 1;
    c.stroke();
    c.fillStyle = '#ffffff';
    c.font = '700 8.5px -apple-system, system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('FOR', at.x, y + size / 2 - 5);
    c.fillText('LEASE', at.x, y + size / 2 + 5);
  }

  private paint(m: CityModel): void {
    const s = this.cacheScale;
    this.cache.width = Math.ceil((WORLD.maxX - WORLD.minX) * s);
    this.cache.height = Math.ceil((WORLD.maxY - WORLD.minY) * s);
    const c = this.cache.getContext('2d');
    if (!c) return;
    c.setTransform(s, 0, 0, s, -WORLD.minX * s, -WORLD.minY * s);
    const night = isNight(m.hourOfDay);

    const tiles: { x: number; y: number }[] = [];
    for (let y = 0; y < GY; y++) for (let x = 0; x < GX; x++) tiles.push({ x, y });
    tiles.sort((a, b) => a.x + a.y - (b.x + b.y) || a.x - b.x);

    for (const { x, y } of tiles) this.ground(c, x, y);
    for (const { x, y } of tiles) this.structure(c, x, y, m, night);

    if (night || isDusk(m.hourOfDay)) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = night ? 'rgba(18, 24, 58, 0.42)' : 'rgba(120, 60, 40, 0.12)';
      c.globalCompositeOperation = 'source-atop';
      c.fillRect(0, 0, this.cache.width, this.cache.height);
      c.globalCompositeOperation = 'source-over';
    }
  }

  private ground(c: Ctx, x: number, y: number): void {
    const quad = [iso(x, y), iso(x + 1, y), iso(x + 1, y + 1), iso(x, y + 1)];
    if (y >= LAND_Y) {
      poly(c, quad, '#17abc8');
      if (hash(x, y, 9) > 0.6) {
        const p = iso(x + 0.5, y + 0.5);
        c.strokeStyle = 'rgba(255,255,255,0.35)';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(p.x - 6, p.y);
        c.quadraticCurveTo(p.x, p.y - 3, p.x + 6, p.y);
        c.stroke();
      }
      return;
    }
    const roadX = ROADS_X.has(x);
    const roadY = ROADS_Y.has(y);
    if (roadX || roadY) {
      poly(c, quad, '#8e9396');
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
    const d = DISTRICTS[Math.min(2, Math.floor(y / 5))]![Math.floor(x / 5)]!;
    const green = d === 'park' || d === 'campus';
    poly(c, quad, green ? '#9be36b' : '#e2e8dc');
    // Mint curb along any edge that meets a road, as on the Coffee Inc 2 map.
    const curb = '#b3e79c';
    const edge = (a: Pt, b: Pt, cc: Pt, dd: Pt) => poly(c, [a, b, cc, dd], curb);
    const w = 0.12;
    if (isRoad(x, y - 1)) edge(iso(x, y), iso(x + 1, y), iso(x + 1, y + w), iso(x, y + w));
    if (isRoad(x, y + 1)) edge(iso(x, y + 1 - w), iso(x + 1, y + 1 - w), iso(x + 1, y + 1), iso(x, y + 1));
    if (isRoad(x - 1, y)) edge(iso(x, y), iso(x + w, y), iso(x + w, y + 1), iso(x, y + 1));
    if (isRoad(x + 1, y)) edge(iso(x + 1 - w, y), iso(x + 1, y), iso(x + 1, y + 1), iso(x + 1 - w, y + 1));
  }

  private structure(c: Ctx, x: number, y: number, m: CityModel, night: boolean): void {
    if (y >= LAND_Y || isRoad(x, y)) {
      if (y === LAND_Y + 1 && (x === 11 || x === 12)) box(c, x + 0.1, y - 1, x + 0.9, y + 1.2, 0, 3, '#a5825f');
      return;
    }
    const lotId = Object.keys(LOTS).find((k) => LOTS[k]!.x === x && LOTS[k]!.y === y);
    if (lotId) {
      if (lotId === m.storeLot) this.cafe(c, x, y, m.brandColor, night);
      else this.vacantLot(c, x, y);
      return;
    }
    const d = DISTRICTS[Math.min(2, Math.floor(y / 5))]![Math.floor(x / 5)]!;
    const r = hash(x, y, 1);
    if (d === 'park') {
      if (x === 2 && y === 2) tower(c, 2.5, 2.5);
      else if (r > 0.35) tree(c, x + 0.5, y + 0.5, 1);
      return;
    }
    if ((d === 'campus' || d === 'houses') && r > 0.72) {
      tree(c, x + 0.3 + hash(x, y, 2) * 0.4, y + 0.5, 0.9);
      return;
    }
    if (d !== 'towers' && d !== 'uptown' && r > 0.9) {
      tree(c, x + 0.5, y + 0.5, 0.8);
      return;
    }
    const palette = PALETTES[d];
    const color = palette[Math.floor(hash(x, y, 3) * palette.length)]!;
    const [lo, hi] = HEIGHTS[d];
    const h = Math.round(lo + (hi - lo) * hash(x, y, 4));
    const inset = d === 'houses' ? 0.2 : 0.1;
    box(c, x + inset, y + inset, x + 1 - inset, y + 1 - inset, 0, h, color);
    if (d === 'houses') {
      poly(c, [iso(x + inset, y + 1 - inset, h), iso(x + 1 - inset, y + 1 - inset, h), iso(x + 0.5, y + 0.5, h + 9)], shade('#8f5a44', 0.05));
      poly(c, [iso(x + 1 - inset, y + inset, h), iso(x + 1 - inset, y + 1 - inset, h), iso(x + 0.5, y + 0.5, h + 9)], '#7a4a38');
      return;
    }
    const glass = d === 'towers' || d === 'uptown' ? '#5f7d92' : '#6f7f88';
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
