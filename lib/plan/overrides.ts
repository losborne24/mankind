import type { BlueprintRef, PlanFeature, PlanIssue, SpatialBlueprint } from '@/lib/plan/contracts';
import { validateFeature } from '@/lib/plan/contracts';
import type { Coordinate } from '@/lib/scenarios/schema';
import type { BlueprintStore } from '@/lib/plan/store';
import { refKey } from '@/lib/plan/store';

/**
 * Scenario-specific changes as a derived layer over a pinned canonical blueprint. The canonical blueprint is never mutated: applying
 * overrides returns a new object, and an override whose base digest no longer matches is refused rather than re-targeted.
 * Added features carry their own inline geometry: that is the generated layout a save must store, because no reference reproduces it.
 */
export type OverrideOp =
  | { op: 'hide'; feature: string; reason: string }
  | { op: 'move'; feature: string; anchor: Coordinate; reason: string }
  | { op: 'add'; feature: PlanFeature; reason: string };
export interface BlueprintOverride { id: string; base: BlueprintRef & { digest: string }; ops: OverrideOp[] }

export function overrideIssues(override: BlueprintOverride, store: BlueprintStore): PlanIssue[] {
  const issues: PlanIssue[] = [], base = store.get(override.base);
  const error = (code: string, message: string) => issues.push({ code, severity: 'error', message, subject: override.id });
  if (!base) { error('override-base-missing', `Override ${override.id} targets ${refKey(override.base)}, which is not registered.`); return issues; }
  if (store.digest(override.base) !== override.base.digest) error('override-base-changed', `Override ${override.id} was made against a different ${refKey(override.base)}.`);
  const ids = new Set(base.features.map(f => f.id));
  for (const op of override.ops) {
    if (op.op === 'add') {
      try { validateFeature(op.feature, `override ${override.id} added feature`); } catch (e) { error('override-feature-invalid', (e as Error).message); }
      if (ids.has(op.feature.id)) error('override-id-collision', `Override ${override.id} adds ${op.feature.id}, which already exists in ${refKey(base)}.`);
      if (op.feature.record) error('override-record', 'An added feature must carry inline geometry, not point into a canonical layer.');
      ids.add(op.feature.id);
    } else if (!ids.has(op.feature)) error('override-unknown-feature', `Override ${override.id} ${op.op}s ${op.feature}, which ${refKey(base)} does not have.`);
  }
  return issues;
}

/** The derived view of `base` with the overrides applied, in order. `base` is left as it was. */
export function applyOverrides(base: SpatialBlueprint, overrides: readonly BlueprintOverride[]): { blueprint: SpatialBlueprint; hidden: string[]; added: string[]; moved: string[] } {
  const mine = overrides.filter(o => o.base.id === base.id && o.base.version === base.version);
  if (!mine.length) return { blueprint: base, hidden: [], added: [], moved: [] };
  const features = base.features.map(f => f), hidden: string[] = [], added: string[] = [], moved: string[] = [];
  for (const o of mine) for (const op of o.ops) {
    const i = op.op === 'add' ? -1 : features.findIndex(f => f.id === op.feature);
    if (op.op === 'hide' && i >= 0) { features.splice(i, 1); hidden.push(op.feature); }
    if (op.op === 'move' && i >= 0) {
      const f = features[i];
      features[i] = { ...f, geometry: { type: 'point', anchor: op.anchor }, evidence: { ...f.evidence, certainty: f.evidence.certainty === 'documented' ? 'inferred' : f.evidence.certainty, note: `${f.evidence.note} Moved in this scenario: ${op.reason}` } };
      delete (features[i] as Partial<PlanFeature>).record;
      moved.push(op.feature);
    }
    if (op.op === 'add') { features.push(structuredClone(op.feature)); added.push(op.feature.id); }
  }
  return { blueprint: { ...base, features }, hidden, added, moved };
}
