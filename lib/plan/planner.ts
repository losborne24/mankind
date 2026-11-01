import type { AssetCatalogue } from '@/lib/assets/catalogueValidation';
import { resolveHistoricalAsset } from '@/lib/history/assetResolution';
import { matchHistoricalTime } from '@/lib/history/time';
import type { AssetRequest, Bounds, ContentGap, DeferredRegion, FeatureRef, PlanComponent, PlanFeature, ReuseDecision, ScenarioRequest, ScenePlan, SpatialBlueprint, SpatialLOD, Viewpoint } from '@/lib/plan/contracts';
import { lodRank, normaliseRequest } from '@/lib/plan/contracts';
import { architecturalAssetRequest, landmarkAssetRequest } from '@/lib/plan/assetRequests';
import { presence, timeLabel, withinApplicability } from '@/lib/plan/chronology';
import { centreOf } from '@/lib/plan/codecs';
import { digestOf } from '@/lib/plan/digest';
import { GENERATORS, TYPOLOGIES, generatorVersions } from '@/lib/plan/generators';
import { applyOverrides, type BlueprintOverride } from '@/lib/plan/overrides';
import { checkpointA } from '@/lib/plan/checkpointA';
import { intersects, type BlueprintStore, type GazetteerEntry } from '@/lib/plan/store';
import type { Coordinate } from '@/lib/scenarios/schema';

export const PLANNER_VERSION = '5a.1';
/** 3D scenes the app can render today, by dataset (ScenarioPanel registers the Forum Boarium world only). */
export const RENDERABLE_SCENES: Record<string, string[]> = { 'forum-boarium': ['scene:forum-boarium-temples'] };
export interface PlanningContext { store: BlueprintStore; catalogue: AssetCatalogue; overrides?: readonly BlueprintOverride[]; renderable?: Record<string, string[]> }

/**
 * What a blueprint at each scale must hold to show its place, and what to ask for when it does not. Gaps are raised only at the
 * focus's own scale, so an empire request asks for provinces and roads, never for each city's buildings.
 */
const REQUIRED: Record<SpatialLOD, { id: string; title: string; has: (fs: PlanFeature[]) => boolean; needed: string[]; kind: ContentGap['kind'] }[]> = {
  empire: [
    { id: 'provinces', title: 'Provincial and frontier geometry', kind: 'coverage', has: fs => fs.some(f => f.kind === 'zone' || f.kind === 'extent'), needed: ['Dated, sourced province and frontier lines for the requested date'] },
    { id: 'roads', title: 'Empire road network', kind: 'coverage', has: fs => fs.some(f => f.kind === 'route'), needed: ['Sourced main roads (for example the Itinerarium Antonini routes) with dates'] },
    { id: 'coast', title: 'Ancient coastline and terrain', kind: 'spatial', has: fs => fs.some(f => f.kind === 'terrain' && f.evidence.certainty !== 'unknown'), needed: ['Ancient coastline and sea level where they differ from today'] },
  ],
  region: [
    { id: 'roads', title: 'Regional road network', kind: 'coverage', has: fs => fs.some(f => f.kind === 'route'), needed: ['Sourced roads between the region\'s towns, with dates'] },
    { id: 'coast', title: 'Ancient coastline and terrain', kind: 'spatial', has: fs => fs.some(f => f.kind === 'terrain' && f.evidence.certainty !== 'unknown'), needed: ['Ancient coastline, river courses and lakes where they differ from today'] },
  ],
  city: [
    { id: 'extent', title: 'Built-up extent', kind: 'spatial', has: fs => fs.some(f => f.kind === 'extent'), needed: ['Approximate continuous-city extent for the date'] },
    { id: 'zoning', title: 'Land-use zoning', kind: 'spatial', has: fs => fs.some(f => f.kind === 'zone'), needed: ['Dated land-use zones'] },
    { id: 'roads', title: 'Streets and roads', kind: 'spatial', has: fs => fs.some(f => f.kind === 'route'), needed: ['Main streets or roads with sources'] },
    { id: 'landmarks', title: 'Landmarks', kind: 'evidence', has: fs => fs.some(f => f.kind === 'landmark'), needed: ['Sourced monument positions and sizes'] },
  ],
  neighbourhood: [
    { id: 'streets', title: 'Streets and open spaces', kind: 'spatial', has: fs => fs.some(f => f.kind === 'open-space' || f.kind === 'route'), needed: ['Street lines and squares'] },
    { id: 'buildings', title: 'Buildings', kind: 'spatial', has: fs => fs.some(f => f.kind === 'building' || f.kind === 'landmark' || f.kind === 'structure'), needed: ['Building footprints or a reconstruction layout'] },
  ],
  site: [
    { id: 'model', title: 'Specific building model', kind: 'asset', has: fs => fs.some(f => f.rung === 1), needed: ['A reviewed, catalogue-pinned model of the structure'] },
  ],
  architectural: [],
};
const PITCH: Record<SpatialLOD, number> = { empire: 0, region: 0, city: 45, neighbourhood: 55, site: 58, architectural: 60 };

export function viewpointFor(bounds: Bounds, lod: SpatialLOD): Viewpoint {
  const [lng, lat] = centreOf(bounds), kx = Math.cos(lat * Math.PI / 180) * 111320;
  const span = Math.max((bounds[2] - bounds[0]) * kx, (bounds[3] - bounds[1]) * 110950, 1);
  const zoom = Math.min(19.1, Math.max(2, Math.log2(156543.03 * Math.cos(lat * Math.PI / 180) * 700 / span)));
  return { center: [round(lng, 6), round(lat, 6)], zoom: round(zoom, 2), pitch: PITCH[lod], bearing: 0 };
}
const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
const around = ([lng, lat]: Coordinate, metres: number): Bounds => { const dx = metres / (Math.cos(lat * Math.PI / 180) * 111320), dy = metres / 110950; return [lng - dx, lat - dy, lng + dx, lat + dy]; };
const featureBounds = (f: PlanFeature): Bounds | undefined => f.geometry.bbox ?? (f.geometry.anchor ? around(f.geometry.anchor, 60) : undefined);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Pure and deterministic: the same request, blueprints, catalogue and versions give the same plan, byte for byte. */
export function planScenario(input: unknown, ctx: PlanningContext): ScenePlan {
  const request = normaliseRequest(input), { store, catalogue } = ctx, overrides = ctx.overrides ?? [], renderable = ctx.renderable ?? RENDERABLE_SCENES;
  const view = (b: SpatialBlueprint) => applyOverrides(b, overrides).blueprint;
  const gaps = new Map<string, ContentGap>(), requests = new Map<string, AssetRequest>(), components: PlanComponent[] = [], deferred: DeferredRegion[] = [], absent: ScenePlan['absent'] = [];
  const revisions: ScenePlan['revisions'] = { added: [], removed: [], unconfirmed: [] };
  const gap = (g: Omit<ContentGap, 'id' | 'refs'> & { refs?: ContentGap['refs'] }) => {
    const id = `gap:${g.kind}:${slug(g.subject.feature ?? g.subject.blueprint ?? g.subject.place ?? '')}:${slug(g.title)}`;
    if (!gaps.has(id)) gaps.set(id, { id, refs: [], ...g });
    return id;
  };

  // 1. Place.
  let entry: GazetteerEntry | undefined, elsewhere: { title: string; coordinate: Coordinate; tradition?: string } | undefined;
  if ('id' in request.place) entry = store.resolvePlace(request.place.id);
  else {
    const named = store.resolvePlace(request.place.title), b = named && store.require(named.blueprint);
    if (named && b && request.place.coordinate[0] >= b.bounds[0] - 0.05 && request.place.coordinate[0] <= b.bounds[2] + 0.05 && request.place.coordinate[1] >= b.bounds[1] - 0.05 && request.place.coordinate[1] <= b.bounds[3] + 0.05) entry = named;
    else elsewhere = request.place;
  }

  let focus: SpatialBlueprint | undefined, lod: SpatialLOD, initialBounds: Bounds, initialTitle: string, reuse: ReuseDecision, typology: ScenePlan['typology'] = null;
  let local: SpatialBlueprint | undefined, subFeature: PlanFeature | undefined, placeInfo: ScenePlan['place'];

  if (!entry && !elsewhere) {
    // Unknown id: nothing to plan against. Never a nearest match.
    const query = 'id' in request.place ? request.place.id : request.place.title;
    gap({ kind: 'place', lod: request.scope === 'auto' ? 'city' : request.scope, title: `Unknown place: ${query}`, detail: `No blueprint or registered place is named "${query}". Nothing nearby is substituted.`, subject: { place: query }, needed: ['A registered place with sourced location, or a coordinate and title for a new place'], blocking: true });
    return finish({ status: 'unresolved', lod: request.scope === 'auto' ? 'empire' : request.scope, initial: { title: 'The globe', bounds: [-180, -60, 180, 75], viewpoint: { center: [0, 20], zoom: 1.5, pitch: 0, bearing: 0 } }, reuse: { case: 'none', detail: 'No place resolved.', reused: 0, revalidated: 0, rejected: 0 } });
  }

  if (elsewhere) {
    // 4th reuse case: a place with no blueprint. Context from the finest frame containing it; typology by tradition only.
    const context = store.containing(elsewhere.coordinate)[0];
    lod = request.scope === 'auto' ? 'city' : request.scope;
    placeInfo = { id: `place:new/${slug(elsewhere.title)}`, title: elsewhere.title };
    initialBounds = around(elsewhere.coordinate, lodRank(lod) <= lodRank('city') ? 3000 : 300); initialTitle = elsewhere.title;
    const tradition = elsewhere.tradition ?? context?.traditions[0];
    const t = tradition && Object.hasOwn(TYPOLOGIES, tradition) ? TYPOLOGIES[tradition as keyof typeof TYPOLOGIES] : undefined;
    if (t && matchHistoricalTime(t.period, request.time) !== 'outside') typology = { tradition: tradition!, rules: [...t.rules], kits: [...t.kits] };
    gap({ kind: 'spatial', lod, title: `No blueprint for ${elsewhere.title}`, detail: `There is no ${lod} layout for ${elsewhere.title}${context ? ` inside ${context.title}` : ''}. ${typology ? `${tradition} typologies and kits can be reused, but no other place's streets or landmark positions.` : 'No typology covers this tradition and date.'}`, subject: { place: placeInfo.id }, needed: ['Sourced extent and dated features for the place', 'Street or road lines', 'Landmark positions with sources'], blocking: true });
    if (!typology) gap({ kind: 'coverage', lod, title: 'No building typology for this tradition and date', detail: `No registered kit or rule set covers ${tradition ?? 'an unstated tradition'} at ${timeLabel(request.time)}.`, subject: { place: placeInfo.id }, needed: ['A reviewed kit for the building tradition'], blocking: false });
    if (context) { deferred.push({ title: context.title, lod: context.lod, bounds: context.bounds, blueprint: { id: context.id, version: context.version }, reason: 'Context frame only; the new place is not part of it.' }); focus = undefined; }
    reuse = { case: 'typology-elsewhere', ...(context ? { blueprint: { id: context.id, version: context.version } } : {}), detail: typology ? `Reuses the ${typology.tradition} typology (rules and kits) only.` : 'Nothing reusable for this tradition and date.', reused: typology ? typology.rules.length + typology.kits.length : 0, revalidated: 0, rejected: 0 };
    return finish({ status: 'partial', lod, initial: { title: initialTitle, bounds: initialBounds, viewpoint: viewpointFor(initialBounds, lod) }, reuse, context: context ? [context, ...store.ancestors(context)] : [] });
  }

  // 2. Focus and scope.
  let base = view(store.require(entry!.blueprint));
  placeInfo = { id: entry!.placeId, title: entry!.title };
  if (entry!.feature) subFeature = base.features.find(f => f.id === entry!.feature);
  const naturalLod: SpatialLOD = subFeature ? 'site' : base.lod;
  lod = request.scope === 'auto' ? naturalLod : request.scope;
  if (!subFeature && lodRank(lod) < lodRank(base.lod)) {
    const up = store.ancestors(base).find(a => a.lod === lod);
    if (up) base = view(up);
    else gap({ kind: 'coverage', lod, title: `No ${lod} blueprint contains ${entry!.title}`, detail: `${entry!.title} has no ${lod}-scale parent blueprint.`, subject: { place: entry!.placeId }, needed: [`A ${lod}-scale frame containing ${entry!.title}`], blocking: true });
  } else if (!subFeature && lodRank(lod) > lodRank(base.lod)) {
    const below = (b: SpatialBlueprint): SpatialBlueprint[] => store.children(b).flatMap(c => [c, ...below(c)]);
    const candidates = below(base).filter(c => c.lod === lod && withinApplicability(c, request.time));
    const chosen = candidates.find(c => c.place.id === request.target || c.id === request.target) ?? (candidates.length === 1 ? candidates[0] : undefined);
    if (chosen) base = view(chosen);
    else gap({ kind: 'spatial', lod, title: `No ${lod} blueprint chosen in ${base.title}`, detail: candidates.length ? `${candidates.length} ${lod} blueprints exist; name one as the target.` : `${base.title} has no ${lod}-scale blueprint for ${timeLabel(request.time)}.`, subject: { blueprint: base.id }, needed: [`A ${lod}-scale blueprint`], blocking: lod !== 'architectural' });
  }
  focus = base;
  // A site's setting is its neighbourhood: shown as local detail, not deferred.
  if (focus.lod === 'site' && focus.parent) local = view(store.require(focus.parent));
  const ancestors = store.ancestors(focus);

  // 3. Components: chronology, catalogue identity and representation of every feature in scope.
  const same = withinApplicability(focus, request.time);
  const atOwn = { start: focus.applicability.start, ...(focus.applicability.end ? { end: focus.applicability.end } : {}) };
  const consider = (b: SpatialBlueprint, f: PlanFeature, scope: 'focus' | 'local') => {
    const ref: FeatureRef = { blueprint: b.id, feature: f.id }, p = presence(f, b, request.time);
    if (scope === 'focus' && !same) {
      const before = presence(f, b, atOwn);
      if (p.present === 'yes' && before.present !== 'yes') revisions.added.push(ref);
      if (p.present === 'no' && before.present === 'yes') revisions.removed.push(ref);
      if (p.present === 'unconfirmed') revisions.unconfirmed.push(ref);
    }
    if (p.present === 'no' && f.kind === 'fill' && scope === 'focus' && !same && presence(f, b, atOwn).present === 'yes') {
      // Generated layers are tied to their date. The city still needs one: missing, with what would regenerate it.
      const id = gap({ kind: 'spatial', lod: b.lod, title: `${f.title} for ${timeLabel(request.time)}`, detail: `${p.reason} It cannot be reused at another date; regenerating it needs zoning for ${timeLabel(request.time)}.`, subject: { blueprint: b.id, feature: f.id }, needed: [`Land-use zoning for ${timeLabel(request.time)}`, 'Regenerated fill reviewed against it'], blocking: false, refs: f.refs });
      components.push({ ref, title: f.title, kind: f.kind, state: 'missing', rung: f.rung, match: p.match, reason: p.reason, gapIds: [id] });
      return;
    }
    if (p.present === 'no') { absent.push({ ref, title: f.title, reason: p.reason }); return; }
    if (p.present === 'unconfirmed') {
      const id = gap({ kind: 'chronology', lod: b.lod, title: `Confirm ${f.title} at ${timeLabel(request.time)}`, detail: p.reason, subject: { blueprint: b.id, feature: f.id }, needed: [`A dated source for ${f.title} at ${timeLabel(request.time)}`], blocking: false, refs: f.refs });
      components.push({ ref, title: f.title, kind: f.kind, state: 'missing', rung: f.rung, match: p.match, reason: p.reason, gapIds: [id] });
      return;
    }
    const component: PlanComponent = { ref, title: f.title, kind: f.kind, state: 'ready', rung: f.rung, match: p.match, reason: p.reason };
    if (f.rung === 1 && f.asset?.catalogue) {
      const entryPlace = catalogue.entries.find(e => e.id === f.asset!.catalogue!.id && e.version === f.asset!.catalogue!.version)?.placeId;
      const placeId = f.refs.find(r => r.store.startsWith('world:'))?.id ?? entryPlace ?? b.place.id;
      // A request for the site itself, or a landmark request, is the explicit interpretation choice Phase 4 requires for approximate phases.
      const explicit = request.intent === 'landmark' || b.lod === 'site' || (local !== undefined && b === local);
      const binding = resolveHistoricalAsset({ id: f.id, category: 'building', catalogueRef: f.asset.catalogue, evidence: f.evidence }, placeId, request.time, catalogue, explicit);
      if (binding.status !== 'registered') {
        const id = gap({ kind: 'asset', lod: b.lod, title: `${f.title}: model unavailable at ${timeLabel(request.time)}`, detail: binding.reason ?? `Catalogue binding is ${binding.status}.`, subject: { blueprint: b.id, feature: f.id }, needed: ['A catalogue version whose phase and rights cover the requested date'], blocking: b === focus, refs: f.refs });
        components.push({ ...component, state: 'missing', rung: 5, reason: binding.reason ?? binding.status, gapIds: [id] });
        return;
      }
      component.reason = `${p.reason} Catalogue ${f.asset.catalogue.id}@${f.asset.catalogue.version} is usable${binding.catalogue?.status === 'usable' && explicit ? ' as an explicit interpretation' : ''}.`;
      if (scope === 'focus' && b.lod === 'site') {
        const interior = architecturalAssetRequest(b, f, catalogue);
        if (interior) { requests.set(interior.id, interior); component.assetRequestId = interior.id; component.gapIds = [gap({ kind: 'asset', lod: 'architectural', title: interior.title, detail: interior.missing.join(' '), subject: { blueprint: b.id, feature: f.id }, needed: interior.missing, blocking: false, refs: interior.refs, assetRequestId: interior.id })]; }
      }
    }
    if (f.asset?.requestId && f.rung > 1) {
      const req = landmarkAssetRequest(b, f, catalogue);
      if (req) { requests.set(req.id, req); component.assetRequestId = req.id; component.gapIds = [gap({ kind: 'asset', lod: b.lod, title: req.title, detail: req.detail, subject: { blueprint: b.id, feature: f.id }, needed: req.missing, blocking: false, refs: req.refs, assetRequestId: req.id })]; }
    }
    const generator = b.generators.find(g => g.id === f.id);
    if (generator) {
      const current = GENERATORS[generator.generator as keyof typeof GENERATORS];
      if (!current || current.version !== generator.version) {
        const id = gap({ kind: 'spatial', lod: b.lod, title: `${f.title}: generator out of date`, detail: `${generator.generator} ${generator.version} is not the current version${current ? ` (${current.version})` : ''}; regenerate before use.`, subject: { blueprint: b.id, feature: f.id }, needed: ['Regenerate and review the layer'], blocking: false });
        components.push({ ...component, state: 'missing', gapIds: [id] }); return;
      }
      component.reason = `${p.reason} Reproduced by ${generator.generator} v${generator.version} (output ${generator.outputDigest.slice(0, 12)}).`;
    }
    components.push(component);
  };

  if (subFeature) {
    // Within an existing blueprint: the landmark and what stands round it; the rest of the city is deferred context.
    const bounds = around(subFeature.geometry.anchor!, 150);
    initialBounds = around(subFeature.geometry.anchor!, 80); initialTitle = subFeature.title;
    for (const f of focus.features) if (f === subFeature || (f.kind !== 'zone' && f.kind !== 'fill' && f.kind !== 'water' && f.kind !== 'extent' && featureBounds(f) && intersects(featureBounds(f)!, bounds))) consider(focus, f, 'focus');
    gap({ kind: 'spatial', lod: 'site', title: `No site blueprint for ${subFeature.title}`, detail: `${subFeature.title} exists only as a feature of ${focus.title}; a site-scale plan (footprint, approaches, setting) has not been made.`, subject: { blueprint: focus.id, feature: subFeature.id }, needed: ['A site-scale blueprint as a child of the city', 'A sourced plan of the monument'], blocking: false, refs: subFeature.refs });
    // Part of the focus blueprint is planned, so the rest is an area, not a deferred blueprint.
    deferred.push({ title: `Rest of ${focus.title}`, lod: focus.lod, bounds: focus.bounds, reason: `City context for the approach (${focus.id}@${focus.version}); its detail is not needed for the first scene.` });
  } else {
    for (const f of focus.features) consider(focus, f, 'focus');
    if (local) for (const f of local.features) consider(local, f, 'local');
    const extent = focus.features.find(f => f.kind === 'extent' && presence(f, focus!, request.time).present === 'yes');
    const target = request.target ? [...focus.features, ...(local?.features ?? [])].find(f => f.id === request.target) : undefined;
    initialBounds = target && featureBounds(target) ? featureBounds(target)! : extent?.geometry.bbox ?? focus.bounds;
    initialTitle = target?.title ?? (extent ? extent.title : focus.title);
    for (const req of REQUIRED[focus.lod]) if (!req.has(focus.features.filter(f => presence(f, focus!, request.time).present !== 'no'))) gap({ kind: req.kind, lod: focus.lod, title: `${req.title} for ${focus.place.title}`, detail: `${focus.title} holds no ${req.title.toLowerCase()} for ${timeLabel(request.time)}.`, subject: { blueprint: focus.id }, needed: req.needed, blocking: false });
    if (lodRank(focus.lod) <= lodRank('region')) {
      const settlements = components.filter(c => c.kind === 'settlement' && c.state === 'ready').map(c => c.title);
      gap({ kind: 'coverage', lod: focus.lod, title: `Settlement coverage in ${focus.place.title}`, detail: `${settlements.length ? `Only ${settlements.join(', ')} ${settlements.length === 1 ? 'is' : 'are'} registered` : 'No settlement is registered'} at this scale for ${timeLabel(request.time)}. Other cities and towns are not covered; they are not invented.`, subject: { blueprint: focus.id }, needed: ['A sourced, dated settlement list for the frame (for example from Pleiades)'], blocking: false });
    }
    if (!same) gap({ kind: 'chronology', lod: focus.lod, title: `${focus.title} describes ${timeLabel(atOwn)}`, detail: `The blueprint was made for ${timeLabel(atOwn)}. Features whose own dates cover ${timeLabel(request.time)} are reused; generated layers and undated survivals are not assumed.`, subject: { blueprint: focus.id }, needed: [`A ${timeLabel(request.time)} revision as a derived layer of ${focus.id}@${focus.version}`], blocking: false });
    // Children: valid finer detail, deferred, unless they do not exist at the date.
    for (const child of store.children(focus)) {
      if (matchHistoricalTime(child.applicability, request.time) === 'outside') absent.push({ ref: { blueprint: child.id, feature: child.place.id }, title: child.title, reason: `${child.title} covers ${timeLabel({ start: child.applicability.start, ...(child.applicability.end ? { end: child.applicability.end } : {}) })} only.` });
      else if (child !== local) deferred.push({ title: child.title, lod: child.lod, bounds: child.bounds, blueprint: { id: child.id, version: child.version }, reason: 'Finer detail exists and is valid; it is not needed for the first scene.' });
    }
    // City districts without a blueprint of their own are refinement areas, not gaps.
    if (focus.lod === 'city') for (const m of focus.features.filter(f => f.kind === 'marker' && /^Regio /.test(f.title) && presence(f, focus!, request.time).present === 'yes'))
      deferred.push({ title: `${m.title} · neighbourhood detail`, lod: 'neighbourhood', bounds: around(m.geometry.anchor!, 500), reason: 'No neighbourhood blueprint yet; planned only when refinement is requested. The area is 500 m round the region marker.' });
  }
  for (const a of ancestors) if (a !== local) deferred.push({ title: a.title, lod: a.lod, bounds: a.bounds, blueprint: { id: a.id, version: a.version }, reason: 'Context for the approach; its own detail is not needed for the first scene.' });

  // 4. Scenes the composer may request: from the nearest blueprint with a renderable scene at this date.
  const scenes: ScenePlan['scenes'] = [];
  if (lodRank(focus.lod) >= lodRank('neighbourhood') && !subFeature) for (const b of [focus, ...ancestors]) {
    const world = b.layers.find(l => l.role === 'world'), dataset = world?.output.match(/fixtures\/(.+)\.json$/)?.[1];
    const found = !dataset ? [] : (world!.collections.scenes as { id: string; period: { start: { year: number }; end?: { year: number }; approximate?: boolean }; layoutIds: string[] }[]).filter(s => renderable[dataset]?.includes(s.id) && s.layoutIds.length === 1 && (matchHistoricalTime(s.period, request.time) === 'within' || (matchHistoricalTime(s.period, request.time) === 'possible' && withinApplicability(b, request.time))));
    if (found.length) { scenes.push(...found.map(s => ({ dataset: dataset!, sceneId: s.id, layoutId: s.layoutIds[0], blueprint: b.id }))); break; }
  }

  const reused = components.filter(c => c.state === 'ready').length, rejected = components.filter(c => c.state === 'missing').length + revisions.removed.length;
  reuse = same
    ? { case: subFeature ? 'within-existing' : 'same-place-same-date', blueprint: { id: focus.id, version: focus.version }, detail: subFeature ? `${subFeature.title} planned inside ${focus.title}; its context is reused.` : `${focus.title} reused as stored; nothing regenerated.`, reused, revalidated: 0, rejected: 0 }
    : { case: 'same-place-other-date', blueprint: { id: focus.id, version: focus.version }, detail: `${focus.title} revalidated for ${timeLabel(request.time)}: ${revisions.added.length} added, ${revisions.removed.length} removed, ${revisions.unconfirmed.length} unconfirmed. Stable geography reused unchanged.`, reused, revalidated: components.length + absent.length, rejected };
  const blocking = [...gaps.values()].some(g => g.blocking) || components.some(c => c.state === 'missing' && c.gapIds?.some(id => gaps.get(id)?.blocking));
  return finish({ status: blocking ? 'partial' : components.some(c => c.state === 'missing') ? 'partial' : 'ready', lod: subFeature || focus.lod === lod ? lod : focus.lod, initial: { title: initialTitle, bounds: initialBounds, viewpoint: viewpointFor(initialBounds, lodRank(lod) > lodRank(focus.lod) ? lod : focus.lod) }, reuse, focus, context: [...(local ? [local, ...store.ancestors(local)] : ancestors)], scenes });

  function finish(o: { status: ScenePlan['status']; lod: SpatialLOD; initial: ScenePlan['initial']; reuse: ReuseDecision; focus?: SpatialBlueprint; context?: SpatialBlueprint[]; scenes?: ScenePlan['scenes'] }): ScenePlan {
    const usedBlueprints = [...new Map([...(o.focus ? [o.focus] : []), ...(o.context ?? [])].map(b => [`${b.id}@${b.version}`, b])).values()];
    const body: Omit<ScenePlan, 'id' | 'validation'> = {
      schema: 1, request, status: o.status, ...(placeInfo ? { place: placeInfo } : {}), ...(o.focus ? { focus: { id: o.focus.id, version: o.focus.version } } : {}),
      context: (o.context ?? []).map(b => ({ id: b.id, version: b.version })), lod: o.lod, initial: o.initial,
      components, gaps: [...gaps.values()], assetRequests: [...requests.values()].sort((a, b) => a.id.localeCompare(b.id)), deferred, absent, reuse: o.reuse, revisions, typology, scenes: o.scenes ?? [],
      versions: { schema: 1, planner: PLANNER_VERSION, catalogue: digestOf(catalogue), blueprints: usedBlueprints.map(b => ({ id: b.id, version: b.version, digest: store.digest(b) })).sort((a, b) => a.id.localeCompare(b.id)), generators: generatorVersions() },
    };
    const plan = { ...body, id: `plan:${digestOf(body).slice(0, 20)}`, validation: { checkpoint: 'A' as const, ok: true, issues: [], checked: [] } } as ScenePlan;
    plan.validation = checkpointA(plan, ctx);
    return plan;
  }
}

/** The ScenarioRequest a structured form produces; Phase 5B's text interpreter must produce the same shape. */
export function structuredRequest(placeId: string, year: number, scope: ScenarioRequest['scope'] = 'auto', target?: string): ScenarioRequest {
  return normaliseRequest({ schema: 1, place: { id: placeId }, time: { start: { year } }, scope, intent: target ? 'landmark' : 'tour', ...(target ? { target } : {}) });
}
export const planDigest = (plan: ScenePlan) => digestOf(plan);
