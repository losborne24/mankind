import zoning from '@/lib/scenarios/fixtures/rome-ad100-zoning.json';
import { matchContext, type ContextFeature } from '@/lib/scenarios/contextLayers';
import type { ContextCertainty, HistoricalTime } from '@/lib/scenarios/schema';

/** Land use in the AD 100 zoning (scripts/context/rome/build-zoning.mjs). Zones of one date never overlap; housing is what the others leave. */
export type ZoneUse = 'residential' | 'monumental' | 'necropolis' | 'horti' | 'port' | 'open' | 'open-river' | 'suburban' | 'campagna';
export type HousingClass = 'dense' | 'mixed' | 'elite' | 'roadside';
interface Dated { id: string; title: string; certainty: ContextCertainty; time: HistoricalTime; note: string; sources: string[] }
export interface Zone extends Dated {
  use: ZoneUse;
  /** Suburbium only: 1 nearest the city and the roads to 3 farthest, fading towards the Campagna. */
  band?: number;
  /** Where the zone lies: the continuous city, the suburbium round it, the Campagna beyond, or the rivers that cross all three. */
  ring: 'city' | 'suburbium' | 'campagna' | 'river';
  /** For features dated after the scene: what the start date means (e.g. a construction start), shown where they are listed as not shown. */
  dateNote?: string;
  /** Residential zones only: dense blocks, mixed hill housing, low-density elite houses, or ribbons along the roads. */
  housing?: HousingClass;
  short: string;
  /** Relative housing density for the fill (1 = the east-bank core). Residential zones only. */
  density?: number;
  area: number;
  label: [number, number];
  multipolygon: [number, number][][][];
}
export interface ZoneMarker extends Dated { kind: 'region' | 'anchor'; coordinate: [number, number] }
/** A consular road or an aqueduct: one or more polylines. */
export interface ZoneLine extends Dated {
  kind: 'road' | 'aqueduct';
  lines: [number, number][][];
  /** Where the sourced street breaks off and resumes: the road is taken to run on, a guess drawn dashed. */
  gaps?: [number, number][][];
}
export const romeZoning = zoning as unknown as {
  title: string;
  extent: Dated & { area: number; ring: [number, number][] };
  frame: [number, number][];
  lines: ZoneLine[];
  sources: { id: string; title: string; url: string; licence: string }[];
  zones: Zone[];
  markers: ZoneMarker[];
};

export const zoneUseLabel: Record<ZoneUse, string> = { residential: 'Housing', monumental: 'Monumental and public', necropolis: 'Tombs', horti: 'Horti (estate gardens)', port: 'Port and warehouses', open: 'Open ground', 'open-river': 'River', suburban: 'Suburbium', campagna: 'Campagna' };
export const zoneColour: Record<ZoneUse, string> = { residential: '#c46a4a', monumental: '#f4ecd6', necropolis: '#a99bbd', horti: '#b5e07a', port: '#b08a4e', open: '#d8c76a', 'open-river': '#5f8ea3', suburban: '#8fae68', campagna: '#c9bd8c' };
export const lineColour: Record<ZoneLine['kind'], string> = { road: '#e8d3a2', aqueduct: '#b7c7d6' };
const housingColour: Record<HousingClass, string> = { dense: '#c46a4a', mixed: '#d98d66', elite: '#ebb596', roadside: '#9a5a40' };
const mix = (a: string, b: string, t: number) => '#' + [0, 2, 4].map(i => Math.round(parseInt(a.slice(1 + i, 3 + i), 16) * (1 - t) + parseInt(b.slice(1 + i, 3 + i), 16) * t).toString(16).padStart(2, '0')).join('');
export const colourOf = (z: Pick<Zone, 'housing' | 'use' | 'band'>) => z.housing ? housingColour[z.housing] : z.use === 'suburban' && z.band ? mix(zoneColour.suburban, zoneColour.campagna, [0, 0, .4, .75][z.band]) : zoneColour[z.use];

/** The zones, the extent and the markers as inspectable map layers, with their date match. Pure. */
export function zoningFeatures(at: HistoricalTime): ContextFeature[] {
  const cite = (ids: string[]) => ids.flatMap(id => romeZoning.sources.filter(s => s.id === id));
  const feature = (d: Dated, title: string, kind: ContextFeature['kind'], basis: ContextFeature['basis'], short?: string): ContextFeature => ({
    id: d.id, title, short, kind, overlayId: 'zoning', certainty: d.certainty, basis, style: 'extent', time: d.time, note: d.note, sources: cite(d.sources),
    match: matchContext({ certainty: d.certainty, basis, style: 'extent', time: d.time, note: d.note }, at) });
  const { extent } = romeZoning;
  return [
    feature(extent, extent.title, 'line', 'schematic'),
    ...romeZoning.lines.map(l => feature(l, l.kind === 'road' ? `Road · ${l.title}` : `Aqueduct · ${l.title}`, 'line', l.certainty === 'illustrative' ? 'schematic' : 'modern-geometry')),
    ...romeZoning.zones.map(z => feature(z, `${zoneUseLabel[z.use]} · ${z.title}`, 'polygon', z.use === 'open-river' ? 'modern-geometry' : 'schematic', z.short)),
    ...romeZoning.markers.map(m => feature(m, m.title, 'marker', 'point-only')),
  ];
}
