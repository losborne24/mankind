// Phase 5B/5C: drafts a blueprint from accepted claims (scripts/ai/review.mjs), checks it with Checkpoint A and saves it as a draft.
// Without --place it drafts Rome's frame and scores it against the golden Rome blueprint (step 10's measure). With --place it drafts
// a place fetched by scripts/research/fetch-place.mjs (its frame is the fetch radius). Once a person accepts the draft, the same
// script plans and composes a journey for it; scripts/research/publish-accepted.mjs then puts it in the app.
//   MANKIND_AI_MODE=manual node scripts/ai/draft-blueprint.mjs --place ostia --title "Ostia" --year 100
//   MANKIND_AI_MODE=record node scripts/ai/draft-blueprint.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { loadTypescript } from '../lib/load-typescript.mjs';
const mod = async path => import(await loadTypescript(path));
const { runAi, aiMode } = await mod('lib/ai/boundary');
const { draftTask, assembleDraft, scoreDraft, DRAFT_VERSION } = await mod('lib/ai/draft');
const { placeDocuments, pleiadesDocuments, sourceEntries } = await mod('lib/ai/claims');
const { acceptedClaims, saveDraft, status } = await mod('lib/ai/review');
const { goldenBlueprints } = await mod('lib/plan/golden/blueprints');
const { BlueprintStore, inside } = await mod('lib/plan/store');
const { blueprintIssues } = await mod('lib/plan/checkpointA');
const { planScenario } = await mod('lib/plan/planner');
const { composeScenario } = await mod('lib/plan/composer');
const { readAssetCatalogue } = await mod('lib/assets/catalogue');
const opt = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
const out = opt('--out', 'docs/previews/phase5b'), place = opt('--place');
if (aiMode() === 'off') { console.error('AI is off: set MANKIND_AI_MODE=manual (chat app) or ANTHROPIC_API_KEY with MANKIND_AI_MODE=live|record|replay.'); process.exit(2); }
const golden = goldenBlueprints(), rome = golden.find(b => b.id === 'blueprint:rome');
let frame, draftId, docs, compareTo;
if (place) {
  const manifest = JSON.parse(readFileSync(`data/history/${place}/source/manifest.json`, 'utf8')), [lng, lat] = manifest.place.centre, km = manifest.place.radiusKm;
  const dx = km * 1000 / (Math.cos(lat * Math.PI / 180) * 111320), dy = km * 1000 / 110950, year = Number(opt('--year', '100')), title = opt('--title', manifest.place.title);
  draftId = `draft-${place}`;
  frame = { id: `blueprint:${draftId}`, title: `${title} c. ${year < 1 ? `${1 - year} BCE` : `AD ${year}`} (drafted from fetched sources)`, placeId: `place:${place}`, placeTitle: title, aliases: [title, manifest.place.title].filter((v, i, a) => a.indexOf(v) === i),
    lod: opt('--lod', 'city'), bounds: [lng - dx, lat - dy, lng + dx, lat + dy], applicability: { start: { year } }, traditions: opt('--tradition', 'roman') ? [opt('--tradition', 'roman')] : [], anchor: [lng, lat] };
  docs = placeDocuments(place);
} else {
  draftId = 'draft-rome-pleiades'; compareTo = rome; docs = pleiadesDocuments();
  frame = { id: 'blueprint:draft-rome-pleiades', title: 'Rome c. AD 100 (drafted from Pleiades claims)', placeId: 'place:draft/rome-pleiades', placeTitle: 'Rome (drafted)', aliases: [], lod: 'city', bounds: rome.bounds, applicability: rome.applicability, traditions: ['roman'] };
}
const ids = new Set(docs.map(d => d.sourceId)), claims = acceptedClaims().filter(c => ids.has(c.sourceId) && c.coordinate && inside(frame.bounds, c.coordinate));
if (!claims.length) { console.error('No accepted claims inside the frame: extract claims (extract-claims.mjs or manual-batch.mjs), then accept them with review.mjs.'); process.exit(2); }
const r = await runAi(draftTask(frame, claims));
if (!r.ok) { console.error(`${r.error}: ${r.message}`); process.exit(1); }
const draft = assembleDraft(frame, claims, r.value, sourceEntries(docs), place ? `data/history/${place}/source/sources.json` : 'data/plan/drafts/sources.json');
const catalogue = readAssetCatalogue(), store = new BlueprintStore([...golden, draft]);
const issues = blueprintIssues(draft, { store, catalogue }), path = saveDraft('blueprint', draftId, draft);
const report = { promptVersion: DRAFT_VERSION, at: new Date().toISOString(), servedBy: r.record.servedBy, claims: claims.length, draft: path, checkpointA: { errors: issues.filter(i => i.severity === 'error'), warnings: issues.filter(i => i.severity === 'warning').length },
  features: { documented: draft.features.filter(f => f.id.startsWith('documented:')).length, inferred: draft.features.filter(f => f.id.startsWith('inferred:')).length }, ...(compareTo ? { score: scoreDraft(draft, compareTo, claims) } : {}), costUsd: r.record.costUsd, review: status('blueprint', draftId) };
if (report.review === 'accepted') {
  const plan = planScenario({ schema: 1, place: { id: frame.placeId }, time: frame.applicability, scope: 'auto', intent: 'tour' }, { store, catalogue });
  report.plan = { id: plan.id, status: plan.status, ok: plan.validation.ok, ready: plan.components.filter(c => c.state === 'ready').length, gaps: plan.gaps.length };
  if (plan.validation.ok) report.journey = composeScenario(plan, { store, catalogue }).id;
}
mkdirSync(out, { recursive: true }); writeFileSync(`${out}/draft-eval${place ? `-${place}` : ''}.json`, JSON.stringify(report, null, 2) + '\n');
console.log(report);
