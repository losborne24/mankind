import { resolveHistoricalAsset } from '@/lib/history/assetResolution';
import { validateScenario, type ScenarioDefinition, type HistoricalDate, type HistoricalTime, type Certainty } from '@/lib/scenarios/schema';
import type { SettlementDefinition } from '@/map/settlements/romanSettlement';
import type { SettlementDescriptor } from '@/map/settlements/settlementStreaming';
import type { Evidence, HistoricalPeriod } from '@/lib/history/schema';
import { validateHistoricalWorld } from '@/lib/history/validate';
import { matchHistoricalPeriod, periodBounds, toHistoricalTime } from '@/lib/history/time';

const certainty = (e: Evidence): Certainty => e.certainty === 'documented' ? 'established' : e.certainty === 'unknown' ? 'unverified' : 'illustrative';
const renderCoordinate = (coordinate: [number, number]): [number, number] => {
  if (Math.abs(coordinate[1]) > 85) throw Error('Current renderer supports latitude −85…85 only');
  return [...coordinate];
};
export function toScenarioContent(value: unknown): { content: ScenarioDefinition['content']; warnings: string[] } {
  const world = validateHistoricalWorld(value), warnings: string[] = [];
  if (world.scenes.length) warnings.push('Scene requirements are descriptive; the current player has no historical scene resolver.');
  if (world.places.some(p => p.position.evidence.certainty !== 'documented')) warnings.push('Some location coordinates are illustrative or uncertain; event evidence does not establish survey accuracy.');
  const content: ScenarioDefinition['content'] = {
    sources: world.sources.map(({ id, title, url }) => ({ id, title, url })),
    locations: world.places.map(p => ({ id: p.id, title: p.title, coordinate: renderCoordinate(p.position.coordinate), certainty: certainty(p.position.evidence), sources: p.position.evidence.sources })),
    routes: world.routes.map(r => ({ id: r.id, coordinates: r.coordinates.map(renderCoordinate), certainty: certainty(r.evidence), sources: r.evidence.sources, ...(!r.period.uncertaintyYears && !r.period.approximate ? { time: toHistoricalTime(r.period) } : {}) })),
    scenes: world.scenes.map(s => ({ id: s.id, description: s.description, certainty: certainty(s.evidence), sources: s.evidence.sources, required: s.required })),
    overlays: [
      ...world.events.flatMap(event => [
        { id: `event:${event.id}`, type: 'card' as const, title: event.title, text: event.description, sources: event.evidence.sources },
        ...event.locations.map((location, i) => ({ id: `event:${event.id}:location:${i}`, type: 'point' as const, location: location.placeId })),
      ]),
      ...world.routes.map(route => ({ id: `route:${route.id}`, type: 'route' as const, route: route.id })),
    ],
  };
  if (world.routes.some(r => r.period.uncertaintyYears || r.period.approximate)) warnings.push('Uncertain route periods remain in the historical record; no exact route time was inferred.');
  return { content, warnings };
}
/** Direction is supplied separately and goes through the same validator as developer scenarios. */
export function bindHistoricalScenario(value: unknown, direction: Omit<ScenarioDefinition, 'content'>): { scenario: ScenarioDefinition; warnings: string[] } {
  const world = validateHistoricalWorld(value), projection = toScenarioContent(world);
  const scenario = validateScenario({ ...direction, content: projection.content });
  const overlaps = (a: HistoricalPeriod, b: HistoricalPeriod) => {
    const [a0, a1] = periodBounds(a), [b0, b1] = periodBounds(b);
    const u = ((a.uncertaintyYears ?? 0) + (b.uncertaintyYears ?? 0)) * 372;
    return a1 + u >= b0 && b1 + u >= a0;
  };
  let time = scenario.scope.time;
  for (const beat of scenario.beats) {
    const scenes = (beat.sceneRequirements ?? []).map(id => world.scenes.find(s => s.id === id)!);
    if (scenes.some(s => s.fallback === 'unavailable')) throw Error('Scene requires a resolver unavailable in the current player');
    for (const action of beat.actions) {
      time = action.time ?? time;
      if (!overlaps(time, scenario.scope.time)) throw Error('Action date outside scenario scope');
      const selectedEvents = world.events.filter(e => action.overlays.some(id => id === `event:${e.id}` || id.startsWith(`event:${e.id}:location:`)));
      const selectedRoutes = world.routes.filter(r => action.overlays.includes(`route:${r.id}`) || (action.camera.type === 'followRoute' && action.camera.route === r.id));
      if ([...selectedEvents, ...selectedRoutes, ...scenes].some(entity => !overlaps(entity.period, time))) throw Error('Historical content outside action date');
      if ([...selectedEvents, ...selectedRoutes, ...scenes].some(entity => entity.period.uncertaintyYears || entity.period.approximate)) projection.warnings.push(`Beat ${beat.id} uses an uncertain historical period; direction supplies the presentation date.`);
    }
  }
  return { scenario, warnings: [...new Set(projection.warnings)] };
}
export interface SettlementResolution {
  status: 'ready' | 'outside-period' | 'uncertain-period' | 'unavailable';
  definition?: SettlementDefinition;
  descriptor?: SettlementDescriptor;
  warnings: string[];
}
/** All-or-nothing geometry resolution: never substitute Roman buildings for absent historical assets. */
export function resolveHistoricalSettlement(value: unknown, layoutId: string, at: HistoricalDate): SettlementResolution {
  return resolveValidatedSettlement(validateHistoricalWorld(value), layoutId, at);
}
/** Internal projection for an already validated session snapshot; avoids revalidating per place/date. */
export function resolveValidatedSettlement(world: import('@/lib/history/schema').HistoricalWorldData, layoutId: string, at: HistoricalDate, selectedTime?: HistoricalTime): SettlementResolution {
  const layout = world.layouts.find(l => l.id === layoutId);
  if (!layout) throw Error(`Unknown historical layout ${layoutId}`);
  const place = world.places.find(p => p.id === layout.placeId)!;
  const network = world.roadNetworks.find(n => n.id === layout.roadNetworkId);
  const periods = [layout.period, ...(place.period ? [place.period] : []), ...(network ? [network.period] : [])];
  const matches = periods.map(period => matchHistoricalPeriod(period, at));
  if (matches.includes('outside')) return { status: 'outside-period', warnings: ['Layout, place or roads are outside the selected date.'] };
  if (matches.includes('possible')) return { status: 'uncertain-period', warnings: ['Date or record is too imprecise to choose this layout automatically.'] };
  const warnings: string[] = [];
  if (layout.extentMeters > 1000 || Math.abs(place.position.coordinate[1]) > 85) warnings.push('Layout exceeds the current compact-scene renderer boundary.');
  if (layout.buildings.length > 100 || (network?.roads.reduce((count, road) => count + road.points.length - 1, 0) ?? 0) > 256) warnings.push('Layout exceeds the current scene assembly budget.');
  if (network?.roads.some(road => road.points.some((point, i) => i > 0 && point[0] !== road.points[i - 1][0] && point[1] !== road.points[i - 1][1]))) warnings.push('Current terrain road assembler requires orthogonal segments; historical geometry was not regenerated.');
  if (!layout.buildings.length) warnings.push('Building positions and reconstruction geometry have not been supplied.');
  const buildings: SettlementDefinition['buildings'][number][] = [];
  for (const building of layout.buildings) {
    const reference = world.assets.find(asset => asset.id === building.assetId)!;
    const binding = resolveHistoricalAsset(reference, place.id, selectedTime ?? { start: at });
    if (binding.status === 'catalogue-blocked') { warnings.push(binding.reason!); continue; }
    if (binding.status === 'unresolved') { warnings.push(`Unresolved historical asset ${reference.id}; no substitute selected.`); continue; }
    if (binding.status === 'category-mismatch') { warnings.push(`Asset category mismatch for ${reference.id}.`); continue; }
    const assetId = binding.registryId!;
    buildings.push({ id: building.id, assetId, offset: [...building.offset], ...(building.headingRadians !== undefined ? { headingRadians: building.headingRadians } : {}) });
  }
  if (warnings.length) return { status: 'unavailable', warnings };
  const definition: SettlementDefinition = {
    id: layout.id, origin: renderCoordinate(place.position.coordinate), groundSizeMeters: layout.extentMeters,
    maxFoundationRiseMeters: layout.maxFoundationRiseMeters, buildings, ambientLife: false,
    roads: network?.roads.map(road => ({ id: road.id, widthMeters: road.widthMeters, points: road.points.map(p => [...p] as [number, number]), ...(road.accessTo ? { accessTo: road.accessTo } : {}) })) ?? [],
  };
  // The descriptor carries an explicit definition: no procedural profile, seed or generation fallback.
  const descriptor: SettlementDescriptor = { id: layout.id, origin: definition.origin,
    radiusMeters: Math.max(place.radiusMeters, layout.extentMeters / Math.SQRT2), definition,
    visual: { label: place.title }, validYears: { from: layout.period.start.year, to: (layout.period.end ?? layout.period.start).year } };
  return { status: 'ready', definition, descriptor, warnings: ['Arbitrary road geometry is preserved; general historical pedestrian navigation is not yet resolved.'] };
}
