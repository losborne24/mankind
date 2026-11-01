import type { Evidence } from '@/lib/history/schema';
import type { BlueprintLayer, Bounds, Chronology, EvidenceReference, FallbackRung, FeatureKind, PlanFeature, SpatialGeometry } from '@/lib/plan/contracts';
import type { ContextCertainty, Coordinate, HistoricalTime } from '@/lib/scenarios/schema';
import type { HistoricalPeriod } from '@/lib/history/schema';

/**
 * Codecs between the existing source files and blueprint layers. A layer keeps every record verbatim, in file order, and the file's
 * top-level key order and indentation, so `compileLayer` returns the exact bytes the generators already read. Features are an index
 * over those records: what planning needs (kind, dates, evidence, extent), with the coordinates left in the record.
 */
export const CODEC_VERSIONS = { 'world@1': 1, 'forum-context@1': 1, 'forum-reconstruction@1': 1, 'rome-zoning@1': 1, 'rome-landmarks@1': 1, 'rome-density@1': 1 } as const;
export type Codec = keyof typeof CODEC_VERSIONS;

export function layerFromFile(id: string, role: BlueprintLayer['role'], codec: Codec, output: string, json: Record<string, unknown>, indent: 0 | 1 | 2, collections: string[]): BlueprintLayer {
  const order = Object.keys(json), header: Record<string, unknown> = {}, rows: Record<string, unknown[]> = {};
  for (const key of order) {
    if (collections.includes(key)) { if (!Array.isArray(json[key])) throw Error(`${output}: ${key} is not a collection`); rows[key] = json[key] as unknown[]; }
    else header[key] = json[key];
  }
  return { id, role, codec, output, serialisation: { indent }, order, header, collections: rows };
}
/** The layer as the file it came from, byte for byte. */
export function compileLayer(layer: BlueprintLayer): string {
  const json: Record<string, unknown> = {};
  for (const key of layer.order) json[key] = key in layer.collections ? layer.collections[key] : layer.header[key];
  return JSON.stringify(json, null, layer.serialisation.indent || undefined) + '\n';
}

export const flatPoints = (value: unknown): Coordinate[] => {
  const out: Coordinate[] = [];
  const walk = (v: unknown) => { if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number') out.push(v as Coordinate); else if (Array.isArray(v)) v.forEach(walk); };
  walk(value);
  return out;
};
export function bboxOf(points: Coordinate[]): Bounds | undefined {
  if (!points.length) return undefined;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of points) { w = Math.min(w, x); s = Math.min(s, y); e = Math.max(e, x); n = Math.max(n, y); }
  // A single point or a vertical line still gets a nonzero box.
  if (w === e) { w -= 1e-6; e += 1e-6; }
  if (s === n) { s -= 1e-6; n += 1e-6; }
  return [w, s, e, n];
}
export const centreOf = (b: Bounds): Coordinate => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];

const contextCertainty: Record<ContextCertainty, Evidence['certainty']> = { documented: 'documented', approximate: 'inferred', illustrative: 'illustrative' };
/** Map-layer certainty to Evidence. Spatial approximation is an inference about where, not a doubt about whether. */
export const evidenceOf = (certainty: ContextCertainty | 'evidence-based' | 'best-guess', sources: string[], note: string, basis?: string): Evidence => {
  const c = certainty === 'evidence-based' ? (sources.length ? 'documented' : 'inferred') : certainty === 'best-guess' ? 'inferred' : contextCertainty[certainty];
  return { certainty: c === 'documented' && !sources.length ? 'inferred' : c, sources, note: basis ? `${note} (basis: ${basis})` : note };
};
const toPeriod = (time: HistoricalTime | undefined, uncertaintyYears?: number): { chronology: Chronology; existence?: HistoricalPeriod } =>
  !time ? { chronology: 'timeless' } : { chronology: time.end ? 'dated' : 'from-start', existence: { start: time.start, ...(time.end ? { end: time.end } : {}), ...(uncertaintyYears ? { uncertaintyYears } : {}) } };
const sourceRefs = (ids: string[]): EvidenceReference[] => ids.map(id => ({ store: 'source', id }));
function feature(id: string, kind: FeatureKind, title: string, dates: ReturnType<typeof toPeriod>, evidence: Evidence, refs: EvidenceReference[], geometry: SpatialGeometry, rung: FallbackRung, record?: PlanFeature['record'], asset?: PlanFeature['asset']): PlanFeature {
  return { id, kind, title, ...dates, evidence, refs, geometry, rung, ...(asset ? { asset } : {}), ...(record ? { record } : {}) };
}

interface ZoneRow { id: string; use: string; title: string; certainty: ContextCertainty; time: HistoricalTime; note: string; sources: string[]; multipolygon: number[][][][]; implicit?: string }
interface LineRow { id: string; kind: 'road' | 'aqueduct'; title: string; certainty: ContextCertainty; time: HistoricalTime; note: string; sources: string[]; lines: number[][][] }
interface MarkerRow { id: string; kind: string; title: string; certainty: ContextCertainty; time: HistoricalTime; note: string; sources: string[]; coordinate: Coordinate }
export function zoningFeatures(layer: BlueprintLayer, fixture: string, frame: Bounds): PlanFeature[] {
  const extent = layer.header.extent as { id: string; title: string; certainty: ContextCertainty; time: HistoricalTime; note: string; sources: string[]; ring: Coordinate[] };
  const ref = (id: string): EvidenceReference => ({ store: `fixture:${fixture}`, id });
  return [
    feature(extent.id, 'extent', extent.title, toPeriod(extent.time), evidenceOf(extent.certainty, extent.sources, extent.note), [ref(extent.id), ...sourceRefs(extent.sources)], { type: 'polygon', bbox: bboxOf(extent.ring), path: 'extent.ring' }, 4),
    ...(layer.collections.zones as ZoneRow[]).map((z, index) => feature(z.id, z.use === 'open-river' ? 'water' : 'zone', z.title, toPeriod(z.time), evidenceOf(z.certainty, z.sources, z.note),
      [ref(z.id), ...sourceRefs(z.sources)], { type: 'polygon', bbox: z.implicit ? frame : bboxOf(flatPoints(z.multipolygon)), path: z.implicit ? 'frame' : 'multipolygon' }, 4, { layer: layer.id, collection: 'zones', index })),
    ...(layer.collections.lines as LineRow[]).map((l, index) => feature(l.id, 'route', l.title, toPeriod(l.time), evidenceOf(l.certainty, l.sources, l.note),
      [ref(l.id), ...sourceRefs(l.sources)], { type: 'line', bbox: bboxOf(flatPoints(l.lines)), path: 'lines' }, 4, { layer: layer.id, collection: 'lines', index })),
    ...(layer.collections.markers as MarkerRow[]).map((m, index) => feature(m.id, 'marker', m.title, toPeriod(m.time), evidenceOf(m.certainty, m.sources, m.note),
      [ref(m.id), ...sourceRefs(m.sources)], { type: 'point', anchor: m.coordinate, path: 'coordinate' }, 5, { layer: layer.id, collection: 'markers', index })),
  ];
}

interface LandmarkRow { id: string; title: string; kit: string; centre: Coordinate; angle: number; size?: [number, number]; height: number; built: number; certainty: 'evidence-based' | 'best-guess'; position: string; note: string; sources: string[] }
/** Every landmark is a rung-3 massing placeholder until a reviewed model exists; its asset request id is fixed here. */
export const landmarkRequestId = (blueprint: string, id: string) => `asset-request:${blueprint.replace(/^blueprint:/, '')}/${id}`;
export function landmarkFeatures(layer: BlueprintLayer, fixture: string, blueprint: string): PlanFeature[] {
  return (layer.collections.landmarks as LandmarkRow[]).map((l, index) => feature(`landmark:${l.id}`, 'landmark', l.title, { chronology: 'from-start', existence: { start: { year: l.built } } },
    evidenceOf(l.certainty, l.sources, `${l.note} Position: ${l.position}.`), [{ store: `fixture:${fixture}`, id: l.id }, ...sourceRefs(l.sources)],
    { type: 'point', anchor: l.centre, path: 'centre' }, 3, { layer: layer.id, collection: 'landmarks', index }, { requestId: landmarkRequestId(blueprint, l.id) }));
}
export const landmarkRow = (layer: BlueprintLayer, index: number) => (layer.collections.landmarks as LandmarkRow[])[index];

interface DensityHeader { west: number; north: number; cell: number; cols: number; rows: number }
export function densityFeature(layer: BlueprintLayer, fixture: string, applicability: HistoricalPeriod): PlanFeature {
  const h = layer.header as unknown as DensityHeader, kx = Math.cos(41.892 * Math.PI / 180) * 111320, ky = 110950;
  const east = h.west + h.cols * h.cell / kx, south = h.north - h.rows * h.cell / ky;
  return feature('field:suburb-density', 'fill', 'Suburban density field', { chronology: 'dated', existence: { ...applicability, end: applicability.end ?? applicability.start } },
    { certainty: 'illustrative', sources: [], note: 'A smoothed field derived from the zoning by build-zoning.mjs; it sets how thickly the fill builds outside the continuous city.' },
    [{ store: `fixture:${fixture}`, id: 'values' }], { type: 'raster-field', bbox: [h.west, south, east, h.north] }, 4);
}

interface ContextGeometry { id: string; title: string; kind: 'polygon' | 'line'; coordinates: Coordinate[][]; certainty: ContextCertainty; basis: string; style: string; time?: HistoricalTime; uncertaintyYears?: number; note: string; sources: string[] }
interface ContextLocation { id: string; title: string; coordinate: Coordinate; certainty: string; sources: string[]; context?: { certainty: ContextCertainty; basis: string; style: string; time?: HistoricalTime; uncertaintyYears?: number; note: string } }
const styleKind: Record<string, FeatureKind> = { water: 'water', ground: 'terrain', extent: 'open-space', footprint: 'building', structure: 'structure', orientation: 'marker' };
export function contextFeatures(layer: BlueprintLayer, fixture: string): PlanFeature[] {
  const ref = (id: string): EvidenceReference => ({ store: `fixture:${fixture}`, id });
  return [
    ...(layer.collections.geometries as ContextGeometry[]).map((g, index) => feature(`context:${g.id}`, styleKind[g.style] ?? 'structure', g.title, toPeriod(g.time, g.uncertaintyYears),
      g.basis === 'modern-geometry' && !g.time ? { certainty: 'unknown', sources: g.sources, note: `${g.note} Today's geometry, drawn for every date.` } : evidenceOf(g.certainty, g.sources, g.note, g.basis),
      [ref(g.id), ...sourceRefs(g.sources)], { type: g.kind, bbox: bboxOf(flatPoints(g.coordinates)), path: 'coordinates' }, 4, { layer: layer.id, collection: 'geometries', index })),
    ...(layer.collections.locations as ContextLocation[]).map((l, index) => feature(`context:${l.id}`, l.context?.style === 'orientation' ? 'marker' : 'structure', l.title, toPeriod(l.context?.time, l.context?.uncertaintyYears),
      evidenceOf(l.context?.certainty ?? 'illustrative', l.sources, l.context?.note ?? l.title, l.context?.basis), [ref(l.id), ...sourceRefs(l.sources)],
      { type: 'point', anchor: l.coordinate, path: 'coordinate' }, 5, { layer: layer.id, collection: 'locations', index })),
  ];
}

interface ReconObject { id: string; kind: string; title: string; certainty: 'documented' | 'evidence-based' | 'best-guess'; shape: { type: string }; footprint: [number, number][]; sources: string[]; note: string; time: HistoricalTime; uncertaintyYears?: number }
/**
 * The generated Forum Boarium neighbourhood. Its lots, lanes and courts were laid out offline from seed 100 and are stored, not
 * re-derived: they are the "generated layout that cannot be reproduced from references alone" a save must point at, not copy.
 */
export function reconstructionFeatures(layer: BlueprintLayer, fixture: string, toGeo: (p: [number, number]) => Coordinate, pins: Record<string, { catalogue: { id: string; version: number } }>): PlanFeature[] {
  const ref = (id: string): EvidenceReference => ({ store: `fixture:${fixture}`, id });
  const objects = (layer.collections.objects as ReconObject[]).map((o, index) => {
    const pin = pins[o.id], kind: FeatureKind = pin ? 'landmark' : ['street', 'square', 'pen', 'stall'].includes(o.kind) ? 'open-space' : ['temple', 'theatre', 'palace', 'circus', 'colonnade'].includes(o.kind) ? 'building' : 'structure';
    return feature(`recon:${o.id}`, kind, o.title, toPeriod(o.time, o.uncertaintyYears), evidenceOf(o.certainty === 'documented' ? 'documented' : o.certainty, o.sources, o.note),
      [ref(o.id), ...sourceRefs(o.sources)], { type: 'polygon', bbox: bboxOf(o.footprint.map(toGeo)), path: 'footprint' }, pin ? 1 : 3, { layer: layer.id, collection: 'objects', index }, pin ? { catalogue: pin.catalogue } : undefined);
  });
  const lots = layer.collections.lots as unknown[], counts = (layer.header.notes as { counts: Record<string, number> }).counts;
  return [...objects, feature('fill:forum-lots', 'fill', 'Generated lots, lanes and courts', { chronology: 'dated', existence: { start: { year: 100 }, end: { year: 100 }, uncertaintyYears: 25 } },
    { certainty: 'illustrative', sources: [], note: `${lots.length} best-guess lots laid out offline (seed ${layer.header.seed}) round the sourced streets; ${counts['best-guess']} best-guess objects in all. Stored, not regenerated.` },
    [ref('lots'), ref('lanes'), ref('courts')], { type: 'polygon', bbox: bboxOf((layer.collections.objects as ReconObject[]).flatMap(o => o.footprint.map(toGeo))), anchor: toGeo([0, 0]) }, 3)];
}

interface WorldPlace { id: string; title: string; kind: 'settlement' | 'landmark' | 'region'; period?: HistoricalPeriod; position: { coordinate: Coordinate }; radiusMeters: number; evidence: Evidence }
/**
 * A place without its own period takes one from `dated` (another record that dates it, named in the note), so nothing is
 * silently timeless; a place with neither is refused.
 */
export function worldPlaceFeatures(layer: BlueprintLayer, dataset: string, pins: Record<string, { catalogue: { id: string; version: number } }> = {}, dated: Record<string, { period: HistoricalPeriod; note: string; ref: EvidenceReference }> = {}): PlanFeature[] {
  return (layer.collections.places as WorldPlace[]).map((p, index) => {
    const pin = pins[p.id], borrowed = !p.period ? dated[p.id] : undefined, period = p.period ?? borrowed?.period;
    if (!period) throw Error(`${dataset}: ${p.id} has no period; give one explicitly`);
    return feature(`place:${p.id.replace(/^place:/, '')}`, pin ? 'landmark' : p.kind === 'settlement' ? 'settlement' : p.kind === 'region' ? 'zone' : 'landmark', p.title,
      { chronology: period.end ? 'dated' : 'from-start', existence: period }, borrowed ? { ...p.evidence, note: `${p.evidence.note} Dates: ${borrowed.note}` } : p.evidence,
      [{ store: `world:${dataset}`, id: p.id }, ...(borrowed ? [borrowed.ref] : []), ...sourceRefs(p.evidence.sources)], { type: 'point', anchor: p.position.coordinate, path: 'position.coordinate' },
      pin ? 1 : 5, { layer: layer.id, collection: 'places', index }, pin ? { catalogue: pin.catalogue } : undefined);
  });
}
