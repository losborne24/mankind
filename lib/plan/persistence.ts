import type { BlueprintRef, CataloguePin, EvidenceReference, ScenarioRequest, ScenePlan, Viewpoint } from '@/lib/plan/contracts';
import { normaliseRequest, validateFeature } from '@/lib/plan/contracts';
import type { ScenarioDefinition } from '@/lib/scenarios/schema';
import { canonicalJson, digestOf } from '@/lib/plan/digest';
import { COMPOSER_VERSION, composeScenario } from '@/lib/plan/composer';
import { PLANNER_VERSION, planScenario, type PlanningContext } from '@/lib/plan/planner';
import { overrideIssues, type BlueprintOverride } from '@/lib/plan/overrides';
import { refKey } from '@/lib/plan/store';

/**
 * A saved scenario: references and digests, never shared meshes, textures or canonical blueprints. It stores what cannot be
 * reproduced from those references (scenario overrides with their inline geometry) and the digest of everything that can, so a
 * reopen proves it rebuilt the same thing rather than trusting a seed. Planning is deterministic; nothing is re-asked of an AI.
 */
export interface SavedScenario {
  format: 'mankind.scenario';
  schema: 1;
  request: ScenarioRequest;
  versions: { planner: string; composer: string; catalogue: string; generators: Record<string, string> };
  blueprints: (BlueprintRef & { digest: string })[];
  /** Procedural layers as recipes: rerun by version and checked against the output digest. */
  generated: { blueprint: string; id: string; generator: string; version: string; params: Record<string, unknown>; outputDigest: string }[];
  overrides: BlueprintOverride[];
  assets: CataloguePin[];
  assetRequests: string[];
  evidence: EvidenceReference[];
  viewpoint: Viewpoint;
  plan: { id: string; digest: string };
  journey: { id: string; beats: string[]; digest: string };
}

export function saveScenario(plan: ScenePlan, scenario: ScenarioDefinition, ctx: PlanningContext): SavedScenario {
  const { store } = ctx, overrides = (ctx.overrides ?? []).filter(o => plan.versions.blueprints.some(b => b.id === o.base.id && b.version === o.base.version));
  const generated = plan.versions.blueprints.flatMap(b => store.require(b).generators.filter(g => plan.components.some(c => c.ref.blueprint === b.id && c.ref.feature === g.id && c.state === 'ready'))
    .map(g => ({ blueprint: refKey(b), id: g.id, generator: g.generator, version: g.version, params: g.params, outputDigest: g.outputDigest })));
  const assets = new Map<string, CataloguePin>(), evidence = new Map<string, EvidenceReference>();
  for (const c of plan.components.filter(c => c.state !== 'deferred')) {
    const f = store.require(plan.versions.blueprints.find(b => b.id === c.ref.blueprint)!).features.find(x => x.id === c.ref.feature);
    if (f?.asset?.catalogue) assets.set(`${f.asset.catalogue.id}@${f.asset.catalogue.version}`, f.asset.catalogue);
    for (const r of f?.refs ?? []) evidence.set(`${r.store}|${r.id}|${r.version ?? ''}`, r);
  }
  return {
    format: 'mankind.scenario', schema: 1, request: plan.request,
    versions: { planner: plan.versions.planner, composer: COMPOSER_VERSION, catalogue: plan.versions.catalogue, generators: plan.versions.generators },
    blueprints: plan.versions.blueprints, generated, overrides,
    assets: [...assets.values()].sort((a, b) => a.id.localeCompare(b.id)), assetRequests: plan.assetRequests.map(r => r.id),
    evidence: [...evidence.values()].sort((a, b) => `${a.store}|${a.id}`.localeCompare(`${b.store}|${b.id}`)),
    viewpoint: plan.initial.viewpoint, plan: { id: plan.id, digest: digestOf(plan) },
    journey: { id: scenario.id, beats: scenario.beats.map(b => b.id), digest: digestOf(scenario) },
  };
}
export const serialiseScenario = (saved: SavedScenario) => canonicalJson(saved);
export const scenarioBytes = (saved: SavedScenario) => new TextEncoder().encode(serialiseScenario(saved)).length;

export class ReopenError extends Error { constructor(public reason: 'format' | 'versions' | 'blueprint-changed' | 'override' | 'plan-changed' | 'journey-changed', message: string) { super(message); } }

/**
 * Rebuilds the plan and journey from the saved references and checks every digest. A blueprint, catalogue or version that changed
 * since the save is reported, never silently replaced by its newer state; the old blueprint version reopens if it is still registered.
 */
export function reopenScenario(value: unknown, ctx: PlanningContext): { plan: ScenePlan; scenario: ScenarioDefinition; saved: SavedScenario } {
  const saved = value as SavedScenario;
  if (!saved || saved.format !== 'mankind.scenario' || saved.schema !== 1) throw new ReopenError('format', 'Not a saved Mankind scenario.');
  const request = normaliseRequest(saved.request);
  if (saved.versions.planner !== PLANNER_VERSION || saved.versions.composer !== COMPOSER_VERSION) throw new ReopenError('versions', `Saved with planner ${saved.versions.planner} / composer ${saved.versions.composer}; this build has ${PLANNER_VERSION} / ${COMPOSER_VERSION}.`);
  for (const b of saved.blueprints) {
    if (!ctx.store.get(b)) throw new ReopenError('blueprint-changed', `${refKey(b)} is no longer registered.`);
    if (ctx.store.digest(b) !== b.digest) throw new ReopenError('blueprint-changed', `${refKey(b)} differs from the saved version.`);
  }
  for (const o of saved.overrides) {
    for (const op of o.ops) if (op.op === 'add') validateFeature(op.feature, `saved override ${o.id}`);
    const issues = overrideIssues(o, ctx.store).filter(i => i.severity === 'error');
    if (issues.length) throw new ReopenError('override', issues.map(i => i.message).join(' '));
  }
  const plan = planScenario(request, { ...ctx, overrides: saved.overrides });
  if (plan.id !== saved.plan.id || digestOf(plan) !== saved.plan.digest) throw new ReopenError('plan-changed', `The plan rebuilt as ${plan.id}, not ${saved.plan.id}: evidence, catalogue or versions changed.`);
  const scenario = composeScenario(plan, { ...ctx, overrides: saved.overrides });
  if (digestOf(scenario) !== saved.journey.digest) throw new ReopenError('journey-changed', 'The journey rebuilt differently from the saved one.');
  return { plan, scenario, saved };
}
