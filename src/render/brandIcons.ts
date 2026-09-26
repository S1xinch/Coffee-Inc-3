import type { BrandIcon } from '../sim/state';

// 24x24 artwork. `fill` shapes use the foreground color, `line` is stroked in the
// foreground, and `cut` is stroked in the background color to carve details out.
export interface IconArt {
  fill: string[];
  line?: string[];
  cut?: string[];
}

export const BRAND_ART: Record<BrandIcon, IconArt> = {
  cup: {
    fill: ['M4 8h12v5a6 6 0 0 1-12 0z', 'M16 9.5h1.5a3 3 0 0 1 0 6H16v-2h1.5a1 1 0 0 0 0-2H16z', 'M3 19.5h14V21H3z'],
    line: ['M8 2.5c0 1.5 1.2 1.5 1.2 3M12 2.5c0 1.5 1.2 1.5 1.2 3'],
  },
  bean: {
    fill: ['M12 3c4.2 0 7 3.8 7 8.8S16.2 21 12 21s-7-4.2-7-9.2S7.8 3 12 3z'],
    cut: ['M12.6 5c-2.2 2.4-2.2 4.6 0 7s2.2 4.8 0 7'],
  },
  leaf: {
    fill: ['M20 3.5C10 3.5 5 8.5 5 15c0 2 .5 3.6 1.4 5 .9-4 3.8-7.9 8.1-10.1-3.6 2.6-6 6.2-6.6 10.3C15.2 20.5 20 15.2 20 3.5z'],
  },
  moon: {
    fill: ['M15.5 3.2A8.8 8.8 0 1 0 20.8 17 7.2 7.2 0 0 1 15.5 3.2z'],
  },
  wave: {
    fill: ['M2 13.5c2.5-3 5-3 7.5 0s5 3 7.5 0c1.6-1.9 3.4-2.4 5-1.5V21H2z'],
    line: ['M2 8c2.5-3 5-3 7.5 0s5 3 7.5 0c1.6-1.9 3.4-2.4 5-1.5'],
  },
  star: {
    fill: ['M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z'],
  },
};

export function drawBrandIcon(ctx: CanvasRenderingContext2D, icon: BrandIcon, x: number, y: number, size: number, fg: string, bg: string): void {
  const art = BRAND_ART[icon];
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.fillStyle = fg;
  for (const d of art.fill) ctx.fill(new Path2D(d));
  ctx.lineCap = 'round';
  ctx.lineWidth = 2;
  ctx.strokeStyle = fg;
  for (const d of art.line ?? []) ctx.stroke(new Path2D(d));
  ctx.strokeStyle = bg;
  ctx.lineWidth = 1.6;
  for (const d of art.cut ?? []) ctx.stroke(new Path2D(d));
  ctx.restore();
}
