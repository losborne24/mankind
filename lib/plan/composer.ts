import type { CameraCommand, Certainty, ContextCertainty, ContextInfo, Coordinate, ScenarioDefinition, ScenarioOverlay } from '@/lib/scenarios/schema';
import { validateScenario } from '@/lib/scenarios/schema';
import type { PlanFeature, ScenePlan } from '@/lib/plan/contracts';
import { lodRank } from '@/lib/plan/contracts';
import { timeLabel } from '@/lib/plan/chronology';
import { applyOverrides } from '@/lib/plan/overrides';
import { viewpointFor, type PlanningContext } from '@/lib/plan/planner';
import { sourceIndex } from '@/lib/plan/sources';
import { featureCoordinates } from '@/lib/plan/store';

export const COMPOSER_VERSION = '5a.1';
/**
 * Datasets that host a blueprint's existing presentation in the app: the Rome AD 100 zoning toggle, 2D plan and zoned fill appear on
 * journeys of the Forum Boarium dataset, so plans in that chain are composed onto it rather than given a new renderer.
 */
export const PRESENTATION_DATASET: Record<string, string> = { 'blueprint:rome': 'forum-boarium', 'blueprint:forum-boarium': 'forum-boarium', 'blueprint:temple-of-portunus': 'forum-boarium', 'blueprint:temple-of-hercules-victor': 'forum-boarium' };

const certainty: Record<PlanFeature['evidence']['certainty'], Certainty> = { documented: 'established', inferred: 'illustrative', illustrative: 'illustrative', unknown: 'unverified' };
const contextCertainty: Record<PlanFeature['evidence']['certainty'], ContextCertainty> = { documented: 'approximate', inferred: 'approximate', illustrative: 'illustrative', unknown: 'illustrative' };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * A validated plan as a journey the existing player runs: approach over the parent, arrive at the planned starting view (requesting
 * the plan's 3D scenes there), state what is missing and deferred, then free exploration. Nothing is hand-authored; every marker,
 * layer and card comes from ready components and their evidence. Throws if the plan failed Checkpoint A or resolved no place.
 */
export function composeScenario(plan: ScenePlan, ctx: PlanningContext): ScenarioDefinition {
  if (!plan.validation.ok) throw Error('Plan failed Checkpoint A; it cannot be composed.');
  if (plan.status === 'unresolved') throw Error('Plan resolved no place; there is nothing to compose.');
  const { store, catalogue } = ctx, overrides = ctx.overrides ?? [];
  const pinned = new Map(plan.versions.blueprints.map(b => [b.id, applyOverrides(store.require(b), overrides).blueprint]));
  const index = sourceIndex(store.all(), catalogue), used = new Set<string>();
  // Journeys cite public sources only; a repository document (project rules) stays a plan reference.
  const cite = (ids: string[]) => ids.filter(id => /^https?:\/\//.test(index.get(id)?.url ?? '')).map(id => (used.add(id), id));
  const ready = plan.components.filter(c => c.state === 'ready').map(c => ({ c, b: pinned.get(c.ref.blueprint)!, f: pinned.get(c.ref.blueprint)!.features.find(f => f.id === c.ref.feature)! }));
  const frame = [...pinned.values()].filter(b => plan.components.some(c => c.ref.blueprint === b.id)).sort((a, b) => lodRank(a.lod) - lodRank(b.lod))[0];
  const bounds = frame?.bounds ?? plan.initial.bounds, inFrame = ([x, y]: Coordinate) => x >= bounds[0] && x <= bounds[2] && y >= bounds[1] && y <= bounds[3];

  const locations: ScenarioDefinition['content']['locations'] = [], geometries: NonNullable<ScenarioDefinition['content']['geometries']> = [], layerIds: string[] = [];
  for (const { f, b } of ready) {
    // A feature known only from its construction was confirmed by the planner up to the requested date: say so, rather than a single year.
    const sources = cite(f.evidence.sources), time = !f.existence ? undefined : f.chronology === 'from-start' ? { start: f.existence.start, end: plan.moment.time.end ?? plan.moment.time.start } : { start: f.existence.start, ...(f.existence.end ? { end: f.existence.end } : {}) };
    const ctxCertainty = sources.length ? contextCertainty[f.evidence.certainty] : 'illustrative';
    // The same place id in a site and its neighbourhood is one place: the focus's record (listed first) is kept.
    if (f.geometry.type === 'point' && f.geometry.anchor && inFrame(f.geometry.anchor) && !locations.some(l => l.id === f.id)) {
      const context: ContextInfo = { certainty: ctxCertainty, basis: 'point-only', style: f.kind === 'marker' || f.kind === 'settlement' ? 'orientation' : 'structure', ...(time ? { time } : {}), ...(time && f.existence?.uncertaintyYears ? { uncertaintyYears: f.existence.uncertaintyYears } : {}), note: f.evidence.note };
      locations.push({ id: f.id, title: f.title, coordinate: f.geometry.anchor, certainty: sources.length ? certainty[f.evidence.certainty] : 'illustrative', sources, context });
      layerIds.push(`layer:${f.id}`);
    }
    // Map layers drawn as they are stored: the context layer's records are already scenario geometries.
    if (f.record && b.layers.find(l => l.id === f.record!.layer)?.codec === 'forum-context@1' && f.geometry.type !== 'point') {
      const row = b.layers.find(l => l.id === f.record!.layer)!.collections[f.record.collection][f.record.index] as NonNullable<ScenarioDefinition['content']['geometries']>[number];
      geometries.push({ ...row, id: f.id, sources: cite(row.sources) });
      layerIds.push(`layer:${f.id}`);
    }
    if (f.kind === 'extent' && f.geometry.type === 'polygon') {
      const ring = featureCoordinates(b, f) as Coordinate[];
      geometries.push({ id: f.id, title: f.title, kind: 'line', coordinates: [ring.filter(inFrame)], sources: [], certainty: 'illustrative', basis: 'schematic', style: 'extent', ...(time ? { time } : {}), note: f.evidence.note, short: 'Continuous city' });
      layerIds.push(`layer:${f.id}`);
    }
  }

  const by = (s: string) => ready.filter(r => r.f.evidence.certainty === s).length, rung = (n: number) => ready.filter(r => r.c.rung === n).length;
  // One model may stand for a building in several layers (site record, neighbourhood object, world place): count models, not records.
  const models = new Set(ready.flatMap(r => r.c.rung === 1 && r.f.asset?.catalogue ? [`${r.f.asset.catalogue.id}@${r.f.asset.catalogue.version}`] : [])).size;
  const missing = plan.components.filter(c => c.state === 'missing');
  // Blocking and coverage gaps first; model requests are summarised by count rather than listed one by one.
  const order: Record<string, number> = { place: 0, coverage: 1, spatial: 2, evidence: 3, chronology: 4, asset: 5 };
  const listed = plan.gaps.filter(g => g.kind !== 'asset' || !g.assetRequestId).sort((a, b) => Number(b.blocking) - Number(a.blocking) || order[a.kind] - order[b.kind]);
  const parent = plan.context[0] && store.get(plan.context[0]);
  const focusTitle = plan.place?.title ?? plan.initial.title, when = timeLabel(plan.moment.time);
  const topSources = cite([...new Set(ready.filter(r => r.f.evidence.certainty === 'documented').flatMap(r => r.f.evidence.sources))]).slice(0, 8);
  const cards: ScenarioOverlay[] = [
    ...(parent ? [{ id: 'card:approach', type: 'card' as const, title: parent.title, text: plan.components.some(c => c.ref.blueprint === parent.id) ? `${focusTitle} stands in ${parent.title}, shown round it as its setting.` : `${focusTitle} lies within ${parent.title}. The approach shows it as context; its own detail is deferred.` }] : []),
    { id: 'card:shown', type: 'card', title: `${plan.initial.title} · ${when}`, text: `Shown: ${plural(by('documented'), 'documented feature')}, ${by('inferred')} inferred, ${by('illustrative')} illustrative${by('unknown') ? ` and ${by('unknown')} modern-default` : ''}. ${models ? `${plural(models, 'specific model')} from the catalogue, ` : ''}${rung(3) ? `${plural(rung(3), 'massing placeholder')}, ` : ''}${rung(4) + rung(5)} plan layers and markers. Tap a marker or layer for its sources and certainty.${plan.moment.chosen ? ` ${plan.moment.reason}` : ''}`, ...(topSources.length ? { sources: topSources } : {}) },
    ...(plan.gaps.length || plan.deferred.length || plan.absent.length ? [{ id: 'card:gaps', type: 'card' as const, title: 'What this scene does not show', text: [
      listed.length ? `Not yet available: ${listed.slice(0, 3).map(g => g.title).join('; ')}${listed.length > 3 ? `; and ${plural(listed.length - 3, 'more gap')}` : ''}.` : '',
      missing.length ? `${plural(missing.length, 'feature')} cannot be confirmed for ${when}.` : '',
      plan.assetRequests.length ? `${plural(plan.assetRequests.length, 'model')} requested for the content queue.` : '',
      plan.deferred.length ? `Deferred until requested: ${plan.deferred.slice(0, 2).map(d => d.title).join(', ')}${plan.deferred.length > 2 ? ` and ${plan.deferred.length - 2} more` : ''}.` : '',
      plan.absent.length ? `Not standing at ${when}: ${plan.absent.slice(0, 2).map(a => a.title).join(', ')}${plan.absent.length > 2 ? ` and ${plan.absent.length - 2} more` : ''}.` : '',
    ].filter(Boolean).join(' ') }] : []),
    { id: 'card:explore', type: 'caption', title: 'Explore', text: 'Move freely; Resume returns you to the journey. The plan review lists every ready, missing and deferred item.' },
  ];
  const overlays: ScenarioOverlay[] = [...locations.map(l => ({ id: `layer:${l.id}`, type: 'point' as const, location: l.id })), ...geometries.map(g => ({ id: `layer:${g.id}`, type: g.kind, geometry: g.id })), ...cards];

  const dataset = plan.scenes[0]?.dataset ?? [plan.focus, ...plan.context].map(r => r && PRESENTATION_DATASET[r.id]).find(Boolean);
  const scenes = plan.scenes.map((s, n) => ({ id: `scene:${n + 1}`, historicalSceneId: s.sceneId, interpretationLayoutId: s.layoutId, description: `Renderable scene from ${s.blueprint}`, certainty: 'illustrative' as const, sources: [...topSources], required: false }));
  const v = plan.initial.viewpoint, arrive: CameraCommand = { type: 'flyTo', center: v.center, zoom: v.zoom, pitch: v.pitch, bearing: v.bearing, duration: 7000 };
  const shown = [...layerIds];
  const beats: ScenarioDefinition['beats'] = [];
  if (parent) {
    const p = viewpointFor(parent.bounds, parent.lod);
    beats.push({ id: 'approach', title: parent.title, actions: [{ camera: { type: 'flyTo', transition: 'zoomPanZoom', center: p.center, zoom: p.zoom, pitch: p.pitch, bearing: p.bearing, duration: 9000 }, time: plan.moment.time, overlays: ['card:approach'] }] });
  }
  beats.push({ id: 'arrive', title: plan.initial.title, ...(scenes.length ? { sceneRequirements: scenes.map(s => s.id) } : {}), actions: [
    { camera: parent ? arrive : { ...arrive, transition: 'zoomPanZoom' }, ...(parent ? {} : { time: plan.moment.time }), overlays: ['card:shown', ...shown] },
    { camera: { type: 'hold', duration: 6000 }, overlays: ['card:shown', ...shown] }] });
  if (cards.some(c => c.id === 'card:gaps')) beats.push({ id: 'gaps', title: 'What is not shown', ...(scenes.length ? { sceneRequirements: scenes.map(s => s.id) } : {}), actions: [{ camera: { type: 'hold', duration: 8000 }, overlays: ['card:gaps', ...shown] }] });
  beats.push({ id: 'explore', title: 'Explore', ...(scenes.length ? { sceneRequirements: scenes.map(s => s.id) } : {}), explorationPrompt: 'Inspect the evidence or explore freely.', actions: [{ camera: { type: 'hold', duration: 5000 }, overlays: ['card:explore', ...shown] }] });

  const scenario: ScenarioDefinition = {
    version: 1, id: `composed-${plan.id.slice(5, 17)}`, ...(dataset ? { historicalDataset: dataset } : {}),
    title: `${focusTitle} · ${when}`,
    description: `Composed from plan ${plan.id} (${plan.status}): ${plural(ready.length, 'ready feature')}, ${plural(missing.length, 'missing feature')}, ${plural(plan.deferred.length, 'deferred area')}.`,
    scope: { bounds, time: plan.moment.time },
    content: { sources: [...used].sort().map(id => index.get(id)!), locations, routes: [], geometries, ...(scenes.length ? { scenes } : {}), overlays },
    beats,
  };
  return validateScenario(scenario);
}
