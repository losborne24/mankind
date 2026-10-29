import type { Evidence, HistoricalPeriod, HistoricalSource, HistoricalWorldData } from '@/lib/history/schema';
import type { HistoricalTime } from '@/lib/scenarios/schema';
import type { HistoricalSelection, HistoricalPlaceSelection } from '@/lib/history/selection';
import { matchHistoricalTime } from '@/lib/history/time';

export type HistoricalInspectionKey = { kind: 'place' | 'event'; id: string };
export interface HistoricalVisitTarget {
  placeId: string;
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}
export interface HistoricalInspection {
  key: HistoricalInspectionKey;
  title: string;
  description?: string;
  time: HistoricalTime;
  period?: HistoricalPeriod;
  match: 'within' | 'possible' | 'outside' | 'undated';
  basis?: HistoricalPlaceSelection['basis'];
  evidence: { label: string; value: Evidence }[];
  sources: HistoricalSource[];
  locations: {
    placeId: string;
    title: string;
    role: string;
    coordinate: [number, number];
    uncertaintyMeters?: number;
    layoutStatus: HistoricalPlaceSelection['layoutStatus'];
    layouts: { title: string; period: HistoricalPeriod }[];
    warnings: string[];
    target?: HistoricalVisitTarget;
    unavailableReason?: string;
  }[];
}
/** A read-only view. Inspecting never selects a date, moves a camera or resolves new assets. */
export function inspectHistoricalRecord(world: HistoricalWorldData, selection: HistoricalSelection, key: HistoricalInspectionKey): HistoricalInspection | undefined {
  const place = key.kind === 'place' ? world.places.find(p => p.id === key.id) : undefined;
  const event = key.kind === 'event' ? world.events.find(e => e.id === key.id) : undefined;
  if (!place && !event) return;
  const row = place ? selection.places.find(p => p.place.id === place.id) : undefined;
  const match = event ? matchHistoricalTime(event.period, selection.time) : row?.presence ?? 'undated';
  const evidence: HistoricalInspection['evidence'] = [{ label: event ? 'Event evidence' : 'Place evidence', value: (event ?? place)!.evidence }];
  const refs = event?.locations ?? [{ placeId: place!.id, role: 'Selected place' }];
  const locations = refs.map(ref => {
    const selected = selection.places.find(p => p.place.id === ref.placeId)!;
    const p = selected.place;
    evidence.push({ label: `Position · ${p.title}`, value: p.position.evidence });
    const eligible = ['within', 'possible'].includes(match) && ['within', 'possible'].includes(selected.presence);
    const supported = Math.abs(p.position.coordinate[1]) <= 85;
    const detailed = selected.layoutStatus === 'ready';
    const layouts = selected.layoutIds.map(id => world.layouts.find(layout => layout.id === id)!);
    for (const layout of layouts) evidence.push({ label: `Layout · ${layout.title}`, value: layout.evidence });
    const warnings = selected.warnings.flatMap(warning => {
      if (warning.includes('pedestrian navigation')) return [];
      if (warning.startsWith('Unresolved historical asset') || warning.startsWith('Asset category mismatch')) return ['A required building model is unavailable.'];
      if (warning.includes('orthogonal')) return ['The supplied road layout cannot currently be displayed.'];
      if (warning.includes('renderer boundary') || warning.includes('assembly budget')) return ['This layout exceeds the available display capacity.'];
      return [warning];
    });
    return {
      placeId: p.id, title: p.title, role: ref.role, coordinate: [...p.position.coordinate] as [number, number],
      ...(p.position.uncertaintyMeters !== undefined ? { uncertaintyMeters: p.position.uncertaintyMeters } : {}),
      layoutStatus: selected.layoutStatus,
      layouts: layouts.map(layout => ({ title: layout.title, period: layout.period })),
      warnings: [...new Set(warnings)],
      ...(eligible && supported ? { target: { placeId: p.id, center: [...p.position.coordinate] as [number, number], zoom: detailed ? 18.4 : p.kind === 'region' ? 11 : 14, pitch: detailed ? 55 : 35, bearing: detailed ? -25 : 0 } } : { unavailableReason: supported ? 'This record is not dated for the current selection.' : 'This location is outside the current map navigation range.' }),
    };
  });
  const sourceIds = new Set(evidence.flatMap(group => group.value.sources));
  return structuredClone({ key, title: (event ?? place)!.title, ...(event ? { description: event.description } : {}),
    time: selection.time, ...((event?.period ?? place?.period) ? { period: event?.period ?? place?.period } : {}),
    match, ...(row ? { basis: row.basis } : {}), evidence, sources: world.sources.filter(source => sourceIds.has(source.id)), locations });
}
