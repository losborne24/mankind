// Phase 5B step 10: drafts a blueprint for Rome's frame from accepted claims (scripts/ai/review.mjs), checks it with Checkpoint A,
// saves it as a draft and scores it against the golden Rome blueprint. Once a person accepts the draft, the same script plans and
// composes a journey for it. Costs money in live/record mode.
//   MANKIND_AI_MODE=record node scripts/ai/draft-blueprint.mjs [--out docs/previews/phase5b]
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadTypescript } from '../lib/load-typescript.mjs';
const mod = async path => import(await loadTypescript(path));
const { runAi, aiMode } = await mod('lib/ai/boundary');
const { draftTask, assembleDraft, scoreDraft, DRAFT_VERSION } = await mod('lib/ai/draft');
const { acceptedClaims, saveDraft, status } = await mod('lib/ai/review');
const { goldenBlueprints } = await mod('lib/plan/golden/blueprints');
const { BlueprintStore, inside } = await mod('lib/plan/store');
const { blueprintIssues } = await mod('lib/plan/checkpointA');
const { planScenario } = await mod('lib/plan/planner');
const { composeScenario } = await mod('lib/plan/composer');
const { readAssetCatalogue } = await mod('lib/assets/catalogue');
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'docs/previews/phase5b';
if (aiMode() === 'off') { console.error('AI is off: set ANTHROPIC_API_KEY (and MANKIND_AI_MODE=live|record|replay).'); process.exit(2); }
const golden = goldenBlueprints(), rome = golden.find(b => b.id === 'blueprint:rome');
const frame = { id: 'blueprint:draft-rome-pleiades', title: 'Rome c. AD 100 (drafted from Pleiades claims)', placeId: 'place:draft/rome-pleiades', placeTitle: 'Rome (drafted)', aliases: [], lod: 'city', bounds: rome.bounds, applicability: rome.applicability, traditions: ['roman'] };
const claims = acceptedClaims().filter(c => c.coordinate && inside(frame.bounds, c.coordinate));
if (!claims.length) { console.error('No accepted claims inside the frame: run extract-claims.mjs, then accept drafts with review.mjs.'); process.exit(2); }
const r = await runAi(draftTask(frame, claims));
if (!r.ok) { console.error(`${r.error}: ${r.message}`); process.exit(1); }
const draft = assembleDraft(frame, claims, r.value), catalogue = readAssetCatalogue(), store = new BlueprintStore([...golden, draft]);
const issues = blueprintIssues(draft, { store, catalogue }), path = saveDraft('blueprint', 'draft-rome-pleiades', draft);
const report = { promptVersion: DRAFT_VERSION, at: new Date().toISOString(), claims: claims.length, draft: path, checkpointA: { errors: issues.filter(i => i.severity === 'error'), warnings: issues.filter(i => i.severity === 'warning').length }, score: scoreDraft(draft, rome, claims), costUsd: r.record.costUsd, review: status('blueprint', 'draft-rome-pleiades') };
if (report.review === 'accepted') {
  const plan = planScenario({ schema: 1, place: { id: frame.placeId }, time: { start: { year: 100 } }, scope: 'auto', intent: 'tour' }, { store, catalogue });
  report.plan = { id: plan.id, status: plan.status, ok: plan.validation.ok, ready: plan.components.filter(c => c.state === 'ready').length, gaps: plan.gaps.length };
  if (plan.validation.ok) report.journey = composeScenario(plan, { store, catalogue }).id;
}
mkdirSync(out, { recursive: true }); writeFileSync(`${out}/draft-eval.json`, JSON.stringify(report, null, 2) + '\n');
console.log(report);
