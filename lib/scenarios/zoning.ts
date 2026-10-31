import zoning from '@/lib/scenarios/fixtures/rome-ad100-zoning.json';
import { matchContext, type ContextFeature } from '@/lib/scenarios/contextLayers';
import type { ContextCertainty, HistoricalTime } from '@/lib/scenarios/schema';

/** Land use in the AD 100 zoning (scripts/context/rome/build-zoning.mjs). Zones of one date never overlap; housing is what the others leave. */
export type ZoneUse = 'residential' | 'monumental' | 'horti' | 'port' | 'open' | 'open-river';
export type HousingClass = 'dense' | 'elite' | 'roadside';
interface Dated { id: string; title: string; certainty: ContextCertainty; time: HistoricalTime; note: string; sources: string[] }
export interface Zone extends Dated {
  use: ZoneUse;
  /** Residential zones only: dense blocks, low-density elite houses, or ribbons along the roads. */
  housing?: HousingClass;
  short: string;
  /** Relative housing density for the fill (1 = the east-bank core). Residential zones only. */
  density?: number;
  area: number;
  label: [number, number];
  multipolygon: [number, number][][][];
}
export interface ZoneMarker extends Dated { kind: 'region' | 'anchor'; coordinate: [number, number] }
export const romeZoning = zoning as unknown as {
  title: string;
  extent: Dated & { area: number; ring: [number, number][] };
  roads: Record<string, [number, number][]>;
  sources: { id: string; title: string; url: string; licence: string }[];
  zones: Zone[];
  markers: ZoneMarker[];
};

export const zoneUseLabel: Record<ZoneUse, string> = { residential: 'Housing', monumental: 'Monumental and public', horti: 'Horti (estate gardens)', port: 'Port and warehouses', open: 'Open ground', 'open-river': 'River' };
export const zoneColour: Record<ZoneUse, string> = { residential: '#c46a4a', monumental: '#f4ecd6', horti: '#b5e07a', port: '#b08a4e', open: '#d8c76a', 'open-river': '#5f8ea3' };
const housingColour: Record<HousingClass, string> = { dense: '#c46a4a', elite: '#e8ac8a', roadside: '#9a5a40' };
export const colourOf = (z: Zone) => z.housing ? housingColour[z.housing] : zoneColour[z.use];

/** The zones, the extent and the markers as inspectable map layers, with their date match. Pure. */
export function zoningFeatures(at: HistoricalTime): ContextFeature[] {
  const cite = (ids: string[]) => ids.flatMap(id => romeZoning.sources.filter(s => s.id === id));
  const feature = (d: Dated, title: string, kind: ContextFeature['kind'], basis: ContextFeature['basis'], short?: string): ContextFeature => ({
    id: d.id, title, short, kind, overlayId: 'zoning', certainty: d.certainty, basis, style: 'extent', time: d.time, note: d.note, sources: cite(d.sources),
    match: matchContext({ certainty: d.certainty, basis, style: 'extent', time: d.time, note: d.note }, at) });
  const { extent } = romeZoning;
  return [
    feature(extent, extent.title, 'line', 'schematic'),
    ...romeZoning.zones.map(z => feature(z, `${zoneUseLabel[z.use]} · ${z.title}`, 'polygon', z.use === 'open-river' ? 'modern-geometry' : 'schematic', z.short)),
    ...romeZoning.markers.map(m => feature(m, m.title, 'marker', 'point-only')),
  ];
}
