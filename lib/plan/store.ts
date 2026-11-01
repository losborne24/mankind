import type { BlueprintLayer, BlueprintRef, Bounds, PlanFeature, SpatialBlueprint } from '@/lib/plan/contracts';
import { lodRank, validateBlueprint } from '@/lib/plan/contracts';
import { digestOf } from '@/lib/plan/digest';
import type { Coordinate } from '@/lib/scenarios/schema';

export const refKey = (ref: BlueprintRef) => `${ref.id}@${ref.version}`;
export const contains = (outer: Bounds, inner: Bounds, slack = 1e-6) => inner[0] >= outer[0] - slack && inner[1] >= outer[1] - slack && inner[2] <= outer[2] + slack && inner[3] <= outer[3] + slack;
export const intersects = (a: Bounds, b: Bounds) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
export const inside = (b: Bounds, [x, y]: Coordinate) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];

export interface GazetteerEntry { placeId: string; title: string; aliases: string[]; blueprint: BlueprintRef; lod: SpatialBlueprint['lod']; feature?: string }

/**
 * Immutable, versioned blueprints. Registering never changes a stored version; a correction is a new version (`revise`) and
 * scenario-specific changes are override layers (overrides.ts). Lookups are deterministic: ties break on id, then version.
 */
export class BlueprintStore {
  private byKey = new Map<string, SpatialBlueprint>();
  private digests = new Map<string, string>();
  constructor(blueprints: readonly SpatialBlueprint[]) { for (const b of blueprints) this.register(b); }
  register(blueprint: SpatialBlueprint) {
    validateBlueprint(blueprint);
    const key = refKey(blueprint);
    if (this.byKey.has(key)) throw Error(`${key} is already registered; blueprints are immutable, register a new version`);
    this.byKey.set(key, blueprint);
  }
  all(): SpatialBlueprint[] { return [...this.byKey.values()].sort((a, b) => a.id.localeCompare(b.id) || a.version - b.version); }
  get(ref: BlueprintRef): SpatialBlueprint | undefined { return this.byKey.get(refKey(ref)); }
  require(ref: BlueprintRef): SpatialBlueprint { const b = this.get(ref); if (!b) throw Error(`Unknown blueprint ${refKey(ref)}`); return b; }
  latest(id: string): SpatialBlueprint | undefined { return this.all().filter(b => b.id === id).at(-1); }
  digest(ref: BlueprintRef): string {
    const key = refKey(ref);
    if (!this.digests.has(key)) this.digests.set(key, digestOf(this.require(ref)));
    return this.digests.get(key)!;
  }
  /** Parent chain, nearest first. */
  ancestors(ref: BlueprintRef): SpatialBlueprint[] {
    const out: SpatialBlueprint[] = [];
    for (let b = this.require(ref); b.parent; ) { b = this.require(b.parent); if (out.includes(b)) throw Error('Blueprint parent cycle'); out.push(b); }
    return out;
  }
  children(ref: BlueprintRef): SpatialBlueprint[] { return this.require(ref).children.map(c => this.require(c)); }
  /** Places by id, title and alias, plus the landmarks inside blueprints that have no blueprint of their own. */
  gazetteer(): GazetteerEntry[] {
    const latest = new Map<string, SpatialBlueprint>();
    for (const b of this.all()) latest.set(b.id, b);
    const entries: GazetteerEntry[] = [], placed = new Set<string>();
    for (const b of latest.values()) { entries.push({ placeId: b.place.id, title: b.place.title, aliases: b.place.aliases, blueprint: { id: b.id, version: b.version }, lod: b.lod }); placed.add(b.place.id); }
    // Layout anchors (world places with `marker: false`) are not places anyone asks for.
    const anchor = (b: SpatialBlueprint, f: PlanFeature) => f.record?.collection === 'places' && (b.layers.find(l => l.id === f.record!.layer)!.collections.places[f.record.index] as { marker?: boolean }).marker === false;
    for (const b of latest.values()) for (const f of b.features) if (f.kind === 'landmark' && !placed.has(f.id) && !anchor(b, f) && !b.children.some(c => this.get(c)?.place.title === f.title))
      entries.push({ placeId: f.id, title: f.title, aliases: [], blueprint: { id: b.id, version: b.version }, lod: b.lod, feature: f.id });
    return entries.sort((a, b) => lodRank(a.lod) - lodRank(b.lod) || a.title.localeCompare(b.title));
  }
  /** Exact id, title or alias (case and spacing ignored). Never a nearest or fuzzy match. */
  resolvePlace(query: string): GazetteerEntry | undefined {
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim(), q = norm(query);
    const entries = this.gazetteer();
    return entries.find(e => e.placeId === query || e.blueprint.id === query) ?? entries.find(e => norm(e.title) === q || e.aliases.some(a => norm(a) === q));
  }
  /** Finest blueprints whose frame contains a coordinate, finest first (used only as context, never as the place itself). */
  containing(point: Coordinate): SpatialBlueprint[] {
    const latest = new Map<string, SpatialBlueprint>();
    for (const b of this.all()) latest.set(b.id, b);
    return [...latest.values()].filter(b => inside(b.bounds, point)).sort((a, b) => lodRank(b.lod) - lodRank(a.lod) || a.id.localeCompare(b.id));
  }
  /**
   * A corrected copy as the next version: replaced features keep their ids, the layer records they point at are replaced in the
   * copy only. The old version stays registered, so plans and saves that pin it still reopen.
   */
  revise(ref: BlueprintRef, corrections: { feature: PlanFeature; record?: unknown }[], note: string): SpatialBlueprint {
    const base = this.require(ref), next = structuredClone(base) as SpatialBlueprint;
    next.version = Math.max(...this.all().filter(b => b.id === base.id).map(b => b.version)) + 1;
    for (const { feature, record } of corrections) {
      const i = next.features.findIndex(f => f.id === feature.id);
      if (i < 0) throw Error(`${base.id} has no feature ${feature.id} to correct`);
      next.features[i] = structuredClone(feature);
      if (record !== undefined && feature.record) (next.layers.find(l => l.id === feature.record!.layer) as BlueprintLayer).collections[feature.record.collection][feature.record.index] = structuredClone(record);
    }
    next.provenance = { builtFrom: [...base.provenance.builtFrom, refKey(base)], note: `${base.provenance.note} Revised: ${note}` };
    this.register(next);
    return next;
  }
}

/** The coordinates a feature's geometry path points at in its layer record (or the layer header). */
export function featureCoordinates(blueprint: SpatialBlueprint, feature: PlanFeature): unknown {
  const path = feature.geometry.path;
  if (!path) return feature.geometry.anchor;
  if (!feature.record) {
    for (const layer of blueprint.layers) { const v = dig(layer.header, path); if (v !== undefined) return v; }
    return undefined;
  }
  const layer = blueprint.layers.find(l => l.id === feature.record!.layer)!;
  return dig(layer.collections[feature.record.collection][feature.record.index], path);
}
const dig = (value: unknown, path: string) => path.split('.').reduce<unknown>((v, k) => v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined, value);
