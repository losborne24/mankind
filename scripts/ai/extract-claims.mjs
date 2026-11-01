// Phase 5B step 9: extracts claims from the cached Pleiades records, keeps only verifiable ones, saves each source's result as a
// draft (data/plan/drafts/claims/) and scores agreement with the hand-curated golden blueprints. Costs money in live/record mode.
//   MANKIND_AI_MODE=record node scripts/ai/extract-claims.mjs [--only forum-boarium,portunus] [--limit N] [--out docs/previews/phase5b]
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadTypescript } from '../lib/load-typescript.mjs';
const mod = async path => import(await loadTypescript(path));
const { runAi, aiMode } = await mod('lib/ai/boundary');
const { claimsTask, pleiadesDocuments, verifyClaims, scoreClaims, CLAIMS_VERSION } = await mod('lib/ai/claims');
const { saveDraft } = await mod('lib/ai/review');
const { goldenBlueprints } = await mod('lib/plan/golden/blueprints');
const args = process.argv.slice(2), opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
if (aiMode() === 'off') { console.error('AI is off: set ANTHROPIC_API_KEY (and MANKIND_AI_MODE=live|record|replay).'); process.exit(2); }
const only = opt('--only')?.split(',').map(k => `source:pleiades-${k}`), out = opt('--out') ?? 'docs/previews/phase5b';
const docs = pleiadesDocuments().filter(d => !only || only.includes(d.sourceId)).slice(0, Number(opt('--limit') ?? Infinity));
const results = [], errors = [];
for (const doc of docs) {
  const r = await runAi(claimsTask(doc));
  if (!r.ok) { errors.push({ sourceId: doc.sourceId, error: r.error, message: r.message }); console.log(`error ${doc.sourceId}: ${r.message}`); continue; }
  const result = verifyClaims(doc, r.value);
  saveDraft('claims', doc.sourceId.replace(/^source:/, ''), result);
  results.push(result);
  console.log(`${doc.sourceId}: ${result.accepted.length} kept, ${result.discarded.length} discarded`);
}
const report = { promptVersion: CLAIMS_VERSION, at: new Date().toISOString(), sources: docs.length, errors, score: scoreClaims(results, goldenBlueprints()) };
mkdirSync(out, { recursive: true }); writeFileSync(`${out}/claims-eval.json`, JSON.stringify(report, null, 2) + '\n');
console.log({ precision: report.score.precision, recall: report.score.recall, accepted: report.score.accepted, discarded: report.score.discarded, errors: errors.length });
