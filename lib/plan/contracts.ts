import type { Evidence, HistoricalPeriod } from '@/lib/history/schema';
import type { Coordinate, HistoricalTime } from '@/lib/scenarios/schema';
import { periodBounds, validateHistoricalDate } from '@/lib/history/time';

/**
 * Phase 5A planning contracts (docs/phase5a-planning.md). A request names a place, a date and a scope; reusable spatial blueprints
 * describe places at one spatial scale each; a scene plan says what of a blueprint chain is ready, missing or deferred for that
 * request. All of it is plain JSON, validated here before anything plans with it. Dates, evidence and catalogue pins are the
 * existing HistoricalPeriod, Evidence and {id, version} records; nothing here re-defines them.
 */
export const PLAN_SCHEMA_VERSION = 1;

/** Spatial scale of a blueprint, coarse to fine. Not rendering LOD: a city blueprint is still drawn near and far. */
export type SpatialLOD = 'empire' | 'region' | 'city' | 'neighbourhood' | 'site' | 'architectural';
export const SPATIAL_LODS: readonly SpatialLOD[] = ['empire', 'region', 'city', 'neighbourhood', 'site', 'architectural'];
export const lodRank = (lod: SpatialLOD) => SPATIAL_LODS.indexOf(lod);
/** West, south, east, north in degrees. */
export type Bounds = [number, number, number, number];
export interface CataloguePin { id: string; version: number }
export interface BlueprintRef { id: string; version: number }
export interface FeatureRef { blueprint: string; feature: string }

/** A provenance link to a record that already exists: a source, a world record, a fixture record or a catalogue version. */
export interface EvidenceReference {
  /** `source` (a HistoricalSource id), `world:<dataset>`, `fixture:<name>`, `catalogue`, or `dataset:<name>` for map data. */
  store: string;
  id: string;
  version?: number;
}

/** Fallback ladder (scene-generation-pipeline.md section 5): 1 bespoke asset, 2 kit, 3 massing, 4 extruded footprint, 5 marker. */
export type FallbackRung = 1 | 2 | 3 | 4 | 5;
export type FeatureKind = 'terrain' | 'water' | 'zone' | 'extent' | 'route' | 'landmark' | 'building' | 'structure' | 'open-space' | 'settlement' | 'marker' | 'fill';
/**
 * How a feature's dates are known. `dated`: start and end recorded. `from-start`: only a start (built in) is recorded; presence
 * after the blueprint's own date is unknown. `timeless`: a landform drawn for every date (marked modern-default if it is today's).
 */
export type Chronology = 'dated' | 'from-start' | 'timeless';
export interface SpatialGeometry {
  type: 'point' | 'line' | 'polygon' | 'raster-field' | 'none';
  bbox?: Bounds;
  anchor?: Coordinate;
  /** Where the coordinates live in the layer record (e.g. `multipolygon`); geometry is stored once, in the record. */
  path?: string;
}
export interface PlanFeature {
  /** Stable within the blueprint's lineage: a corrected feature keeps its id in the next version. */
  id: string;
  kind: FeatureKind;
  title: string;
  chronology: Chronology;
  existence?: HistoricalPeriod;
  evidence: Evidence;
  refs: EvidenceReference[];
  geometry: SpatialGeometry;
  /** The best representation available now. */
  rung: FallbackRung;
  asset?: { catalogue?: CataloguePin; requestId?: string };
  /** Native record: `layer` and `collection` name it, `index` is its position. Absent for features carried by the blueprint alone. */
  record?: { layer: string; collection: string; index: number };
}
/** A source file kept verbatim as records, so compiling the blueprint gives back the exact bytes the generators read. */
export interface BlueprintLayer {
  id: string;
  role: 'world' | 'context' | 'layout' | 'zoning' | 'landmarks' | 'density' | 'sources';
  codec: string;
  /** The existing file this layer compiles to. */
  output: string;
  serialisation: { indent: 0 | 1 | 2 };
  /** Top-level key order of the compiled file. Keys in `collections` hold feature records; the rest are in `header`. */
  order: string[];
  header: Record<string, unknown>;
  collections: Record<string, unknown[]>;
}
/** A procedural layer: reproduced from its inputs by a versioned generator, checked against the digest of its last output. */
export interface GeneratorRef {
  id: string;
  generator: string;
  version: string;
  /** Layer ids in this blueprint, or `<blueprint>@<version>/<layer>` for a child's layer it must keep clear of. */
  inputs: string[];
  params: Record<string, unknown>;
  outputDigest: string;
  applicability: HistoricalPeriod;
}
export interface SpatialBlueprint {
  schema: 1;
  id: string;
  version: number;
  title: string;
  lod: SpatialLOD;
  place: { id: string; title: string; aliases: string[]; anchor: Coordinate; refs: EvidenceReference[] };
  bounds: Bounds;
  /** Most frames are viewing frames chosen to contain the place, not surveyed boundaries; this says which. */
  boundsEvidence: Evidence;
  /** The dates this layout describes. Features carry their own existence within it. */
  applicability: HistoricalPeriod;
  traditions: string[];
  parent?: BlueprintRef;
  children: BlueprintRef[];
  layers: BlueprintLayer[];
  features: PlanFeature[];
  generators: GeneratorRef[];
  provenance: { builtFrom: string[]; note: string };
  versions: { schema: 1; codecs: Record<string, number> };
}

export type PlaceQuery = { id: string } | { title: string; coordinate: Coordinate; tradition?: string };
export type RequestIntent = 'overview' | 'tour' | 'landmark';
/** Structured request. Free text (Phase 5B) must produce this shape; the planner never sees prose. */
export interface ScenarioRequest {
  schema: 1;
  place: PlaceQuery;
  time: HistoricalTime;
  scope: SpatialLOD | 'auto';
  intent: RequestIntent;
  /** A feature id in the place's blueprint chain, or a place id, to focus on. */
  target?: string;
}

export interface AssetRequest {
  id: string;
  feature: FeatureRef;
  title: string;
  catalogue: { existing?: CataloguePin & { status: 'draft' | 'usable' | 'retired' }; proposedId: string };
  location: { anchor: Coordinate; sizeMeters?: [number, number]; heightMeters?: number; angleDegrees?: number; positionNote?: string };
  period: HistoricalPeriod;
  assetType: 'bespoke-landmark' | 'kit-archetype' | 'interior';
  detail: string;
  currentRung: FallbackRung;
  targetRung: FallbackRung;
  evidence: Evidence;
  refs: EvidenceReference[];
  missing: string[];
}
export type GapKind = 'evidence' | 'spatial' | 'asset' | 'chronology' | 'coverage' | 'place';
export interface ContentGap {
  id: string;
  kind: GapKind;
  lod: SpatialLOD;
  title: string;
  detail: string;
  subject: { blueprint?: string; feature?: string; place?: string };
  needed: string[];
  /** True when the requested scene cannot be shown as asked without it. */
  blocking: boolean;
  refs: EvidenceReference[];
  assetRequestId?: string;
}
/** Ready: shown from available evidence and assets. Missing: needed but lacking. Deferred: valid but not needed for the first scene. */
export type ComponentState = 'ready' | 'missing' | 'deferred';
export interface PlanComponent {
  ref: FeatureRef;
  title: string;
  kind: FeatureKind;
  state: ComponentState;
  rung: FallbackRung;
  match: 'within' | 'possible' | 'outside' | 'timeless';
  reason: string;
  gapIds?: string[];
  assetRequestId?: string;
}
export interface DeferredRegion { title: string; lod: SpatialLOD; bounds: Bounds; blueprint?: BlueprintRef; reason: string }
export type ReuseCase = 'same-place-same-date' | 'same-place-other-date' | 'within-existing' | 'typology-elsewhere' | 'none';
export interface ReuseDecision { case: ReuseCase; blueprint?: BlueprintRef; detail: string; reused: number; revalidated: number; rejected: number }
export interface PlanIssue { code: string; severity: 'error' | 'warning'; message: string; subject?: string }
export interface PlanValidation { checkpoint: 'A'; ok: boolean; issues: PlanIssue[]; checked: string[] }
export interface Viewpoint { center: Coordinate; zoom: number; pitch: number; bearing: number }
export interface ScenePlan {
  schema: 1;
  id: string;
  request: ScenarioRequest;
  /** The date actually planned: the request's, or the blueprint's own date when the request is a range containing it. */
  moment: { time: HistoricalTime; chosen: boolean; reason?: string };
  status: 'ready' | 'partial' | 'unresolved';
  place?: { id: string; title: string };
  focus?: BlueprintRef;
  /** Ancestors of the focus, nearest first. */
  context: BlueprintRef[];
  lod: SpatialLOD;
  initial: { title: string; bounds: Bounds; viewpoint: Viewpoint };
  components: PlanComponent[];
  gaps: ContentGap[];
  assetRequests: AssetRequest[];
  deferred: DeferredRegion[];
  reuse: ReuseDecision;
  /** Features of the focus not present at the requested date, with why: never shown, never silently dropped. */
  absent: { ref: FeatureRef; title: string; reason: string }[];
  /** Features that differ between the blueprint's own date and the requested one (same place, other date). */
  revisions: { added: FeatureRef[]; removed: FeatureRef[]; unconfirmed: FeatureRef[] };
  /** Building typologies, rules and kits usable at a place without a layout of its own; never another place's layout. */
  typology: { tradition: string; rules: string[]; kits: string[] } | null;
  /** Renderable 3D scenes the composer may request, from the nearest blueprint that has one. */
  scenes: { dataset: string; sceneId: string; layoutId: string; blueprint: string }[];
  versions: { schema: 1; planner: string; catalogue: string; blueprints: (BlueprintRef & { digest: string })[]; generators: Record<string, string> };
  validation: PlanValidation;
}

type Rec = Record<string, unknown>;
const record = (value: unknown, keys: readonly string[], what: string): Rec => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`${what}: expected record`);
  const extra = Object.keys(value).find(k => !keys.includes(k));
  if (extra) throw Error(`${what}: unknown field ${extra}`);
  return value as Rec;
};
const list = (value: unknown, what: string, max = 100000): unknown[] => {
  if (!Array.isArray(value) || value.length > max) throw Error(`${what}: expected bounded array`);
  return value;
};
const text = (value: unknown, what: string): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > 16000) throw Error(`${what}: expected nonempty text`);
  return value;
};
const number = (value: unknown, min: number, max: number, what: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw Error(`${what}: number outside ${min}…${max}`);
  return value;
};
const oneOf = <T extends string>(value: unknown, options: readonly T[], what: string): T => {
  if (!options.includes(value as T)) throw Error(`${what}: expected one of ${options.join(', ')}`);
  return value as T;
};
const coordinate = (value: unknown, what: string) => {
  const pair = list(value, what, 2);
  if (pair.length !== 2) throw Error(`${what}: expected [longitude, latitude]`);
  number(pair[0], -180, 180, what); number(pair[1], -85, 85, what);
};
export const validateBounds = (value: unknown, what = 'bounds') => {
  const b = list(value, what, 4);
  if (b.length !== 4) throw Error(`${what}: expected [west, south, east, north]`);
  number(b[0], -180, 180, what); number(b[1], -85, 85, what); number(b[2], -180, 180, what); number(b[3], -85, 85, what);
  if ((b[0] as number) >= (b[2] as number) || (b[1] as number) >= (b[3] as number)) throw Error(`${what}: empty or reversed`);
};
const period = (value: unknown, what: string) => {
  const p = record(value, ['start', 'end', 'uncertaintyYears', 'approximate'], what);
  validateHistoricalDate(p.start);
  if (p.end !== undefined) validateHistoricalDate(p.end);
  if (p.uncertaintyYears !== undefined) number(p.uncertaintyYears, 0, 1000, what);
  if (p.approximate !== undefined && typeof p.approximate !== 'boolean') throw Error(`${what}: approximate must be boolean`);
  periodBounds(p as unknown as HistoricalPeriod);
};
const evidence = (value: unknown, what: string) => {
  const e = record(value, ['certainty', 'sources', 'note'], what);
  oneOf(e.certainty, ['documented', 'inferred', 'illustrative', 'unknown'], what);
  list(e.sources, what).forEach(s => text(s, what));
  text(e.note, what);
  if (e.certainty === 'documented' && !(e.sources as unknown[]).length) throw Error(`${what}: documented without a source`);
};
const refs = (value: unknown, what: string) => list(value, what).forEach(r => {
  const v = record(r, ['store', 'id', 'version'], what);
  text(v.store, what); text(v.id, what);
  if (v.version !== undefined) number(v.version, 1, 1e6, what);
});
const pin = (value: unknown, what: string) => { const p = record(value, ['id', 'version'], what); text(p.id, what); number(p.version, 1, 1e6, what); };
const time = (value: unknown, what: string) => {
  const t = record(value, ['start', 'end'], what);
  period(t, what);
};
const rung = (value: unknown, what: string) => oneOf(value as never, [1, 2, 3, 4, 5] as never[], what);
const plain = (value: unknown, what: string) => {
  let nodes = 0;
  const walk = (v: unknown, depth: number): void => {
    if (++nodes > 2_000_000 || depth > 40) throw Error(`${what}: JSON complexity limit`);
    if (v === null || typeof v === 'boolean' || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))) return;
    if (!v || typeof v !== 'object' || (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype)) throw Error(`${what}: expected plain JSON`);
    for (const x of Array.isArray(v) ? v : Object.values(v)) walk(x, depth + 1);
  };
  walk(value, 0);
};

export function validateScenarioRequest(value: unknown): ScenarioRequest {
  const r = record(value, ['schema', 'place', 'time', 'scope', 'intent', 'target'], 'request');
  if (r.schema !== 1) throw Error('request: unsupported schema');
  const place = r.place as Rec;
  if (place && typeof place === 'object' && 'id' in place) { record(place, ['id'], 'request.place'); text(place.id, 'request.place.id'); }
  else {
    const p = record(place, ['title', 'coordinate', 'tradition'], 'request.place');
    text(p.title, 'request.place.title'); coordinate(p.coordinate, 'request.place.coordinate');
    if (p.tradition !== undefined) text(p.tradition, 'request.place.tradition');
  }
  time(r.time, 'request.time');
  oneOf(r.scope, ['auto', ...SPATIAL_LODS], 'request.scope');
  oneOf(r.intent, ['overview', 'tour', 'landmark'], 'request.intent');
  if (r.target !== undefined) text(r.target, 'request.target');
  return structuredClone(r) as unknown as ScenarioRequest;
}
/** Canonical form: the same request in any key order or with redundant fields gives the same plan id. */
export function normaliseRequest(value: unknown): ScenarioRequest {
  const r = validateScenarioRequest(value);
  const place: PlaceQuery = 'id' in r.place ? { id: r.place.id.trim() } : { title: r.place.title.trim(), coordinate: [...r.place.coordinate] as Coordinate, ...(r.place.tradition ? { tradition: r.place.tradition } : {}) };
  const date = (d: HistoricalTime['start']) => ({ year: d.year, ...(d.month !== undefined ? { month: d.month } : {}), ...(d.day !== undefined ? { day: d.day } : {}) });
  const t: HistoricalTime = { start: date(r.time.start), ...(r.time.end && canonicalDate(r.time.end) !== canonicalDate(r.time.start) ? { end: date(r.time.end) } : {}) };
  return { schema: 1, place, time: t, scope: r.scope, intent: r.intent, ...(r.target ? { target: r.target } : {}) };
}
const canonicalDate = (d: HistoricalTime['start']) => `${d.year}-${d.month ?? ''}-${d.day ?? ''}`;

const FEATURE_KEYS = ['id', 'kind', 'title', 'chronology', 'existence', 'evidence', 'refs', 'geometry', 'rung', 'asset', 'record'];
const FEATURE_KINDS: FeatureKind[] = ['terrain', 'water', 'zone', 'extent', 'route', 'landmark', 'building', 'structure', 'open-space', 'settlement', 'marker', 'fill'];
export function validateFeature(value: unknown, what = 'feature'): PlanFeature {
  const f = record(value, FEATURE_KEYS, what);
  text(f.id, `${what}.id`); oneOf(f.kind, FEATURE_KINDS, `${what}.kind`); text(f.title, `${what}.title`);
  const chronology = oneOf(f.chronology, ['dated', 'from-start', 'timeless'], `${what}.chronology`);
  if (chronology === 'timeless' ? f.existence !== undefined : f.existence === undefined) throw Error(`${what}: ${chronology} feature ${chronology === 'timeless' ? 'must not carry' : 'needs'} an existence period`);
  if (f.existence !== undefined) period(f.existence, `${what}.existence`);
  if (chronology === 'dated' && !(f.existence as Rec).end) throw Error(`${what}: dated feature needs an end`);
  evidence(f.evidence, `${what}.evidence`); refs(f.refs, `${what}.refs`);
  const g = record(f.geometry, ['type', 'bbox', 'anchor', 'path'], `${what}.geometry`);
  oneOf(g.type, ['point', 'line', 'polygon', 'raster-field', 'none'], `${what}.geometry.type`);
  if (g.bbox !== undefined) validateBounds(g.bbox, `${what}.geometry.bbox`);
  if (g.anchor !== undefined) coordinate(g.anchor, `${what}.geometry.anchor`);
  if (g.path !== undefined) text(g.path, `${what}.geometry.path`);
  if (g.type !== 'none' && g.anchor === undefined && g.bbox === undefined) throw Error(`${what}: geometry needs an anchor or a bbox`);
  rung(f.rung, `${what}.rung`);
  if (f.asset !== undefined) {
    const a = record(f.asset, ['catalogue', 'requestId'], `${what}.asset`);
    if (a.catalogue !== undefined) pin(a.catalogue, `${what}.asset.catalogue`);
    if (a.requestId !== undefined) text(a.requestId, `${what}.asset.requestId`);
  }
  if (f.rung === 1 && !(f.asset as Rec | undefined)?.catalogue) throw Error(`${what}: rung 1 needs a catalogue pin`);
  if (f.record !== undefined) { const r = record(f.record, ['layer', 'collection', 'index'], `${what}.record`); text(r.layer, what); text(r.collection, what); number(r.index, 0, 1e6, what); }
  return f as unknown as PlanFeature;
}

/** Structure and internal references. Chronology, containment and evidence across blueprints are Checkpoint A (checkpointA.ts). */
export function validateBlueprint(value: unknown): SpatialBlueprint {
  plain(value, 'blueprint');
  const b = record(value, ['schema', 'id', 'version', 'title', 'lod', 'place', 'bounds', 'boundsEvidence', 'applicability', 'traditions', 'parent', 'children', 'layers', 'features', 'generators', 'provenance', 'versions'], 'blueprint');
  if (b.schema !== 1) throw Error('blueprint: unsupported schema');
  const id = text(b.id, 'blueprint.id'), what = `blueprint ${id}`;
  number(b.version, 1, 1e6, `${what}.version`); text(b.title, what); oneOf(b.lod, SPATIAL_LODS, `${what}.lod`);
  const place = record(b.place, ['id', 'title', 'aliases', 'anchor', 'refs'], `${what}.place`);
  text(place.id, what); text(place.title, what); list(place.aliases, what).forEach(a => text(a, what)); coordinate(place.anchor, what); refs(place.refs, what);
  validateBounds(b.bounds, `${what}.bounds`); evidence(b.boundsEvidence, `${what}.boundsEvidence`); period(b.applicability, `${what}.applicability`);
  list(b.traditions, what).forEach(t => text(t, what));
  if (b.parent !== undefined) pin(b.parent, `${what}.parent`);
  list(b.children, what).forEach(c => pin(c, `${what}.child`));
  const layerIds = new Set<string>(), layers = list(b.layers, what) as BlueprintLayer[];
  for (const l of layers) {
    const v = record(l, ['id', 'role', 'codec', 'output', 'serialisation', 'order', 'header', 'collections'], `${what}.layer`);
    if (layerIds.has(text(v.id, what))) throw Error(`${what}: duplicate layer ${v.id}`);
    layerIds.add(v.id as string);
    oneOf(v.role, ['world', 'context', 'layout', 'zoning', 'landmarks', 'density', 'sources'], `${what}.layer.role`); text(v.codec, what); text(v.output, what);
    oneOf(record(v.serialisation, ['indent'], what).indent as never, [0, 1, 2] as never[], `${what}.layer.indent`);
    const order = list(v.order, what) as string[], header = record(v.header, order, `${what}.layer.header`), collections = record(v.collections, order, `${what}.layer.collections`);
    for (const key of order) if ((key in header) === (key in collections)) throw Error(`${what}: layer key ${key} must be in exactly one of header or collections`);
    Object.values(collections).forEach(c => list(c, what));
  }
  const ids = new Set<string>();
  (list(b.features, what) as unknown[]).forEach((f, n) => {
    const feature = validateFeature(f, `${what}.features[${n}]`);
    if (ids.has(feature.id)) throw Error(`${what}: duplicate feature id ${feature.id}`);
    ids.add(feature.id);
    if (feature.record) {
      const layer = layers.find(l => l.id === feature.record!.layer), rows = layer?.collections[feature.record.collection];
      if (!rows || feature.record.index >= rows.length) throw Error(`${what}: feature ${feature.id} points at a missing record`);
    }
  });
  for (const g of list(b.generators, what)) {
    const v = record(g, ['id', 'generator', 'version', 'inputs', 'params', 'outputDigest', 'applicability'], `${what}.generator`);
    text(v.id, what); text(v.generator, what); text(v.version, what); record(v.params, Object.keys(v.params as object), what);
    if (!/^[0-9a-f]{64}$/.test(text(v.outputDigest, what))) throw Error(`${what}: generator digest must be SHA-256`);
    period(v.applicability, what);
    for (const input of list(v.inputs, what) as string[]) if (!input.includes('/') && !layerIds.has(input)) throw Error(`${what}: generator input ${input} is not a layer`);
  }
  const prov = record(b.provenance, ['builtFrom', 'note'], what); list(prov.builtFrom, what).forEach(s => text(s, what)); text(prov.note, what);
  const versions = record(b.versions, ['schema', 'codecs'], what);
  if (versions.schema !== PLAN_SCHEMA_VERSION) throw Error(`${what}: schema version mismatch`);
  return value as SpatialBlueprint;
}

export function validateAssetRequest(value: unknown): AssetRequest {
  const a = record(value, ['id', 'feature', 'title', 'catalogue', 'location', 'period', 'assetType', 'detail', 'currentRung', 'targetRung', 'evidence', 'refs', 'missing'], 'asset request');
  const what = `asset request ${text(a.id, 'asset request.id')}`;
  const f = record(a.feature, ['blueprint', 'feature'], what); text(f.blueprint, what); text(f.feature, what);
  text(a.title, what);
  const c = record(a.catalogue, ['existing', 'proposedId'], what); text(c.proposedId, what);
  if (c.existing !== undefined) { const e = record(c.existing, ['id', 'version', 'status'], what); text(e.id, what); number(e.version, 1, 1e6, what); oneOf(e.status, ['draft', 'usable', 'retired'], what); }
  const l = record(a.location, ['anchor', 'sizeMeters', 'heightMeters', 'angleDegrees', 'positionNote'], what); coordinate(l.anchor, what);
  period(a.period, what); oneOf(a.assetType, ['bespoke-landmark', 'kit-archetype', 'interior'], what); text(a.detail, what);
  rung(a.currentRung, what); rung(a.targetRung, what);
  if ((a.targetRung as number) >= (a.currentRung as number)) throw Error(`${what}: a request must aim above the current rung`);
  evidence(a.evidence, what); refs(a.refs, what);
  if (!list(a.missing, what).length) throw Error(`${what}: a request must say what is missing`);
  (a.missing as unknown[]).forEach(m => text(m, what));
  return a as unknown as AssetRequest;
}

export function validateScenePlan(value: unknown): ScenePlan {
  plain(value, 'plan');
  const p = record(value, ['schema', 'id', 'request', 'moment', 'status', 'place', 'focus', 'context', 'lod', 'initial', 'components', 'gaps', 'assetRequests', 'deferred', 'absent', 'reuse', 'revisions', 'typology', 'scenes', 'versions', 'validation'], 'plan');
  if (p.schema !== 1) throw Error('plan: unsupported schema');
  text(p.id, 'plan.id'); validateScenarioRequest(p.request);
  const moment = record(p.moment, ['time', 'chosen', 'reason'], 'plan.moment'); time(moment.time, 'plan.moment.time');
  if (typeof moment.chosen !== 'boolean' || (moment.chosen && typeof moment.reason !== 'string')) throw Error('plan.moment: a chosen moment needs a reason'); oneOf(p.status, ['ready', 'partial', 'unresolved'], 'plan.status');
  if (p.place !== undefined) { const v = record(p.place, ['id', 'title'], 'plan.place'); text(v.id, 'plan.place'); text(v.title, 'plan.place'); }
  if (p.focus !== undefined) pin(p.focus, 'plan.focus');
  list(p.context, 'plan.context').forEach(c => pin(c, 'plan.context'));
  oneOf(p.lod, SPATIAL_LODS, 'plan.lod');
  const initial = record(p.initial, ['title', 'bounds', 'viewpoint'], 'plan.initial'); text(initial.title, 'plan.initial'); validateBounds(initial.bounds, 'plan.initial.bounds');
  const vp = record(initial.viewpoint, ['center', 'zoom', 'pitch', 'bearing'], 'plan.viewpoint');
  coordinate(vp.center, 'plan.viewpoint'); number(vp.zoom, 0, 22, 'plan.viewpoint.zoom'); number(vp.pitch, 0, 85, 'plan.viewpoint.pitch'); number(vp.bearing, -360, 360, 'plan.viewpoint.bearing');
  const gapIds = new Set<string>(), requestIds = new Set<string>();
  for (const g of list(p.gaps, 'plan.gaps')) {
    const v = record(g, ['id', 'kind', 'lod', 'title', 'detail', 'subject', 'needed', 'blocking', 'refs', 'assetRequestId'], 'plan.gap');
    if (gapIds.has(text(v.id, 'gap.id'))) throw Error(`plan: duplicate gap ${v.id}`);
    gapIds.add(v.id as string);
    oneOf(v.kind, ['evidence', 'spatial', 'asset', 'chronology', 'coverage', 'place'], 'gap.kind'); oneOf(v.lod, SPATIAL_LODS, 'gap.lod');
    text(v.title, 'gap.title'); text(v.detail, 'gap.detail'); record(v.subject, ['blueprint', 'feature', 'place'], 'gap.subject');
    list(v.needed, 'gap.needed').forEach(n => text(n, 'gap.needed'));
    if (typeof v.blocking !== 'boolean') throw Error('gap.blocking must be boolean');
    refs(v.refs, 'gap.refs');
  }
  for (const a of list(p.assetRequests, 'plan.assetRequests')) { const r = validateAssetRequest(a); if (requestIds.has(r.id)) throw Error(`plan: duplicate asset request ${r.id}`); requestIds.add(r.id); }
  const seen = new Set<string>();
  for (const c of list(p.components, 'plan.components')) {
    const v = record(c, ['ref', 'title', 'kind', 'state', 'rung', 'match', 'reason', 'gapIds', 'assetRequestId'], 'plan.component');
    const ref = record(v.ref, ['blueprint', 'feature'], 'component.ref'), key = `${text(ref.blueprint, 'component')}#${text(ref.feature, 'component')}`;
    if (seen.has(key)) throw Error(`plan: component ${key} listed twice`);
    seen.add(key);
    text(v.title, key); oneOf(v.kind, FEATURE_KINDS, key); oneOf(v.state, ['ready', 'missing', 'deferred'], key); rung(v.rung, key);
    oneOf(v.match, ['within', 'possible', 'outside', 'timeless'], key); text(v.reason, key);
    for (const id of (v.gapIds as string[] | undefined) ?? []) if (!gapIds.has(id)) throw Error(`plan: ${key} cites unknown gap ${id}`);
    if (v.assetRequestId !== undefined && !requestIds.has(v.assetRequestId as string)) throw Error(`plan: ${key} cites unknown asset request`);
    if (v.state === 'missing' && !(v.gapIds as string[] | undefined)?.length) throw Error(`plan: missing ${key} has no gap`);
    if (v.state === 'deferred' && (v.gapIds as string[] | undefined)?.length) throw Error(`plan: deferred ${key} must not raise gaps`);
  }
  for (const d of list(p.deferred, 'plan.deferred')) { const v = record(d, ['title', 'lod', 'bounds', 'blueprint', 'reason'], 'plan.deferred'); text(v.title, 'deferred'); oneOf(v.lod, SPATIAL_LODS, 'deferred.lod'); validateBounds(v.bounds, 'deferred.bounds'); text(v.reason, 'deferred'); if (v.blueprint !== undefined) pin(v.blueprint, 'deferred.blueprint'); }
  for (const a of list(p.absent, 'plan.absent')) { const v = record(a, ['ref', 'title', 'reason'], 'plan.absent'); record(v.ref, ['blueprint', 'feature'], 'absent.ref'); text(v.title, 'absent'); text(v.reason, 'absent'); }
  const reuse = record(p.reuse, ['case', 'blueprint', 'detail', 'reused', 'revalidated', 'rejected'], 'plan.reuse');
  oneOf(reuse.case, ['same-place-same-date', 'same-place-other-date', 'within-existing', 'typology-elsewhere', 'none'], 'plan.reuse.case');
  const rev = record(p.revisions, ['added', 'removed', 'unconfirmed'], 'plan.revisions'); for (const k of ['added', 'removed', 'unconfirmed']) list(rev[k], 'plan.revisions');
  if (p.typology !== null) { const t = record(p.typology, ['tradition', 'rules', 'kits'], 'plan.typology'); text(t.tradition, 'typology'); list(t.rules, 'typology'); list(t.kits, 'typology'); }
  list(p.scenes, 'plan.scenes').forEach(s => { const v = record(s, ['dataset', 'sceneId', 'layoutId', 'blueprint'], 'plan.scene'); text(v.dataset, 'scene'); text(v.sceneId, 'scene'); text(v.layoutId, 'scene'); text(v.blueprint, 'scene'); });
  const versions = record(p.versions, ['schema', 'planner', 'catalogue', 'blueprints', 'generators'], 'plan.versions');
  if (versions.schema !== PLAN_SCHEMA_VERSION) throw Error('plan: schema version mismatch');
  const validation = record(p.validation, ['checkpoint', 'ok', 'issues', 'checked'], 'plan.validation');
  if (validation.checkpoint !== 'A' || typeof validation.ok !== 'boolean') throw Error('plan.validation: expected Checkpoint A result');
  return value as ScenePlan;
}

/** Order-key bounds of a request's time, for comparing with feature existence. */
export const requestBounds = (request: ScenarioRequest) => periodBounds(request.time);
