// Phase 5B testing without an API key: batches a task into one prompt to paste into a chat app (Claude or ChatGPT), then grades
// the pasted reply with the same validators and scorers as the API path. Reports are labelled with the reply's source.
//   node scripts/ai/manual-batch.mjs export interpret [--limit N]
//   node scripts/ai/manual-batch.mjs import interpret data/ai/manual/batches/interpret.reply.txt --source "claude.ai"
//   node scripts/ai/manual-batch.mjs export claims --only forum-boarium,portunus,hercules-victor      (or --from 0 --count 15)
//   node scripts/ai/manual-batch.mjs import claims data/ai/manual/batches/claims.reply.txt --source "chatgpt"
//   node scripts/ai/manual-batch.mjs export claims --place ostia --from 0 --count 20     (a place fetched by scripts/research/fetch-place.mjs)
// Prompts and replies live in data/ai/manual/batches/ (git-ignored). Import also saves claim drafts for review.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { loadTypescript } from '../lib/load-typescript.mjs';
const mod = async path => import(await loadTypescript(path));
const { batchPrompt, parseBatchReply } = await mod('lib/ai/manual');
const { interpretTask, INTERPRET_SCHEMA, INTERPRET_VERSION, interpretSystem } = await mod('lib/ai/interpret');
const { gradeInterpretation, summarise } = await mod('lib/ai/evalInterpret');
const { claimsTask, pleiadesDocuments, placeDocuments, verifyClaims, scoreClaims, CLAIMS_SCHEMA, CLAIMS_VERSION } = await mod('lib/ai/claims');
const { saveDraft } = await mod('lib/ai/review');
const { defaultPlanningContext } = await mod('lib/plan/context');
const { goldenBlueprints } = await mod('lib/plan/golden/blueprints');
const [command, task, file] = process.argv.slice(2), opt = name => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const dir = 'data/ai/manual/batches', out = opt('--out') ?? 'docs/previews/phase5b', source = opt('--source') ?? 'chat-app';
const store = defaultPlanningContext().store;
const cases = () => JSON.parse(readFileSync('lib/ai/evals/interpret-cases.json', 'utf8')).cases.slice(0, Number(opt('--limit') ?? Infinity));
const docs = () => {
  // --place <slug>: the sources fetched for a new place (Phase 5C); otherwise the cached Rome/Forum Boarium Pleiades records.
  const place = opt('--place'), only = opt('--only')?.split(',').map(k => place ? k : `source:pleiades-${k}`);
  const all = (place ? placeDocuments(place) : pleiadesDocuments()).filter(d => !only || only.includes(d.sourceId));
  const from = Number(opt('--from') ?? 0); return all.slice(from, from + Number(opt('--count') ?? all.length));
};
const write = (name, text) => { mkdirSync(dir, { recursive: true }); writeFileSync(`${dir}/${name}`, text); return `${dir}/${name}`; };

if (command === 'export' && task === 'interpret') {
  const items = cases().map(c => ({ id: c.id, user: c.text }));
  const prompt = write('interpret.prompt.md', batchPrompt({ task: 'interpret', promptVersion: INTERPRET_VERSION, system: interpretSystem(store), schema: INTERPRET_SCHEMA }, items));
  if (!existsSync(`${dir}/interpret.reply.txt`)) write('interpret.reply.txt', '');
  console.log(`Paste ${prompt} (${items.length} requests, ${readFileSync(prompt, 'utf8').length} characters) into a chat app.\nSave its whole reply in ${dir}/interpret.reply.txt, then run:\n  node scripts/ai/manual-batch.mjs import interpret ${dir}/interpret.reply.txt --source "<app and model>"`);
} else if (command === 'import' && task === 'interpret') {
  const answers = parseBatchReply(readFileSync(file, 'utf8')), results = [];
  for (const c of cases()) {
    const raw = answers.get(c.id); let got;
    if (raw === undefined) got = { error: 'no answer' };
    else try { got = interpretTask(c.text, store).validate(raw); } catch (e) { got = { error: `invalid-output: ${e.message}` }; }
    const failures = gradeInterpretation(c, got);
    results.push({ id: c.id, expected: c.expect.outcome, failures, costUsd: 0, got });
    console.log(`${failures.length ? 'FAIL' : 'pass'} ${c.id}${failures.length ? `: ${failures.join('; ')}` : ''}`);
  }
  const report = { promptVersion: INTERPRET_VERSION, source: `manual:${source}`, note: 'Pasted from a chat app: its own model and settings, no API schema constraint. Measures the prompt and contract, not the production configuration.', at: new Date().toISOString(), summary: summarise(results), results };
  mkdirSync(out, { recursive: true }); writeFileSync(`${out}/interpret-eval-manual.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(report.summary, `\nReport: ${out}/interpret-eval-manual.json`);
} else if (command === 'export' && task === 'claims') {
  const items = docs().map(d => ({ id: d.sourceId, user: d.text }));
  const prompt = write('claims.prompt.md', batchPrompt({ task: 'claims', promptVersion: CLAIMS_VERSION, system: claimsTask(docs()[0]).system, schema: CLAIMS_SCHEMA }, items));
  if (!existsSync(`${dir}/claims.reply.txt`)) write('claims.reply.txt', '');
  console.log(`Paste ${prompt} (${items.length} sources) into a chat app.\nSave its reply in ${dir}/claims.reply.txt, then run:\n  node scripts/ai/manual-batch.mjs import claims ${dir}/claims.reply.txt --source "<app and model>"${opt('--place') ? ` --place ${opt('--place')}` : ''}${opt('--only') ? ` --only ${opt('--only')}` : ''}${opt('--from') ? ` --from ${opt('--from')}` : ''}${opt('--count') ? ` --count ${opt('--count')}` : ''}`);
} else if (command === 'import' && task === 'claims') {
  const answers = parseBatchReply(readFileSync(file, 'utf8')), results = [], errors = [];
  for (const doc of docs()) {
    const raw = answers.get(doc.sourceId);
    if (raw === undefined) { errors.push({ sourceId: doc.sourceId, error: 'no answer' }); continue; }
    let claims; try { claims = claimsTask(doc).validate(raw); } catch (e) { errors.push({ sourceId: doc.sourceId, error: e.message }); continue; }
    const result = { ...verifyClaims(doc, claims), extractedBy: `manual:${source}`, promptVersion: CLAIMS_VERSION }; results.push(result);
    saveDraft('claims', doc.sourceId.replace(/^source:/, ''), result);
    console.log(`${doc.sourceId}: ${result.accepted.length} kept, ${result.discarded.length} discarded${result.discarded.length ? ` (${[...new Set(result.discarded.map(d => d.reason))].join('; ')})` : ''}`);
  }
  const report = { promptVersion: CLAIMS_VERSION, source: `manual:${source}`, note: 'Pasted from a chat app; claims verified against the cached sources and saved as drafts for review.', at: new Date().toISOString(), errors, score: scoreClaims(results, goldenBlueprints()) };
  mkdirSync(out, { recursive: true }); writeFileSync(`${out}/claims-eval-manual.json`, JSON.stringify(report, null, 2) + '\n');
  console.log({ precision: report.score.precision, recall: report.score.recall, accepted: report.score.accepted, discarded: report.score.discarded, errors: errors.length }, `\nReport: ${out}/claims-eval-manual.json. Review drafts with scripts/ai/review.mjs.`);
} else {
  console.error('Usage: export|import interpret|claims [reply file] [--source label] [--limit N | --only keys | --from N --count N]');
  process.exit(2);
}
