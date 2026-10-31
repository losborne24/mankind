import zoning from '@/lib/scenarios/fixtures/rome-ad100-zoning.json';
import { matchContext, type ContextFeature } from '@/lib/scenarios/contextLayers';
import type { ContextCertainty, HistoricalTime } from '@/lib/scenarios/schema';

/** Land use in the AD 100 zoning (scripts/context/rome/build-zoning.mjs). Zones never overlap; housing is what the others leave. */
export type ZoneUse = 'residential' | 'monumental' | 'horti' | 'port' | 'open' | 'open-river';
export interface Zone {
  id: string;
  use: ZoneUse;
  title: string;
  short: string;
  certainty: ContextCertainty;
  time: HistoricalTime;
  note: string;
  sources: string[];
  /** Relative housing density for the fill (1 = the east-bank core). Residential zones only. */
  density?: number;
  area: number;
  label: [number, number];
  multipolygon: [number, number][][][];
}
export const romeZoning = zoning as unknown as { title: string; extent: { title: string; note: string; sources: string[]; area: number; ring: [number, number][] }; sources: { id: string; title: string; url: string; licence: string }[]; zones: Zone[] };

export const zoneUseLabel: Record<ZoneUse, string> = { residential: 'Dense housing', monumental: 'Monumental and public', horti: 'Horti (estate gardens)', port: 'Port and warehouses', open: 'Open ground', 'open-river': 'River' };
export const zoneColour: Record<ZoneUse, string> = { residential: '#c46a4a', monumental: '#f4ecd6', horti: '#b5e07a', port: '#b08a4e', open: '#d8c76a', 'open-river': '#5f8ea3' };

/** The zones as inspectable map layers, with their date match. Pure. */
export function zoningFeatures(at: HistoricalTime): ContextFeature[] {
  const cite = (ids: string[]) => ids.flatMap(id => romeZoning.sources.filter(s => s.id === id));
  return romeZoning.zones.map(z => ({
    id: z.id, title: `${zoneUseLabel[z.use]} · ${z.title}`, short: z.short, kind: 'polygon', overlayId: 'zoning', certainty: z.certainty,
    basis: z.use === 'open-river' ? 'modern-geometry' : 'schematic', style: 'extent', time: z.time, note: z.note, sources: cite(z.sources),
    match: matchContext({ certainty: z.certainty, basis: 'schematic', style: 'extent', time: z.time, note: z.note }, at),
  }));
}
