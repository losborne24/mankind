import type { BlueprintRef, CataloguePin, EvidenceReference, PlanFeature, SpatialBlueprint } from '@/lib/plan/contracts';
import type { BlueprintOverride } from '@/lib/plan/overrides';
import type { BlueprintStore } from '@/lib/plan/store';
import { refKey } from '@/lib/plan/store';

/** Something that makes part of a blueprint stale. */
export type BlueprintChange =
  | { kind: 'evidence'; ref: EvidenceReference }
  | { kind: 'asset-available'; catalogue: CataloguePin; requestId?: string }
  | { kind: 'feature-corrected'; blueprint: BlueprintRef; feature: string }
  | { kind: 'rule-changed'; generator: string; version: string };
export interface InvalidationReport {
  change: BlueprintChange;
  affected: { blueprint: BlueprintRef; features: string[]; generators: string[]; overrides: string[]; reason: string }[];
  untouched: BlueprintRef[];
}

const cites = (f: PlanFeature, ref: EvidenceReference) =>
  f.refs.some(r => r.store === ref.store && r.id === ref.id && (ref.version === undefined || r.version === ref.version)) || (ref.store === 'source' && f.evidence.sources.includes(ref.id));
/** A generator input is a layer here, or `<blueprint>@<version>/<layer>` in another blueprint. */
const readsLayer = (inputs: string[], owner: SpatialBlueprint, target: SpatialBlueprint, layer: string) =>
  inputs.some(i => i.includes('/') ? i === `${refKey(target)}/${layer}` : owner === target && i === layer);

/**
 * Exactly what a change touches: the features that cite it, the generated layers that read their layer, and the scenario overrides
 * built on them. Everything else is reported untouched, so a correction in one neighbourhood never regenerates the rest of the city.
 */
export function invalidate(store: BlueprintStore, change: BlueprintChange, overrides: readonly BlueprintOverride[] = []): InvalidationReport {
  const blueprints = store.all(), hits = new Map<string, { blueprint: SpatialBlueprint; features: Set<string>; reasons: string[] }>();
  const hit = (b: SpatialBlueprint, features: string[], reason: string) => {
    const entry = hits.get(refKey(b)) ?? { blueprint: b, features: new Set<string>(), reasons: [] };
    features.forEach(f => entry.features.add(f)); if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
    hits.set(refKey(b), entry);
  };
  const touchedLayers: { blueprint: SpatialBlueprint; layer: string }[] = [];
  for (const b of blueprints) {
    let features: PlanFeature[] = [];
    if (change.kind === 'evidence') features = b.features.filter(f => cites(f, change.ref));
    if (change.kind === 'asset-available') features = b.features.filter(f => (change.requestId && f.asset?.requestId === change.requestId) || f.asset?.catalogue?.id === change.catalogue.id);
    if (change.kind === 'feature-corrected' && b.id === change.blueprint.id && b.version === change.blueprint.version) features = b.features.filter(f => f.id === change.feature);
    if (features.length) {
      hit(b, features.map(f => f.id), change.kind === 'asset-available' ? `A model for ${change.catalogue.id}@${change.catalogue.version} can replace the current representation.` : change.kind === 'evidence' ? `Cites ${change.ref.store}:${change.ref.id}.` : `Feature ${change.kind === 'feature-corrected' ? change.feature : ''} was corrected.`);
      // A new model changes how a feature is drawn, not where it stands: generated layers that keep clear of it stay valid.
      if (change.kind !== 'asset-available') for (const f of features) if (f.record) touchedLayers.push({ blueprint: b, layer: f.record.layer });
    }
  }
  const generatorHits = new Map<string, Set<string>>();
  for (const b of blueprints) for (const g of b.generators) {
    const stale = change.kind === 'rule-changed' ? g.generator === change.generator && g.version !== change.version : touchedLayers.some(t => readsLayer(g.inputs, b, t.blueprint, t.layer));
    if (stale) { generatorHits.set(refKey(b), (generatorHits.get(refKey(b)) ?? new Set()).add(g.id)); hit(b, [], change.kind === 'rule-changed' ? `${g.generator} is now version ${change.version}.` : `${g.id} reads a changed layer.`); }
  }
  const affected = [...hits.values()].map(({ blueprint, features, reasons }) => {
    const ids = [...features], generators = [...(generatorHits.get(refKey(blueprint)) ?? [])];
    const touched = overrides.filter(o => o.base.id === blueprint.id && o.base.version === blueprint.version && o.ops.some(op => op.op !== 'add' && ids.includes(op.feature))).map(o => o.id);
    return { blueprint: { id: blueprint.id, version: blueprint.version }, features: ids.sort(), generators: generators.sort(), overrides: touched.sort(), reason: reasons.join(' ') };
  }).sort((a, b) => refKey(a.blueprint).localeCompare(refKey(b.blueprint)));
  const keys = new Set(affected.map(a => refKey(a.blueprint)));
  return { change, affected, untouched: blueprints.filter(b => !keys.has(refKey(b))).map(b => ({ id: b.id, version: b.version })) };
}
