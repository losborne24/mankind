import type { PlanFeature, PlanIssue, PlanValidation, ScenePlan, SpatialBlueprint } from '@/lib/plan/contracts';
import { CODEC_VERSIONS } from '@/lib/plan/codecs';
import { PLAN_SCHEMA_VERSION, lodRank, validateBlueprint, validateScenePlan } from '@/lib/plan/contracts';
import { GENERATORS } from '@/lib/plan/generators';
import { presence } from '@/lib/plan/chronology';
import { overrideIssues, applyOverrides, type BlueprintOverride } from '@/lib/plan/overrides';
import { sourceIndex } from '@/lib/plan/sources';
import { contains, featureCoordinates, inside, refKey, type BlueprintStore } from '@/lib/plan/store';
import { catalogueStatus, type AssetCatalogue } from '@/lib/assets/catalogueValidation';
import type { Coordinate } from '@/lib/scenarios/schema';

/**
 * Checkpoint A (scene-generation-pipeline.md section 7) over blueprints and plans: data only, no renderer. Errors make a plan
 * unusable; warnings are shown in the review view. Each check is named in `checked` so a passing result says what it covered.
 */
interface Ctx { store: BlueprintStore; catalogue: AssetCatalogue; overrides?: readonly BlueprintOverride[] }
const CHECKS = ['schema', 'versions', 'chronology', 'coordinates', 'containment', 'placement', 'provenance', 'asset-identity', 'inheritance', 'missing-vs-deferred', 'identifiers'] as const;

const inRing = (p: Coordinate, ring: Coordinate[]) => { let x = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) if ((ring[i][1] > p[1]) !== (ring[j][1] > p[1]) && p[0] < (ring[j][0] - ring[i][0]) * (p[1] - ring[i][1]) / (ring[j][1] - ring[i][1]) + ring[i][0]) x = !x; return x; };
const inMultipolygon = (p: Coordinate, mp: Coordinate[][][]) => mp.some(poly => inRing(p, poly[0]) && !poly.slice(1).some(h => inRing(p, h)));

export function blueprintIssues(b: SpatialBlueprint, ctx: Ctx): PlanIssue[] {
  const issues: PlanIssue[] = [], { store, catalogue } = ctx;
  const error = (code: string, message: string, subject = b.id) => issues.push({ code, severity: 'error', message, subject });
  const warn = (code: string, message: string, subject = b.id) => issues.push({ code, severity: 'warning', message, subject });
  try { validateBlueprint(b); } catch (e) { error('schema', (e as Error).message); return issues; }
  if (b.versions.schema !== PLAN_SCHEMA_VERSION) error('version-schema', `${b.id} uses schema ${b.versions.schema}.`);
  for (const [codec, v] of Object.entries(b.versions.codecs)) if (CODEC_VERSIONS[codec as keyof typeof CODEC_VERSIONS] !== v) error('version-codec', `${b.id} was built with ${codec} v${v}, current is v${CODEC_VERSIONS[codec as keyof typeof CODEC_VERSIONS] ?? 'none'}.`);
  for (const l of b.layers) if (!(l.codec in CODEC_VERSIONS)) error('version-codec', `Layer ${l.id} uses unknown codec ${l.codec}.`);
  // Inheritance: links both ways, finer scale below, frames nested.
  if (b.parent) {
    const parent = store.get(b.parent);
    if (!parent) error('inheritance-parent', `${b.id} names missing parent ${refKey(b.parent)}.`);
    else {
      if (!parent.children.some(c => c.id === b.id)) error('inheritance-parent', `${refKey(parent)} does not list ${b.id} as a child.`);
      // A corrected child is a new version its parent may not list yet; that is reported, not a failure (no cascade of revisions).
      else if (!parent.children.some(c => c.id === b.id && c.version === b.version)) warn('inheritance-version', `${refKey(parent)} lists another version of ${b.id}.`);
      if (lodRank(parent.lod) >= lodRank(b.lod)) error('inheritance-scale', `${b.id} (${b.lod}) is not finer than its parent (${parent.lod}).`);
      if (!contains(parent.bounds, b.bounds)) error('containment', `${b.id}'s frame lies outside ${parent.id}'s.`);
    }
  }
  for (const c of b.children) {
    const child = store.get(c);
    if (!child) error('inheritance-child', `${b.id} names missing child ${refKey(c)}.`);
    else if (child.parent?.id !== b.id) error('inheritance-child', `${refKey(c)} does not name ${b.id} as its parent.`);
    else if (child.parent.version !== b.version) warn('inheritance-version', `${refKey(c)} names ${refKey(child.parent)} as its parent, not ${refKey(b)}.`);
  }
  // Coordinates and placement.
  const water = b.features.filter(f => f.kind === 'water' && f.geometry.path === 'multipolygon').map(f => ({ f, mp: featureCoordinates(b, f) as Coordinate[][][] }));
  // A source id may also name another blueprint feature (a landmark citing its zone): an internal cross-reference, not a gap.
  const sources = sourceIndex(store.all(), catalogue), featureIds = new Set(store.all().flatMap(x => x.features.map(f => f.id)));
  for (const f of b.features) {
    const at = f.geometry.anchor;
    if (at && !inside(b.bounds, at)) error('coordinates', `${f.id} stands outside ${b.id}'s frame.`, f.id);
    if (f.geometry.bbox && !contains([b.bounds[0] - 0.02, b.bounds[1] - 0.02, b.bounds[2] + 0.02, b.bounds[3] + 0.02], f.geometry.bbox)) warn('coordinates', `${f.id} extends beyond ${b.id}'s frame.`, f.id);
    if (f.kind === 'landmark' && at) for (const w of water) if (inMultipolygon(at, w.mp) && presence(w.f, b, { start: b.applicability.start }).present === 'yes') error('placement', `${f.title} is placed in ${w.f.title}.`, f.id);
    if (f.evidence.certainty === 'documented' && !f.evidence.sources.length) error('provenance', `${f.id} is documented without a source.`, f.id);
    for (const s of f.evidence.sources) if (!sources.has(s) && !featureIds.has(s)) warn('provenance-unresolved', `${f.id} cites ${s}, which no registered source list defines.`, f.id);
    if (f.rung === 1) assetIdentity(b, f);
    if (f.chronology !== 'timeless' && f.existence && f.existence.start.year > (b.applicability.end ?? b.applicability.start).year && f.kind === 'landmark') warn('chronology', `${f.title} starts after ${b.id}'s date.`, f.id);
  }
  for (const g of b.generators) {
    const current = GENERATORS[g.generator as keyof typeof GENERATORS];
    if (!current) error('version-generator', `${g.id} uses unknown generator ${g.generator}.`);
    else if (current.version !== g.version || current.outputDigest !== g.outputDigest) error('version-generator', `${g.id} pins ${g.generator} v${g.version}; current is v${current.version}.`);
    for (const input of g.inputs.filter(i => i.includes('/'))) {
      const [key, layer] = input.split('/'), [id, version] = key.split('@'), other = store.get({ id, version: Number(version) });
      if (!other?.layers.some(l => l.id === layer)) error('inheritance-input', `${g.id} reads ${input}, which does not exist.`);
    }
  }
  return issues;

  function assetIdentity(blueprint: SpatialBlueprint, f: PlanFeature) {
    const pin = f.asset!.catalogue!, entry = catalogue.entries.find(e => e.id === pin.id && e.version === pin.version);
    if (!entry) return error('asset-identity', `${f.id} pins ${pin.id}@${pin.version}, which the catalogue lacks.`, f.id);
    const worldPlace = f.refs.find(r => r.store.startsWith('world:'))?.id;
    if (worldPlace && worldPlace !== entry.placeId) error('asset-identity', `${f.id} is ${worldPlace} but its model is of ${entry.placeId}.`, f.id);
    if (blueprint.lod === 'site' && blueprint.place.id !== entry.placeId) error('asset-identity', `${blueprint.id} is ${blueprint.place.id} but pins a model of ${entry.placeId}.`, f.id);
    if (catalogueStatus(catalogue, entry) !== 'usable') warn('asset-identity', `${pin.id}@${pin.version} is ${catalogueStatus(catalogue, entry)}; it will not be shown.`, f.id);
  }
}

export function checkpointA(plan: ScenePlan, ctx: Ctx): PlanValidation {
  const issues: PlanIssue[] = [], { store, catalogue } = ctx, overrides = ctx.overrides ?? [];
  const error = (code: string, message: string, subject?: string) => issues.push({ code, severity: 'error', message, ...(subject ? { subject } : {}) });
  try { validateScenePlan(plan); } catch (e) { error('schema', (e as Error).message); return { checkpoint: 'A', ok: false, issues, checked: [...CHECKS] }; }
  const pinned = new Map(plan.versions.blueprints.map(b => [b.id, b]));
  for (const b of plan.versions.blueprints) {
    const stored = store.get(b);
    if (!stored) { error('versions', `${refKey(b)} is not registered.`); continue; }
    if (store.digest(b) !== b.digest) error('versions', `${refKey(b)} changed since the plan was made.`);
    for (const issue of blueprintIssues(stored, ctx)) issues.push(issue);
  }
  for (const o of overrides) issues.push(...overrideIssues(o, store));
  const views = new Map<string, SpatialBlueprint>();
  const view = (id: string) => { if (!views.has(id)) { const b = pinned.get(id); const stored = b && store.get(b); if (stored) views.set(id, applyOverrides(stored, overrides).blueprint); } return views.get(id); };
  const gapById = new Map(plan.gaps.map(g => [g.id, g])), deferredIds = new Set(plan.deferred.flatMap(d => d.blueprint ? [d.blueprint.id] : []));
  for (const c of plan.components) {
    const b = view(c.ref.blueprint), f = b?.features.find(x => x.id === c.ref.feature), key = `${c.ref.blueprint}#${c.ref.feature}`;
    if (!b || !f) { error('identifiers', `${key} does not resolve in the pinned blueprints.`, key); continue; }
    if (c.state === 'ready' && presence(f, b, plan.request.time).present !== 'yes') error('chronology', `${f.title} is ready but not confirmed at the requested date.`, key);
    if (c.state === 'ready' && f.evidence.certainty === 'documented' && !f.evidence.sources.length) error('provenance', `${f.title} is shown as documented without a source.`, key);
    if (c.state === 'ready' && c.rung === 1) {
      const pin = f.asset?.catalogue, entry = pin && catalogue.entries.find(e => e.id === pin.id && e.version === pin.version);
      if (!entry || catalogueStatus(catalogue, entry) !== 'usable') error('asset-identity', `${f.title} is ready with a model that is not usable.`, key);
    }
    if (deferredIds.has(c.ref.blueprint)) error('missing-vs-deferred', `${key} is planned although its blueprint is deferred.`, key);
    if (c.state === 'missing' && !c.gapIds?.some(id => gapById.has(id))) error('missing-vs-deferred', `${key} is missing without a gap.`, key);
  }
  // Gaps and requests belong to what is planned; nothing deferred raises them (an empire never asks for every city's buildings).
  const planned = new Set(plan.components.map(c => c.ref.blueprint));
  for (const g of plan.gaps) if (g.subject.blueprint && deferredIds.has(g.subject.blueprint) && !planned.has(g.subject.blueprint)) error('missing-vs-deferred', `Gap ${g.id} is raised for deferred ${g.subject.blueprint}.`, g.id);
  for (const r of plan.assetRequests) if (!planned.has(r.feature.blueprint)) error('missing-vs-deferred', `Asset request ${r.id} is for ${r.feature.blueprint}, which is not planned.`, r.id);
  for (const s of plan.scenes) if (!pinned.has(s.blueprint)) error('asset-identity', `Scene ${s.sceneId} comes from an unpinned blueprint.`, s.sceneId);
  if (plan.focus && plan.context.some(c => c.id === plan.focus!.id)) error('inheritance', 'The focus appears in its own context.');
  for (const c of plan.context) { const b = store.get(c), focus = plan.focus && store.get(plan.focus); if (b && focus && lodRank(b.lod) > lodRank(focus.lod) && b.id !== focus.parent?.id) error('inheritance', `${c.id} is finer than the focus but is used as context.`); }
  return { checkpoint: 'A', ok: !issues.some(i => i.severity === 'error'), issues, checked: [...CHECKS] };
}
