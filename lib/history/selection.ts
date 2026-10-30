import type { HistoricalWorldData, HistoricalPlace, HistoricalEvent, HistoricalRoute, HistoricalPeriod, HistoricalReferenceArea, HistoricalFootprint } from '@/lib/history/schema';
import type { HistoricalTime } from '@/lib/scenarios/schema';
import type { SettlementDescriptor } from '@/map/settlements/settlementStreaming';
import { matchHistoricalTime, periodBounds } from '@/lib/history/time';
import { resolveValidatedSettlement } from '@/lib/history/adapters';
import { resolveSceneRequirements, type HistoricalSceneResolution } from '@/lib/history/sceneRequirements';
import { validateHistoricalWorld } from '@/lib/history/validate';

type Match = 'within' | 'possible' | 'outside';
export interface HistoricalPlaceSelection {
  place: HistoricalPlace;
  presence: Match | 'undated';
  basis: 'place-period' | 'dated-context' | 'unknown';
  layoutIds: string[];
  layoutStatus: 'ready' | 'none' | 'ambiguous' | 'unavailable' | 'outside';
  warnings: string[];
}
export interface HistoricalSelection {
  time: HistoricalTime;
  places: HistoricalPlaceSelection[];
  events: { event: HistoricalEvent; match: Exclude<Match, 'outside'> }[];
  routes: { route: HistoricalRoute; match: Exclude<Match, 'outside'> }[];
  descriptors: SettlementDescriptor[];
  referenceAreas?: HistoricalReferenceArea[];
  footprints?: { footprint: HistoricalFootprint; match: Exclude<Match, 'outside'> }[];
  scenes?: HistoricalSceneResolution[];
}
/** Input must be a validated dataset. No camera/date mutations or asset requests. */
export function selectHistoricalWorld(world: HistoricalWorldData, time: HistoricalTime): HistoricalSelection {
  periodBounds(time);
  const match = (period: HistoricalPeriod) => matchHistoricalTime(period, time);
  const events: HistoricalSelection['events'] = [], routes: HistoricalSelection['routes'] = [];
  for (const event of world.events) { const m = match(event.period); if (m !== 'outside') events.push({ event, match: m }); }
  for (const route of world.routes) { const m = match(route.period); if (m !== 'outside') routes.push({ route, match: m }); }
  const descriptors: SettlementDescriptor[] = [];
  const places = world.places.map(place => {
    const contexts = [
      ...world.events.filter(e => e.locations.some(l => l.placeId === place.id)),
      ...world.routes.filter(r => r.placeIds.includes(place.id)),
      ...world.layouts.filter(l => l.placeId === place.id),
      ...world.scenes.filter(s => s.placeId === place.id),
      ...(world.footprints ?? []).filter(f => f.placeId === place.id),
    ].map(entity => match(entity.period));
    const presence = place.period ? match(place.period) : contexts.includes('within') ? 'within' : contexts.includes('possible') ? 'possible' : contexts.length ? 'outside' : 'undated';
    const row: HistoricalPlaceSelection = { place, presence, basis: place.period ? 'place-period' : contexts.length ? 'dated-context' : 'unknown', layoutIds: [], layoutStatus: 'none', warnings: [] };
    if (presence === 'outside' || presence === 'undated') { row.layoutStatus = presence === 'outside' ? 'outside' : 'none'; return row; }
    const candidates = world.layouts.filter(layout => layout.placeId === place.id && match(layout.period) !== 'outside');
    row.layoutIds = candidates.map(l => l.id);
    if (!candidates.length) {
      row.warnings.push((world.footprints ?? []).some(f => f.placeId === place.id && match(f.period) !== 'outside') ? '2D footprint context only; no reconstructed building layout supplied.' : 'Geographic context only; no dated layout supplied.');
      return row;
    }
    const candidate = candidates[0];
    const network = world.roadNetworks.find(n => n.id === candidate.roadNetworkId);
    if (network && match(network.period) === 'outside') {
      row.layoutStatus = 'unavailable'; row.warnings.push('The layout road network is outside the selected date.'); return row;
    }
    if (presence !== 'within' || candidates.length !== 1 || match(candidate.period) !== 'within' || (network && match(network.period) !== 'within')) {
      row.layoutStatus = 'ambiguous'; row.warnings.push('Date precision or overlapping layouts prevent automatic selection.');
      if (candidates.some(layout => !layout.buildings.length)) row.warnings.push('Candidate phase records contain no building positions or reconstructed geometry.');
      return row;
    }
    const result = resolveValidatedSettlement(world, candidate.id, time.start);
    row.warnings = result.warnings;
    row.layoutStatus = result.status === 'ready' ? 'ready' : result.status === 'uncertain-period' ? 'ambiguous' : 'unavailable';
    if (result.descriptor) descriptors.push(result.descriptor);
    return row;
  });
  const visible = new Set(places.filter(row => ['within', 'possible'].includes(row.presence)).map(row => row.place.id));
  const footprints: NonNullable<HistoricalSelection['footprints']> = [];
  for (const footprint of world.footprints ?? []) {
    const m = match(footprint.period);
    if (m !== 'outside' && visible.has(footprint.placeId)) footprints.push({ footprint, match: m });
  }
  const scenes = resolveSceneRequirements(world, time, places, descriptors, footprints);
  const allowed = descriptors.filter(descriptor => {
    const placeId = world.layouts.find(layout => layout.id === descriptor.id)!.placeId;
    const active = scenes.filter(scene => scene.scene.placeId === placeId && scene.status !== 'outside-period' && (scene.scene.required || scene.scene.layoutIds.includes(descriptor.id)));
    return !active.length || active.some(scene => scene.status === 'ready' && scene.descriptorIds.includes(descriptor.id));
  });
  for (const row of places) if (row.layoutStatus === 'ready' && !allowed.some(d => row.layoutIds.includes(d.id))) {
    row.layoutStatus = 'unavailable'; row.warnings.push('Scene requirements are not satisfied; geographic context only.');
  }
  return { time: structuredClone(time), places, events, routes, descriptors: allowed, scenes, footprints, referenceAreas: (world.referenceAreas ?? []).filter(area => visible.has(area.placeId)) };
}
/** Validating public entry point for requirement planning without applying a scene. */
export function resolveHistoricalScenes(value: unknown, time: HistoricalTime): HistoricalSceneResolution[] {
  return selectHistoricalWorld(validateHistoricalWorld(value), time).scenes!;
}
