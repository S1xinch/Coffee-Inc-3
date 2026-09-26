import { z } from 'zod';
import { dollars } from './money';

// Coffee-growing regions ship as versioned data bundles checked against this schema.
// Coffee Inc 2 crashed on some devices when visiting a new plantation region; here a region
// that is missing, damaged, or from a newer version always falls back to a safe default,
// so nothing that shows a region can fail.
const hex = z.string().regex(/^#[0-9a-f]{6}$/i);

export const RegionSchema = z.object({
  id: z.string().min(1),
  version: z.literal(1),
  name: z.string().min(1),
  country: z.string().min(1),
  blurb: z.string(),
  plotPrice: z.number().int().positive(),
  weeklyCostPerPlot: z.number().int().positive(),
  yieldKgPerPlot: z.number().positive(),
  quality: z.number().min(0).max(1),
  weatherRisk: z.number().min(0).max(0.5),
  palette: z.object({ sky: hex, hill: hex, leaf: hex, cherry: hex, soil: hex }),
});
export type Region = z.infer<typeof RegionSchema>;

const RAW_REGIONS: unknown[] = [
  {
    id: 'brazil', version: 1, name: 'Minas Gerais', country: 'Brazil',
    blurb: 'Rolling hills and big harvests. Smooth, nutty, dependable beans.',
    plotPrice: dollars(16_000), weeklyCostPerPlot: dollars(160), yieldKgPerPlot: 40, quality: 0.7, weatherRisk: 0.15,
    palette: { sky: '#bfe3f2', hill: '#7fb069', leaf: '#3f7d3a', cherry: '#c0392b', soil: '#a0522d' },
  },
  {
    id: 'colombia', version: 1, name: 'Huila', country: 'Colombia',
    blurb: 'Steep Andean slopes with bright, balanced coffee.',
    plotPrice: dollars(22_000), weeklyCostPerPlot: dollars(190), yieldKgPerPlot: 32, quality: 0.82, weatherRisk: 0.12,
    palette: { sky: '#c9e8f5', hill: '#5f9e57', leaf: '#2f6b33', cherry: '#b83227', soil: '#7a4a2a' },
  },
  {
    id: 'ethiopia', version: 1, name: 'Yirgacheffe', country: 'Ethiopia',
    blurb: 'The birthplace of coffee. Small yields, floral beans prized by experts.',
    plotPrice: dollars(20_000), weeklyCostPerPlot: dollars(150), yieldKgPerPlot: 24, quality: 0.95, weatherRisk: 0.2,
    palette: { sky: '#f3dfb2', hill: '#9bb05a', leaf: '#4c7a2f', cherry: '#a93226', soil: '#8b5a2b' },
  },
  {
    id: 'kenya', version: 1, name: 'Nyeri', country: 'Kenya',
    blurb: 'Red volcanic soil and bold, juicy coffee.',
    plotPrice: dollars(24_000), weeklyCostPerPlot: dollars(200), yieldKgPerPlot: 26, quality: 0.92, weatherRisk: 0.18,
    palette: { sky: '#d6ecf3', hill: '#86a85a', leaf: '#3d6e2c', cherry: '#c0392b', soil: '#9c3f1f' },
  },
  {
    id: 'guatemala', version: 1, name: 'Antigua', country: 'Guatemala',
    blurb: 'Coffee grown between volcanoes. Chocolatey and full-bodied.',
    plotPrice: dollars(21_000), weeklyCostPerPlot: dollars(180), yieldKgPerPlot: 28, quality: 0.86, weatherRisk: 0.14,
    palette: { sky: '#cde4f0', hill: '#6f9a55', leaf: '#35652f', cherry: '#b03a2e', soil: '#5e4a3a' },
  },
  {
    id: 'vietnam', version: 1, name: 'Central Highlands', country: 'Vietnam',
    blurb: 'Huge volumes at low cost. Strong beans that are fine for milk drinks.',
    plotPrice: dollars(12_000), weeklyCostPerPlot: dollars(120), yieldKgPerPlot: 48, quality: 0.62, weatherRisk: 0.16,
    palette: { sky: '#d2eef0', hill: '#8cc063', leaf: '#46883a', cherry: '#c44536', soil: '#8a5a3c' },
  },
  {
    id: 'indonesia', version: 1, name: 'Sumatra', country: 'Indonesia',
    blurb: 'Rainforest farms and earthy, heavy coffee. Rainy seasons are risky.',
    plotPrice: dollars(17_000), weeklyCostPerPlot: dollars(160), yieldKgPerPlot: 30, quality: 0.8, weatherRisk: 0.22,
    palette: { sky: '#c3dfe0', hill: '#4f8f4a', leaf: '#2a5d2e', cherry: '#a83232', soil: '#4d3b2c' },
  },
];

// Used when a region can't be loaded. Plain but always valid.
export const FALLBACK_REGION: Region = {
  id: 'unknown',
  version: 1,
  name: 'Unknown region',
  country: 'Unknown',
  blurb: 'This region could not be loaded. Its farm keeps working with average numbers.',
  plotPrice: dollars(18_000),
  weeklyCostPerPlot: dollars(170),
  yieldKgPerPlot: 30,
  quality: 0.75,
  weatherRisk: 0.15,
  palette: { sky: '#d0dde3', hill: '#8aa37a', leaf: '#4f7045', cherry: '#a0443a', soil: '#6b5444' },
};

export function loadRegions(raw: readonly unknown[]): { regions: Region[]; rejected: string[] } {
  const regions: Region[] = [];
  const rejected: string[] = [];
  for (const r of raw) {
    const parsed = RegionSchema.safeParse(r);
    if (parsed.success && !regions.some((x) => x.id === parsed.data.id)) regions.push(parsed.data);
    else rejected.push(typeof r === 'object' && r && 'id' in r ? String((r as { id: unknown }).id) : '(no id)');
  }
  return { regions, rejected };
}

export const REGIONS: readonly Region[] = loadRegions(RAW_REGIONS).regions;

// Never throws: unknown ids get the fallback region.
export const regionById = (id: string, list: readonly Region[] = REGIONS): Region => list.find((r) => r.id === id) ?? { ...FALLBACK_REGION, id };
