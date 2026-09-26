import { ART, HAIR, P, PANTS, SHIRTS, SKIN } from './palette';

export interface SceneModel {
  equipment: readonly string[];
  broken: readonly string[];
  baristas: readonly { id: string; look: number }[];
  serving: boolean;
  hourOfDay: number;
  servedLastHour: number;
  speed: number;
  companyName: string;
  brandColor: string;
}

// Reserved room at the top of the canvas where the dialogue band sits over the scene.
export interface SceneOptions {
  insetTop?: number;
}

interface Pt {
  x: number;
  y: number;
}

const TW = 64;
const TH = 32;
const ROOM_X = 8;
const ROOM_Y = 6;
const WALL_H = 118;
const COUNTER_Z = 30;
const BOUNDS = { minX: -214, maxX: 296, minY: -136, maxY: 272 };

const iso = (x: number, y: number, z = 0): Pt => ({ x: ((x - y) * TW) / 2, y: ((x + y) * TH) / 2 - z });

const ENTRANCE: Pt = { x: 8.72, y: -0.7 };
const SIDEWALK_DOOR: Pt = { x: 8.72, y: 4.9 };
const ENTRY_WP: Pt = { x: 7.7, y: 4.9 };
const QUEUE: Pt[] = [0, 1, 2, 3, 4, 5].map((i) => ({ x: 6.9, y: 2.3 + i * 0.55 }));
const PICKUP: Pt = { x: 4.6, y: 2.3 };
const LEAVE_PATH: Pt[] = [{ x: 8.0, y: 5.3 }, { x: 8.72, y: 5.6 }, { x: 8.72, y: 6.75 }, { x: -1.2, y: 6.75 }];
const PASS_A: Pt[] = [{ x: -1.2, y: 6.95 }, { x: 8.9, y: 6.95 }, { x: 8.9, y: -0.9 }];
const PASS_B: Pt[] = [{ x: 9.1, y: -0.9 }, { x: 9.1, y: 7.1 }, { x: -1.2, y: 7.1 }];
const TABLE_SLOTS: Pt[] = [
  { x: 1.2, y: 3.7 }, { x: 2.8, y: 3.7 }, { x: 4.4, y: 3.7 },
  { x: 1.2, y: 5.1 }, { x: 2.8, y: 5.1 }, { x: 4.4, y: 5.1 },
];
const ARMCHAIR_SLOTS: Pt[] = [{ x: 0.95, y: 2.55 }, { x: 2.3, y: 2.55 }];
const PLANT_SLOTS: Pt[] = [{ x: 0.5, y: 1.45 }, { x: 7.72, y: 0.45 }, { x: 0.45, y: 5.6 }, { x: 5.7, y: 5.75 }];
const BARISTA_X = [6.9, 4.6, 2.9, 5.7, 3.7, 1.9];
const LAMP_SLOTS: Pt[] = [{ x: 1.2, y: 3.7 }, { x: 2.8, y: 3.7 }, { x: 4.4, y: 3.7 }];

type WalkerState = 'enter' | 'queue' | 'order' | 'toPickup' | 'pickup' | 'toSeat' | 'seated' | 'leave' | 'pass';

interface Walker {
  id: number;
  look: number;
  x: number;
  y: number;
  path: Pt[];
  state: WalkerState;
  timer: number;
  seat: number | null;
  carrying: boolean;
  phase: number;
}

interface Seat {
  x: number;
  y: number;
  occupant: number | null;
}

interface Car {
  x: number;
  y: number;
  dx: number;
  color: string;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  age: number;
}

type Ctx = CanvasRenderingContext2D;

function poly(ctx: Ctx, pts: Pt[], fill: string, stroke?: string): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
}

function box(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, top: string, front: string, side: string): void {
  poly(ctx, [iso(x0, y1, z0), iso(x1, y1, z0), iso(x1, y1, z1), iso(x0, y1, z1)], front);
  poly(ctx, [iso(x1, y0, z0), iso(x1, y1, z0), iso(x1, y1, z1), iso(x1, y0, z1)], side);
  poly(ctx, [iso(x0, y0, z1), iso(x1, y0, z1), iso(x1, y1, z1), iso(x0, y1, z1)], top);
}

function isoEllipse(ctx: Ctx, x: number, y: number, z: number, r: number, fill: string): void {
  const c = iso(x, y, z);
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, r * 45, r * 22.6, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

const wallA = (x0: number, x1: number, z0: number, z1: number): Pt[] => [iso(x0, 0, z0), iso(x1, 0, z0), iso(x1, 0, z1), iso(x0, 0, z1)];
const wallB = (y0: number, y1: number, z0: number, z1: number): Pt[] => [iso(0, y0, z0), iso(0, y1, z0), iso(0, y1, z1), iso(0, y0, z1)];

function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + ((pb[i] ?? 0) - v) * t)).join(',')})`;
}

function skyColor(hour: number): string {
  if (hour < 5 || hour >= 21) return '#27304f';
  if (hour < 7) return mix('#27304f', '#f2c49b', (hour - 5) / 2);
  if (hour < 9) return mix('#f2c49b', '#bfe0f2', (hour - 7) / 2);
  if (hour < 17) return '#bfe0f2';
  if (hour < 19) return mix('#bfe0f2', '#f0b184', (hour - 17) / 2);
  return mix('#f0b184', '#27304f', (hour - 19) / 2);
}

const isNight = (hour: number) => hour < 6 || hour >= 20;

function drawPerson(ctx: Ctx, x: number, y: number, look: number, opts: { apron?: string; seated?: boolean; phase?: number; carrying?: boolean }): void {
  const walking = opts.phase !== undefined && !opts.seated;
  const bob = walking ? -Math.abs(Math.sin(opts.phase ?? 0)) * 1.5 : 0;
  const p = iso(x, y, opts.seated ? 9 : 0);
  const skin = SKIN[look % SKIN.length]!;
  const hair = HAIR[Math.floor(look / 5) % HAIR.length]!;
  const shirt = opts.apron ? '#f4f1ea' : SHIRTS[Math.floor(look / 7) % SHIRTS.length]!;
  const pants = PANTS[Math.floor(look / 11) % PANTS.length]!;
  const style = Math.floor(look / 13) % 3;

  // Slim, tall figures closer to Coffee Inc 2's people than chunky cartoon ones.
  if (!opts.seated) {
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 7, 3.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = P.shadow;
    ctx.fill();
    const swing = walking ? Math.sin(opts.phase ?? 0) * 2.4 : 0;
    ctx.fillStyle = pants;
    ctx.fillRect(p.x - 3.6, p.y - 19 + bob, 3, 19 - swing);
    ctx.fillRect(p.x + 0.6, p.y - 19 + bob, 3, 19 + swing);
    ctx.fillStyle = '#2a2624';
    ctx.fillRect(p.x - 4, p.y - 1.5 - swing, 3.8, 1.8);
    ctx.fillRect(p.x + 0.4, p.y - 1.5 + swing, 3.8, 1.8);
  }
  const top = p.y + bob - (opts.seated ? -4 : 0);
  ctx.fillStyle = shirt;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(p.x - 5.5, top - 38, 11, 21, 3);
  else ctx.rect(p.x - 5.5, top - 38, 11, 21);
  ctx.fill();
  ctx.fillStyle = mix(shirt, '#000000', 0.18);
  ctx.fillRect(p.x - 7.5, top - 36, 2.2, 15);
  ctx.fillRect(p.x + 5.3, top - 36, 2.2, 15);
  if (opts.apron) {
    ctx.fillStyle = opts.apron;
    ctx.fillRect(p.x - 4.5, top - 31, 9, 15);
    ctx.fillRect(p.x - 3.5, top - 37, 1.5, 6);
    ctx.fillRect(p.x + 2, top - 37, 1.5, 6);
  }
  if (opts.carrying) {
    ctx.fillStyle = '#fbf8f2';
    ctx.fillRect(p.x + 6, top - 27, 4, 6);
    ctx.fillStyle = P.woodDark;
    ctx.fillRect(p.x + 6, top - 28, 4, 1.6);
  }
  ctx.fillStyle = skin;
  ctx.fillRect(p.x - 1.5, top - 41, 3, 4);
  ctx.beginPath();
  ctx.ellipse(p.x, top - 45, 5, 5.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.ellipse(p.x, top - 47, 5.3, 4.3, 0, Math.PI, 0);
  ctx.fill();
  if (style === 1) ctx.fillRect(p.x - 5.3, top - 47, 2.4, 9);
  if (style === 1) ctx.fillRect(p.x + 2.9, top - 47, 2.4, 9);
  if (style === 2) {
    ctx.beginPath();
    ctx.arc(p.x, top - 52, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCar(ctx: Ctx, car: Car): void {
  const { x, y, color } = car;
  const alongX = car.dx !== 0;
  const [hx, hy] = alongX ? [0.62, 0.3] : [0.3, 0.62];
  const s = iso(x, y);
  ctx.beginPath();
  ctx.ellipse(s.x, s.y + 2, 30, 13, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20, 20, 20, 0.25)';
  ctx.fill();
  box(ctx, x - hx, y - hy, x + hx, y + hy, 3, 13, mix(color, '#ffffff', 0.12), color, mix(color, '#000000', 0.25));
  const [cx, cy] = alongX ? [0.36, 0.26] : [0.26, 0.36];
  box(ctx, x - cx, y - cy, x + cx, y + cy, 13, 22, mix(color, '#ffffff', 0.1), '#3b4f5c', '#2c3b45');
  ctx.fillStyle = '#1d1d1f';
  const wheels = alongX
    ? [[x - 0.4, y + hy], [x + 0.4, y + hy], [x + hx, y - 0.18], [x + hx, y + 0.18]]
    : [[x + hx, y - 0.4], [x + hx, y + 0.4], [x - 0.18, y + hy], [x + 0.18, y + hy]];
  for (const [wx, wy] of wheels) {
    const w = iso(wx!, wy!, 3);
    ctx.beginPath();
    ctx.ellipse(w.x, w.y, 3.6, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

const fadeAt = (x: number, y: number) => Math.max(0, Math.min(1, (x + 1.2) / 1.2, (y + 0.9) / 1.2));

export class StoreScene {
  private readonly ctx: Ctx;
  private readonly bg = document.createElement('canvas');
  private readonly mid = document.createElement('canvas');
  private width = 0;
  private height = 0;
  private dpr = 1;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private layerKey = '';
  private model: SceneModel | null = null;
  private walkers: Walker[] = [];
  private queue: Walker[] = [];
  private seats: Seat[] = [];
  private particles: Particle[] = [];
  private spawnIn = 0.5;
  private nextId = 1;
  private raf = 0;
  private last = 0;
  private time = 0;
  private seed = 12345;
  private passIn = 1;
  private carIn = 3;
  private cars: Car[] = [];
  private readonly insetTop: number;

  constructor(private readonly canvas: HTMLCanvasElement, options: SceneOptions = {}) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot draw the store view.');
    this.ctx = ctx;
    this.insetTop = options.insetTop ?? 0;
  }

  private rand(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = Math.min(dpr, 2);
    for (const c of [this.canvas, this.bg, this.mid]) {
      c.width = Math.max(1, Math.round(width * this.dpr));
      c.height = Math.max(1, Math.round(height * this.dpr));
    }
    const bw = BOUNDS.maxX - BOUNDS.minX;
    const bh = BOUNDS.maxY - BOUNDS.minY;
    const usable = Math.max(1, height - this.insetTop);
    this.scale = Math.min(width / bw, usable / bh);
    this.ox = (width - bw * this.scale) / 2 - BOUNDS.minX * this.scale;
    this.oy = this.insetTop + (usable - bh * this.scale) / 2 - BOUNDS.minY * this.scale;
    this.layerKey = '';
    this.draw();
  }

  setModel(model: SceneModel): void {
    this.model = model;
    this.rebuildSeats();
  }

  start(): void {
    const loop = (t: number) => {
      const dt = this.last ? Math.min(0.1, (t - this.last) / 1000) : 0;
      this.last = t;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.last = 0;
  }

  private count(typeId: string): number {
    return this.model?.equipment.filter((e) => e === typeId).length ?? 0;
  }

  private has(prefix: string): string | undefined {
    return this.model?.equipment.find((e) => e === prefix || e.startsWith(`${prefix}-`));
  }

  private rebuildSeats(): void {
    const next: Seat[] = [];
    TABLE_SLOTS.slice(0, this.count('table')).forEach((t) => {
      next.push({ x: t.x - 0.42, y: t.y, occupant: null }, { x: t.x + 0.42, y: t.y, occupant: null });
    });
    ARMCHAIR_SLOTS.slice(0, this.count('armchair')).forEach((a) => next.push({ x: a.x, y: a.y, occupant: null }));
    next.forEach((s, i) => (s.occupant = this.seats[i]?.occupant ?? null));
    this.seats = next;
    for (const w of this.walkers) {
      if (w.seat !== null && !this.seats[w.seat]) {
        w.seat = null;
        this.leave(w);
      }
    }
  }

  private leave(w: Walker): void {
    if (w.seat !== null && this.seats[w.seat]) this.seats[w.seat]!.occupant = null;
    w.seat = null;
    w.state = 'leave';
    w.path = LEAVE_PATH.map((p) => ({ ...p }));
  }

  private update(dt: number): void {
    const m = this.model;
    if (!m || m.speed === 0) return;
    const pace = Math.min(m.speed, 2.5);
    const gdt = dt * pace;
    this.time += gdt;

    if (m.serving && m.servedLastHour > 0) {
      this.spawnIn -= dt;
      if (this.spawnIn <= 0) {
        const perHour = Math.min(7, Math.max(1, m.servedLastHour / 4));
        this.spawnIn = Math.max(0.7, 4 / m.speed / perHour) * (0.7 + this.rand() * 0.6);
        if (this.walkers.length < 14 && this.queue.length < QUEUE.length) {
          const w: Walker = {
            id: this.nextId++,
            look: Math.floor(this.rand() * 1000),
            x: ENTRANCE.x,
            y: ENTRANCE.y,
            path: [SIDEWALK_DOOR, ENTRY_WP],
            state: 'enter',
            timer: 0,
            seat: null,
            carrying: false,
            phase: 0,
          };
          this.walkers.push(w);
          this.queue.push(w);
        }
      }
    }

    // Street life: people walking past and the occasional car, busiest in the daytime.
    const daytime = m.hourOfDay >= 7 && m.hourOfDay < 21;
    this.passIn -= gdt;
    if (daytime && this.passIn <= 0) {
      this.passIn = 2.5 + this.rand() * 3;
      if (this.walkers.filter((w) => w.state === 'pass').length < 4) {
        const route = (this.rand() < 0.5 ? PASS_A : PASS_B).map((p) => ({ ...p }));
        const start = route.shift()!;
        this.walkers.push({ id: this.nextId++, look: Math.floor(this.rand() * 1000), x: start.x, y: start.y, path: route, state: 'pass', timer: 0, seat: null, carrying: false, phase: 0 });
      }
    }
    this.carIn -= gdt;
    if (this.carIn <= 0) {
      this.carIn = (daytime ? 5 : 12) + this.rand() * 6;
      const colors = ['#2e5a5a', '#8b2f2f', '#e8e3d8', '#2d3e63', '#3b3b3b', '#c9a227'];
      this.cars.push({ x: -4, y: 8.55, dx: 2.4, color: colors[Math.floor(this.rand() * colors.length)]! });
    }
    for (const car of this.cars) car.x += car.dx * gdt;
    this.cars = this.cars.filter((car) => car.x < 15);

    for (const w of this.walkers) {
      const qi = this.queue.indexOf(w);
      const registerBusy = this.walkers.some((x) => x.state === 'order');
      if (w.state === 'enter' && w.path.length === 0) w.state = 'queue';
      if (w.state === 'queue' && qi >= 0) w.path = [QUEUE[qi]!];
      if (w.state === 'queue' && qi === 0 && !registerBusy && Math.hypot(w.x - QUEUE[0]!.x, w.y - QUEUE[0]!.y) < 0.05) {
        w.state = 'order';
        w.timer = 1.1;
      }
      if (w.state === 'order' || w.state === 'pickup' || w.state === 'seated') {
        w.timer -= gdt;
        if (w.timer <= 0) {
          if (w.state === 'order') {
            this.queue = this.queue.filter((q) => q !== w);
            w.state = 'toPickup';
            w.path = [{ x: 5.8, y: 2.3 }, PICKUP];
            if (!m.broken.includes('espresso')) this.particles.push({ x: 4.6, y: 1.3, z: COUNTER_Z + 28, age: 0 });
          } else if (w.state === 'pickup') {
            w.carrying = true;
            const free = this.seats.findIndex((s) => s.occupant === null);
            if (free >= 0 && this.rand() < 0.5) {
              this.seats[free]!.occupant = w.id;
              w.seat = free;
              w.state = 'toSeat';
              const s = this.seats[free]!;
              w.path = [{ x: PICKUP.x, y: 2.9 }, { x: s.x, y: s.y + 0.35 }, { x: s.x, y: s.y }];
            } else {
              this.leave(w);
            }
          } else {
            this.leave(w);
          }
        }
      }
      this.move(w, gdt);
      if (w.state === 'toPickup' && w.path.length === 0) {
        w.state = 'pickup';
        w.timer = 0.9;
      }
      if (w.state === 'toSeat' && w.path.length === 0) {
        w.state = 'seated';
        w.timer = 6 + this.rand() * 8;
      }
    }
    this.walkers = this.walkers.filter((w) => !((w.state === 'leave' || w.state === 'pass') && w.path.length === 0));
    this.queue = this.queue.filter((w) => this.walkers.includes(w));

    for (const p of this.particles) {
      p.age += gdt;
      p.z += gdt * 14;
    }
    this.particles = this.particles.filter((p) => p.age < 1.6);
  }

  private move(w: Walker, gdt: number): void {
    let budget = 1.5 * gdt;
    while (budget > 0 && w.path.length > 0) {
      const t = w.path[0]!;
      const d = Math.hypot(t.x - w.x, t.y - w.y);
      if (d <= budget) {
        w.x = t.x;
        w.y = t.y;
        budget -= d;
        w.path.shift();
      } else {
        w.x += ((t.x - w.x) / d) * budget;
        w.y += ((t.y - w.y) / d) * budget;
        budget = 0;
      }
      w.phase += gdt * 11;
    }
  }

  private setWorld(ctx: Ctx): void {
    const s = this.scale * this.dpr;
    ctx.setTransform(s, 0, 0, s, this.ox * this.dpr, this.oy * this.dpr);
  }

  private draw(): void {
    const m = this.model;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!m || this.width === 0) return;

    const key = `${this.width}x${this.height}|${m.equipment.join(',')}|${m.broken.join(',')}|${m.hourOfDay}|${m.companyName}|${m.brandColor}`;
    if (key !== this.layerKey) {
      this.layerKey = key;
      this.paintBackground(m);
      this.paintCounter(m);
    }

    ctx.drawImage(this.bg, 0, 0);
    this.setWorld(ctx);
    m.baristas.slice(0, BARISTA_X.length).forEach((b, i) => {
      const sway = m.serving && m.speed > 0 ? Math.sin(this.time * 3 + i) * 0.05 : 0;
      drawPerson(ctx, BARISTA_X[i]! + sway, 0.62, b.look, { apron: m.brandColor });
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.mid, 0, 0);
    this.setWorld(ctx);

    for (const p of this.particles) {
      const c = iso(p.x, p.y, p.z);
      ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - p.age / 1.6)})`;
      ctx.beginPath();
      ctx.arc(c.x + Math.sin(p.age * 5) * 2, c.y, 3 + p.age * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    const drawables: { depth: number; draw: () => void }[] = [];
    const tables = TABLE_SLOTS.slice(0, this.count('table'));
    tables.forEach((t, ti) => {
      const leftSeat = this.seats[ti * 2];
      const rightSeat = this.seats[ti * 2 + 1];
      drawables.push({ depth: t.x - 0.42 + t.y - 0.01, draw: () => this.chair(t.x - 0.42, t.y, false) });
      drawables.push({
        depth: t.x + t.y,
        draw: () => this.table(t.x, t.y, (leftSeat?.occupant ?? null) !== null, (rightSeat?.occupant ?? null) !== null),
      });
      drawables.push({ depth: t.x + 0.42 + t.y + 0.01, draw: () => this.chair(t.x + 0.42, t.y, true) });
    });
    ARMCHAIR_SLOTS.slice(0, this.count('armchair')).forEach((a) => drawables.push({ depth: a.x + a.y - 0.01, draw: () => this.armchair(a.x, a.y) }));
    PLANT_SLOTS.slice(0, this.count('plant')).forEach((p) => drawables.push({ depth: p.x + p.y, draw: () => this.plant(p.x, p.y) }));
    for (const w of this.walkers) {
      const seated = w.state === 'seated';
      drawables.push({
        depth: w.x + w.y + (seated ? 0 : 0.02),
        draw: () => {
          ctx.globalAlpha = fadeAt(w.x, w.y);
          drawPerson(ctx, w.x, w.y, w.look, { seated, carrying: w.carrying && !seated, phase: w.path.length > 0 ? w.phase : undefined });
          ctx.globalAlpha = 1;
        },
      });
    }
    const parked: Car = { x: 10.25, y: 2.4, dx: 0, color: '#2e5a5a' };
    for (const car of [parked, ...this.cars]) drawables.push({ depth: car.x + car.y, draw: () => drawCar(ctx, car) });
    drawables.sort((a, b) => a.depth - b.depth).forEach((d) => d.draw());

    if (isNight(m.hourOfDay)) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(16, 20, 46, 0.34)';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.setWorld(ctx);
    }
    if (this.count('lights') > 0) this.lamps(m);
  }

  // Dark building fronts across the street fill the canvas behind the store.
  private paintBackdrop(c: Ctx): void {
    const w = this.bg.width;
    const h = this.bg.height;
    const u = 7 * this.dpr * Math.max(0.6, this.scale);
    c.fillStyle = P.facade;
    c.fillRect(0, 0, w, h);
    for (let row = 0; row * u * 7 < h; row++) {
      for (let col = 0; col * u * 5 < w; col++) {
        const x = col * u * 5 + u;
        const y = row * u * 7 + u * 1.2;
        c.fillStyle = P.facadeFrame;
        c.fillRect(x - u * 0.3, y - u * 0.3, u * 3.6, u * 4.6);
        c.fillStyle = P.facadeWindow;
        c.fillRect(x, y, u * 3, u * 4);
      }
    }
  }

  private paintStreet(c: Ctx): void {
    poly(c, [iso(9.4, -4), iso(15, -4), iso(15, 14), iso(-5, 14), iso(-5, 7.4), iso(9.4, 7.4)], P.road);
    poly(c, [iso(8, -4), iso(9.4, -4), iso(9.4, 7.4), iso(-5, 7.4), iso(-5, 6), iso(8, 6)], P.sidewalk);
    c.strokeStyle = P.curb;
    c.lineWidth = 2;
    c.beginPath();
    for (const [i, p] of [iso(9.4, -4), iso(9.4, 7.4), iso(-5, 7.4)].entries()) {
      if (i === 0) c.moveTo(p.x, p.y);
      else c.lineTo(p.x, p.y);
    }
    c.stroke();
    // Zebra crossings at the corner, and lane dashes.
    for (let k = 0; k < 6; k++) {
      const x = 5.3 + k * 0.34;
      poly(c, [iso(x, 7.7), iso(x + 0.17, 7.7), iso(x + 0.17, 9.6), iso(x, 9.6)], 'rgba(255,255,255,0.85)');
      const y = 1.9 + k * 0.34;
      poly(c, [iso(9.7, y), iso(11.6, y), iso(11.6, y + 0.17), iso(9.7, y + 0.17)], 'rgba(255,255,255,0.85)');
    }
    c.strokeStyle = 'rgba(255,255,255,0.8)';
    c.lineWidth = 1.6;
    c.setLineDash([10, 12]);
    c.beginPath();
    const a = iso(-5, 10.2);
    const b = iso(15, 10.2);
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    const d = iso(12.2, -4);
    const e = iso(12.2, 14);
    c.moveTo(d.x, d.y);
    c.lineTo(e.x, e.y);
    c.stroke();
    c.setLineDash([]);
  }

  private paintBricks(c: Ctx): void {
    c.strokeStyle = P.mortar;
    c.lineWidth = 0.7;
    const course = 5;
    for (let row = 0; row * course < WALL_H; row++) {
      const z = row * course;
      const offset = (row % 2) * 0.17;
      c.beginPath();
      const a0 = iso(0, 0, z);
      const a1 = iso(ROOM_X, 0, z);
      c.moveTo(a0.x, a0.y);
      c.lineTo(a1.x, a1.y);
      const b1 = iso(0, ROOM_Y, z);
      c.moveTo(a0.x, a0.y);
      c.lineTo(b1.x, b1.y);
      for (let x = offset; x < ROOM_X; x += 0.34) {
        const p = iso(x, 0, z);
        c.moveTo(p.x, p.y);
        c.lineTo(p.x, p.y - course);
      }
      for (let y = offset; y < ROOM_Y; y += 0.34) {
        const p = iso(0, y, z);
        c.moveTo(p.x, p.y);
        c.lineTo(p.x, p.y - course);
      }
      c.stroke();
    }
  }

  private paintBackground(m: SceneModel): void {
    const c = this.bg.getContext('2d');
    if (!c) return;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.bg.width, this.bg.height);
    this.paintBackdrop(c);
    this.setWorld(c);
    this.paintStreet(c);

    poly(c, [iso(0, 0), iso(ROOM_X, 0), iso(ROOM_X, ROOM_Y), iso(0, ROOM_Y)], P.floorA);
    c.strokeStyle = P.floorLine;
    c.lineWidth = 0.6;
    for (let j = 1; j < ROOM_Y * 3; j++) {
      const y = j / 3;
      c.beginPath();
      const a = iso(0, y);
      const b = iso(ROOM_X, y);
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
      for (let k = (j % 2) * 0.75; k < ROOM_X; k += 1.5) {
        const p1 = iso(k, y);
        const p2 = iso(k, y - 1 / 3);
        c.beginPath();
        c.moveTo(p1.x, p1.y);
        c.lineTo(p2.x, p2.y);
        c.stroke();
      }
    }
    for (let j = 0; j < ROOM_Y * 3; j += 2) {
      poly(c, [iso(0, j / 3), iso(ROOM_X, j / 3), iso(ROOM_X, (j + 1) / 3), iso(0, (j + 1) / 3)], 'rgba(90, 55, 25, 0.05)');
    }

    poly(c, wallA(0, ROOM_X, 0, WALL_H), P.wallA);
    poly(c, wallB(0, ROOM_Y, 0, WALL_H), P.wallB);
    this.paintBricks(c);
    poly(c, wallA(0, ROOM_X, 0, 7), P.baseboard);
    poly(c, wallB(0, ROOM_Y, 0, 7), mix(P.baseboard, '#000000', 0.1));
    poly(c, [iso(-0.18, -0.18, WALL_H), iso(ROOM_X, -0.18, WALL_H), iso(ROOM_X, 0, WALL_H), iso(0, 0, WALL_H), iso(0, ROOM_Y, WALL_H), iso(-0.18, ROOM_Y, WALL_H)], P.wallTop);
    poly(c, [iso(ROOM_X, -0.18, 0), iso(ROOM_X, 0, 0), iso(ROOM_X, 0, WALL_H), iso(ROOM_X, -0.18, WALL_H)], P.wallB);
    poly(c, [iso(-0.18, ROOM_Y, 0), iso(0, ROOM_Y, 0), iso(0, ROOM_Y, WALL_H), iso(-0.18, ROOM_Y, WALL_H)], mix(P.wallB, '#000000', 0.08));

    // Window with time-of-day sky, plus the light it throws on the floor.
    const sky = skyColor(m.hourOfDay);
    poly(c, wallB(2.1, 4.5, 32, 98), P.frame);
    poly(c, wallB(2.18, 4.42, 36, 94), sky);
    poly(c, wallB(3.27, 3.33, 36, 94), P.frame);
    poly(c, wallB(2.18, 4.42, 64, 67), P.frame);
    box(c, -0.02, 2.05, 0.16, 4.55, 28, 32, P.woodLight, P.wood, P.woodDark);
    if (!isNight(m.hourOfDay)) {
      poly(c, [iso(0, 2.1), iso(0, 4.5), iso(1.7, 5.3), iso(1.7, 2.9)], 'rgba(255, 244, 214, 0.16)');
    }

    // Wall art on the side wall.
    [[0.35, 1.45], [4.85, 5.75]].slice(0, this.count('art')).forEach(([y0, y1], i) => {
      const colors = ART[i % ART.length]!;
      poly(c, wallB(y0!, y1!, 46, 90), P.frame);
      poly(c, wallB(y0! + 0.06, y1! - 0.06, 50, 86), '#f7f1e6');
      poly(c, wallB(y0! + 0.15, y0! + 0.55, 56, 80), colors[0]!);
      poly(c, wallB(y0! + 0.45, y1! - 0.15, 62, 74), colors[1]!);
      poly(c, wallB(y1! - 0.45, y1! - 0.18, 54, 70), colors[2]!);
    });

    // Back counter, shelves, menu board, and shop sign on the back wall.
    box(c, 1.1, 0, 7.5, 0.3, 0, 28, P.counterTop, P.counterSide, P.counterSide);
    for (const [x0, x1, z] of [[1.3, 2.7, 72], [1.3, 2.7, 92]] as const) {
      box(c, x0, 0, x1, 0.18, z - 3, z, P.woodLight, P.wood, P.woodDark);
      for (let x = x0 + 0.15; x < x1 - 0.1; x += 0.28) box(c, x, 0.04, x + 0.14, 0.14, z, z + 8, '#f7f3ec', '#e9e2d6', '#d8cfc1');
    }
    poly(c, wallA(2.95, 5.35, 56, 100), P.frame);
    poly(c, wallA(3.02, 5.28, 59, 97), P.slate);
    c.strokeStyle = P.chalk;
    c.lineWidth = 1;
    for (let r = 0; r < 4; r++) {
      for (const [x0, x1] of [[3.15, 3.95], [4.25, 5.05]] as const) {
        const a = iso(x0, 0, 88 - r * 8);
        const b = iso(x1 - (r % 2) * 0.2, 0, 88 - r * 8);
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
        c.stroke();
      }
    }
    poly(c, wallA(5.75, 7.75, 66, 94), m.brandColor);
    const signOrigin = iso(5.9, 0, 76);
    c.save();
    c.transform(1, 0.5, 0, 1, signOrigin.x, signOrigin.y);
    const name = m.companyName.toUpperCase();
    let size = 9;
    c.font = `700 ${size}px -apple-system, system-ui, sans-serif`;
    const maxW = 1.7 * 32;
    const w = c.measureText(name).width;
    if (w > maxW) size = Math.max(4, (size * maxW) / w);
    c.font = `700 ${size}px -apple-system, system-ui, sans-serif`;
    c.fillStyle = '#f4ede3';
    c.textBaseline = 'middle';
    c.fillText(name, 0, 0, maxW);
    c.restore();

    if (this.count('armchair') > 0) {
      poly(c, [iso(0.45, 2.05), iso(2.8, 2.05), iso(2.8, 3.05), iso(0.45, 3.05)], '#b65d44');
      poly(c, [iso(0.6, 2.2), iso(2.65, 2.2), iso(2.65, 2.9), iso(0.6, 2.9)], '#c7735a');
    }
    poly(c, [iso(7.3, 4.2), iso(8, 4.2), iso(8, 5.6), iso(7.3, 5.6)], '#5c4a3d');
  }

  private paintCounter(m: SceneModel): void {
    const c = this.mid.getContext('2d');
    if (!c) return;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.mid.width, this.mid.height);
    this.setWorld(c);

    box(c, 1.2, 1.0, 7.4, 1.75, 0, COUNTER_Z - 3, P.counterTop, P.counterFront, P.counterSide);
    box(c, 1.15, 0.95, 7.45, 1.8, COUNTER_Z - 3, COUNTER_Z, P.counterTop, P.counterTopEdge, P.counterTopEdge);
    c.strokeStyle = 'rgba(0,0,0,0.12)';
    c.lineWidth = 0.8;
    for (let x = 1.5; x < 7.4; x += 0.3) {
      const a = iso(x, 1.75, 2);
      const b = iso(x, 1.75, COUNTER_Z - 5);
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
    }

    const z = COUNTER_Z;
    const cold = this.has('coldbrew');
    if (cold) {
      box(c, 1.6, 1.2, 1.66, 1.26, z, z + 62, P.woodDark, P.woodDark, P.wood);
      box(c, 2.04, 1.2, 2.1, 1.26, z, z + 62, P.woodDark, P.woodDark, P.wood);
      box(c, 1.6, 1.2, 2.1, 1.5, z + 58, z + 62, P.woodLight, P.wood, P.woodDark);
      for (const [z0, z1, fill] of [[z + 40, z + 56, '#e8f1f4'], [z + 22, z + 36, '#6b4226'], [z + 4, z + 18, '#3d2618']] as const) {
        box(c, 1.72, 1.28, 1.98, 1.44, z0, z1, fill, fill, fill);
      }
    }
    if (this.has('drip')) {
      box(c, 2.6, 1.15, 3.2, 1.55, z, z + 30, P.chrome, P.chromeDark, P.steel);
      box(c, 2.72, 1.5, 3.08, 1.62, z, z + 12, '#3a2519', 'rgba(60,35,20,0.85)', 'rgba(40,25,15,0.9)');
    }
    const grinder = this.has('grinder');
    if (grinder) {
      const body = grinder === 'grinder-2' ? P.black : P.chrome;
      box(c, 3.5, 1.2, 3.82, 1.52, z, z + 20, body, body === P.black ? '#3a3633' : P.chromeDark, body === P.black ? '#1f1d1b' : P.steel);
      box(c, 3.53, 1.23, 3.79, 1.49, z + 20, z + 32, '#7a4a2a', 'rgba(160,110,70,0.75)', 'rgba(120,80,50,0.8)');
    }
    const espresso = this.has('espresso');
    if (espresso) {
      const tier = Number(espresso.split('-')[1] ?? 1);
      const colors = tier === 1 ? [P.red, P.red, P.redDark] : tier === 2 ? [P.chrome, P.chromeDark, P.steel] : [P.black, '#3a3633', '#1f1d1b'];
      const x1 = 4.1 + 0.38 * (tier + 1);
      box(c, 4.1, 1.1, x1, 1.6, z, z + 26, colors[0]!, colors[1]!, colors[2]!);
      box(c, 4.1, 1.1, x1, 1.6, z + 26, z + 29, P.chrome, P.chromeDark, P.steel);
      for (let g = 0; g < tier; g++) {
        const gx = 4.3 + g * 0.38;
        box(c, gx, 1.6, gx + 0.14, 1.66, z + 12, z + 18, P.black, P.black, P.black);
        box(c, gx - 0.02, 1.58, gx + 0.16, 1.7, z, z + 5, '#f7f3ec', '#ece5d9', '#d8cfc1');
      }
      if (m.broken.includes('espresso')) this.warning(c, (4.1 + x1) / 2, 1.35, z + 44);
    }
    if (this.has('pastry')) {
      box(c, 5.45, 1.1, 6.35, 1.7, z, z + 5, P.woodLight, P.wood, P.woodDark);
      const treats = ['#d9a15b', '#8a5a9c', '#c98b4f', '#e0b872', '#7a4a2a', '#d9a15b'];
      treats.forEach((t, i) => isoEllipse(c, 5.62 + (i % 3) * 0.26, 1.25 + Math.floor(i / 3) * 0.26, z + 8, 0.09, t));
      box(c, 5.45, 1.1, 6.35, 1.7, z + 5, z + 20, 'rgba(225,240,246,0.35)', P.glass, 'rgba(200,225,235,0.5)');
    }
    if (this.has('register')) {
      box(c, 6.6, 1.2, 7.15, 1.55, z, z + 10, '#3a3633', '#2d2a28', '#1f1d1b');
      box(c, 6.7, 1.25, 7.05, 1.32, z + 10, z + 24, '#dfe8ea', '#2d2a28', '#1f1d1b');
    }
  }

  private warning(c: Ctx, x: number, y: number, z: number): void {
    const p = iso(x, y, z);
    c.beginPath();
    c.moveTo(p.x, p.y - 9);
    c.lineTo(p.x + 9, p.y + 7);
    c.lineTo(p.x - 9, p.y + 7);
    c.closePath();
    c.fillStyle = '#e3b341';
    c.fill();
    c.strokeStyle = '#2d2a28';
    c.lineWidth = 1.2;
    c.stroke();
    c.fillStyle = '#2d2a28';
    c.fillRect(p.x - 1, p.y - 4, 2, 6);
    c.fillRect(p.x - 1, p.y + 3.5, 2, 2);
  }

  private table(x: number, y: number, leftBusy: boolean, rightBusy: boolean): void {
    const c = this.ctx;
    isoEllipse(c, x, y, 0, 0.22, P.shadow);
    box(c, x - 0.04, y - 0.04, x + 0.04, y + 0.04, 0, 18, P.black, '#3a3633', '#1f1d1b');
    isoEllipse(c, x, y, 18, 0.3, P.tableEdge);
    isoEllipse(c, x, y, 20, 0.3, P.tableTop);
    for (const [busy, dx] of [[leftBusy, -0.13], [rightBusy, 0.13]] as const) {
      if (!busy) continue;
      box(c, x + dx - 0.05, y - 0.05, x + dx + 0.05, y + 0.05, 20, 27, '#6b4226', '#fbf8f2', '#e9e2d6');
    }
  }

  private chair(x: number, y: number, backOnRight: boolean): void {
    const c = this.ctx;
    box(c, x - 0.13, y - 0.13, x + 0.13, y + 0.13, 0, 12, P.navy, P.navyDark, P.navyDark);
    const bx = backOnRight ? x + 0.1 : x - 0.13;
    box(c, bx, y - 0.13, bx + 0.03, y + 0.13, 12, 28, P.navy, P.navyDark, P.navyDark);
  }

  private armchair(x: number, y: number): void {
    const c = this.ctx;
    isoEllipse(c, x, y, 0, 0.3, P.shadow);
    box(c, x - 0.28, y - 0.25, x + 0.28, y + 0.25, 0, 12, P.fabric, P.fabricDark, P.fabricDark);
    box(c, x - 0.28, y - 0.25, x - 0.18, y + 0.25, 12, 30, P.fabric, P.fabricDark, P.fabricDark);
    box(c, x - 0.18, y - 0.25, x + 0.28, y - 0.17, 12, 20, P.fabric, P.fabricDark, P.fabricDark);
    box(c, x - 0.18, y + 0.17, x + 0.28, y + 0.25, 12, 20, P.fabric, P.fabricDark, P.fabricDark);
  }

  private plant(x: number, y: number): void {
    const c = this.ctx;
    isoEllipse(c, x, y, 0, 0.2, P.shadow);
    box(c, x - 0.14, y - 0.14, x + 0.14, y + 0.14, 0, 16, '#5a3b28', P.pot, P.potDark);
    const leaves: [number, number, number, string][] = [
      [0, 0, 34, P.leafDark], [-0.1, 0.05, 28, P.leaf], [0.1, -0.05, 30, P.leaf], [0.02, 0.08, 40, P.leaf], [-0.04, -0.06, 44, P.leafDark],
    ];
    for (const [dx, dy, z, color] of leaves) {
      const p = iso(x + dx, y + dy, z);
      c.beginPath();
      c.ellipse(p.x, p.y, 7, 10, dx * 4, 0, Math.PI * 2);
      c.fillStyle = color;
      c.fill();
    }
  }

  private lamps(m: SceneModel): void {
    const c = this.ctx;
    const lit = m.serving || isNight(m.hourOfDay) || m.hourOfDay >= 17;
    for (const l of LAMP_SLOTS) {
      const top = iso(l.x, l.y, 240);
      const p = iso(l.x, l.y, 130);
      c.strokeStyle = '#2d2a28';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(top.x, top.y);
      c.lineTo(p.x, p.y);
      c.stroke();
      if (lit) {
        const g = c.createRadialGradient(p.x, p.y + 10, 2, p.x, p.y + 10, 46);
        g.addColorStop(0, 'rgba(255, 220, 160, 0.45)');
        g.addColorStop(1, 'rgba(255, 220, 160, 0)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(p.x, p.y + 10, 46, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = P.lampShade;
      c.beginPath();
      c.moveTo(p.x - 4, p.y);
      c.lineTo(p.x + 4, p.y);
      c.lineTo(p.x + 10, p.y + 11);
      c.lineTo(p.x - 10, p.y + 11);
      c.closePath();
      c.fill();
      c.fillStyle = lit ? '#ffe2a8' : '#6d6a64';
      c.beginPath();
      c.ellipse(p.x, p.y + 11, 10, 2.5, 0, 0, Math.PI * 2);
      c.fill();
    }
  }
}
