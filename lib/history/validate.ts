import type { HistoricalWorldData, HistoricalPeriod } from '@/lib/history/schema';
import { periodBounds, validateHistoricalDate } from '@/lib/history/time';

type RecordValue = Record<string, unknown>;
const object = (value: unknown, keys: string[]): RecordValue => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Expected record');
  if (Object.keys(value).some(key => !keys.includes(key))) throw Error('Unknown historical record field');
  return value as RecordValue;
};
const list = (value: unknown): unknown[] => {
  if (!Array.isArray(value) || value.length > 10000) throw Error('Expected bounded array');
  return value;
};
const text = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > 16000) throw Error('Expected nonempty text');
  return value;
};
const number = (value: unknown, min: number, max: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw Error('Historical number outside bounds');
  return value;
};
const oneOf = (value: unknown, options: string[]) => { if (!options.includes(text(value))) throw Error('Unknown historical enum value'); };
const url = (value: unknown) => {
  const parsed = new URL(text(value));
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw Error('Expected public HTTP source URL');
};
const coordinate = (value: unknown, geographic = true) => {
  const pair = list(value);
  if (pair.length !== 2) throw Error('Expected two coordinate values');
  number(pair[0], geographic ? -180 : -10000, geographic ? 180 : 10000);
  number(pair[1], geographic ? -90 : -10000, geographic ? 90 : 10000);
};
const period = (value: unknown) => {
  const p = object(value, ['start', 'end', 'uncertaintyYears']);
  validateHistoricalDate(p.start);
  if (p.end !== undefined) validateHistoricalDate(p.end);
  if (p.uncertaintyYears !== undefined) number(p.uncertaintyYears, 0, 1000);
  periodBounds(p as unknown as HistoricalPeriod);
};
/** Validate before data can reach adapters. Returns a detached, plain JSON snapshot. */
export function validateHistoricalWorld(value: unknown): HistoricalWorldData {
  let nodes = 0;
  const ancestors = new Set<object>();
  const json = (v: unknown, depth = 0): void => {
    if (++nodes > 100000 || depth > 32) throw Error('Historical JSON complexity limit');
    if (v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) return;
    if (typeof v === 'string') { if (v.length > 16000) throw Error('Historical text limit'); return; }
    if (!v || typeof v !== 'object' || (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype)) throw Error('Expected plain historical JSON');
    if (ancestors.has(v)) throw Error('Cyclic historical JSON');
    if (Object.getOwnPropertySymbols(v).length) throw Error('Symbol keys are not JSON');
    if (Array.isArray(v) && (v.length > 10000 || Object.keys(v).length !== v.length)) throw Error('Expected dense bounded JSON array');
    ancestors.add(v);
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(v))) {
      if (Array.isArray(v) && key === 'length') continue;
      if (!descriptor.enumerable || !('value' in descriptor)) throw Error('Expected JSON data property');
      json(descriptor.value, depth + 1);
    }
    ancestors.delete(v);
  };
  json(value);
  const root = object(value, ['version', 'id', 'title', 'coordinateSystem', 'calendar', 'sources', 'places', 'assets', 'roadNetworks', 'layouts', 'events', 'routes', 'scenes']);
  if (root.version !== 1 || root.coordinateSystem !== 'WGS84' || root.calendar !== 'proleptic-gregorian') throw Error('Unsupported historical world conventions');
  const id = (v: unknown): string => { const s = text(v); if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(s)) throw Error('Invalid historical ID'); return s; };
  id(root.id); text(root.title);
  const collections = ['sources', 'places', 'assets', 'roadNetworks', 'layouts', 'events', 'routes', 'scenes'] as const;
  const allIds = new Set<string>();
  const indexes = Object.fromEntries(collections.map(key => [key, new Map(list(root[key]).map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw Error('Expected historical entity');
    const record = item as RecordValue, key = id(record.id);
    if (allIds.has(key)) throw Error('Duplicate historical ID');
    allIds.add(key);
    return [key, record];
  }))])) as Record<typeof collections[number], Map<string, RecordValue>>;
  const ref = (v: unknown, collection: typeof collections[number]) => {
    const key = id(v), record = indexes[collection].get(key);
    if (!record) throw Error(`Unknown ${collection} reference: ${key}`);
    return record;
  };
  const refs = (v: unknown, collection: typeof collections[number]) => {
    const values = list(v); if (new Set(values).size !== values.length) throw Error('Duplicate historical reference');
    values.forEach(key => ref(key, collection));
  };
  const evidence = (value: unknown) => {
    const e = object(value, ['certainty', 'sources', 'note']);
    oneOf(e.certainty, ['documented', 'inferred', 'illustrative', 'unknown']);
    refs(e.sources, 'sources'); text(e.note);
    if (['documented', 'inferred'].includes(e.certainty as string) && !list(e.sources).length) throw Error('Historical claim needs source evidence');
  };
  const overlap = (a: unknown, b: unknown) => {
    const bounds = (v: unknown) => { const p = v as HistoricalPeriod, [x, y] = periodBounds(p), u = (p.uncertaintyYears ?? 0) * 372; return [x - u, y + u]; };
    const [a0, a1] = bounds(a), [b0, b1] = bounds(b);
    if (a1 < b0 || b1 < a0) throw Error('Referenced historical periods do not overlap');
  };
  for (const s of indexes.sources.values()) {
    object(s, ['id', 'title', 'url', 'publisher', 'accessed', 'citation']); text(s.title); text(s.publisher); url(s.url);
    const accessed = text(s.accessed), parsed = new Date(`${accessed}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(accessed) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== accessed) throw Error('Invalid source access date');
    if (s.citation !== undefined) text(s.citation);
  }
  for (const p of indexes.places.values()) {
    object(p, ['id', 'title', 'kind', 'parentId', 'period', 'position', 'radiusMeters', 'evidence']);
    text(p.title); oneOf(p.kind, ['settlement', 'landmark', 'region']); number(p.radiusMeters, 1, 20000000); evidence(p.evidence);
    const position = object(p.position, ['coordinate', 'uncertaintyMeters', 'evidence']); coordinate(position.coordinate); evidence(position.evidence);
    if (position.uncertaintyMeters !== undefined) number(position.uncertaintyMeters, 0, 20000000);
    if (p.period !== undefined) period(p.period);
    let parent: RecordValue = p;
    const chain = new Set([p.id]);
    while (parent.parentId !== undefined) {
      if (chain.has(parent.parentId) || chain.size > 64) throw Error('Cyclic or excessive place ancestry');
      chain.add(parent.parentId); parent = ref(parent.parentId, 'places');
    }
  }
  for (const a of indexes.assets.values()) {
    object(a, ['id', 'category', 'registryId', 'licence', 'evidence']);
    oneOf(a.category, ['building', 'infrastructure', 'prop', 'vegetation', 'rock', 'character']); evidence(a.evidence);
    if (a.registryId !== undefined) id(a.registryId);
    if (a.licence !== undefined) { const l = object(a.licence, ['title', 'url']); text(l.title); url(l.url); }
  }
  for (const n of indexes.roadNetworks.values()) {
    object(n, ['id', 'placeId', 'period', 'frame', 'roads', 'evidence']); ref(n.placeId, 'places'); period(n.period); evidence(n.evidence);
    oneOf(n.frame, ['local-east-south-metres']); const roadIds = new Set<string>();
    for (const value of list(n.roads)) {
      const r = object(value, ['id', 'widthMeters', 'points', 'accessTo', 'evidence']), key = id(r.id);
      if (roadIds.has(key)) throw Error('Duplicate road ID'); roadIds.add(key);
      number(r.widthMeters, .1, 100); evidence(r.evidence);
      const points = list(r.points); if (points.length < 2) throw Error('Road needs two points'); points.forEach(p => coordinate(p, false));
      if (!points.some(p => JSON.stringify(p) !== JSON.stringify(points[0]))) throw Error('Road has no length');
      if (r.accessTo !== undefined) id(r.accessTo);
    }
  }
  for (const l of indexes.layouts.values()) {
    object(l, ['id', 'title', 'placeId', 'period', 'frame', 'extentMeters', 'maxFoundationRiseMeters', 'roadNetworkId', 'buildings', 'evidence']);
    text(l.title); const place = ref(l.placeId, 'places'); period(l.period); evidence(l.evidence); oneOf(l.frame, ['local-east-south-metres']);
    if (place.period !== undefined) overlap(l.period, place.period);
    const extent = number(l.extentMeters, 1, 20000); number(l.maxFoundationRiseMeters, 0, 100);
    const buildings = new Set<string>();
    const local = (point: unknown) => { coordinate(point, false); if ((point as number[]).some(v => Math.abs(v) > extent / 2)) throw Error('Layout point outside declared extent'); };
    for (const value of list(l.buildings)) {
      const b = object(value, ['id', 'assetId', 'offset', 'headingRadians', 'evidence']), key = id(b.id);
      if (buildings.has(key)) throw Error('Duplicate building ID'); buildings.add(key);
      const asset = ref(b.assetId, 'assets');
      if (!['building', 'infrastructure'].includes(asset.category as string)) throw Error('Building needs a structural asset');
      local(b.offset); evidence(b.evidence);
      if (b.headingRadians !== undefined) number(b.headingRadians, -Math.PI * 2, Math.PI * 2);
    }
    if (l.roadNetworkId !== undefined) {
      const network = ref(l.roadNetworkId, 'roadNetworks');
      if (network.placeId !== l.placeId) throw Error('Road network belongs to another place'); overlap(network.period, l.period);
      for (const value of list(network.roads)) {
        const road = value as RecordValue; list(road.points).forEach(local);
        if (road.accessTo !== undefined && !buildings.has(road.accessTo as string)) throw Error('Unknown road entrance building');
      }
    }
  }
  for (const e of indexes.events.values()) {
    object(e, ['id', 'title', 'description', 'period', 'locations', 'evidence']); text(e.title); text(e.description); period(e.period); evidence(e.evidence);
    if (!list(e.locations).length) throw Error('Event needs a location');
    for (const value of list(e.locations)) { const loc = object(value, ['placeId', 'role']); const place = ref(loc.placeId, 'places'); text(loc.role); if (place.period !== undefined) overlap(e.period, place.period); }
  }
  for (const network of indexes.roadNetworks.values()) {
    const layouts = [...indexes.layouts.values()].filter(l => l.roadNetworkId === network.id);
    for (const road of list(network.roads) as RecordValue[]) {
      if (road.accessTo !== undefined && !layouts.some(l => (l.buildings as RecordValue[]).some(b => b.id === road.accessTo))) throw Error('Unresolved road entrance reference');
    }
  }
  for (const r of indexes.routes.values()) {
    object(r, ['id', 'title', 'period', 'coordinates', 'placeIds', 'evidence']); text(r.title); period(r.period); evidence(r.evidence); refs(r.placeIds, 'places');
    const points = list(r.coordinates); if (points.length < 2) throw Error('Route needs two coordinates'); points.forEach(p => coordinate(p));
    if (!points.some(p => JSON.stringify(p) !== JSON.stringify(points[0]))) throw Error('Route has no length');
  }
  for (const s of indexes.scenes.values()) {
    object(s, ['id', 'title', 'description', 'placeId', 'period', 'layoutIds', 'assetIds', 'required', 'fallback', 'evidence']);
    text(s.title); text(s.description); const place = ref(s.placeId, 'places'); period(s.period); evidence(s.evidence); refs(s.layoutIds, 'layouts'); refs(s.assetIds, 'assets');
    if (place.period !== undefined) overlap(s.period, place.period);
    if (typeof s.required !== 'boolean') throw Error('Scene needs required flag'); oneOf(s.fallback, ['map-only', 'unavailable']);
    for (const key of list(s.layoutIds)) { const layout = ref(key, 'layouts'); if (layout.placeId !== s.placeId) throw Error('Scene layout belongs to another place'); overlap(layout.period, s.period); }
  }
  return JSON.parse(JSON.stringify(value)) as HistoricalWorldData;
}
