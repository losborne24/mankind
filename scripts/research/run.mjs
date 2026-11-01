// Phase 5C: runs the research pipeline for one place as far as it can, then says exactly what is needed next. Resumable: every
// step reads its state from disk (snapshots, claims drafts, reviews, the blueprint draft, the published file), so the same command
// is run again after each pause. It stops only where a person is needed: pasting chat replies (manual mode), and the two reviews.
//   node scripts/research/run.mjs --place ostia --year 100 [--title Ostia --lng 12.2923 --lat 41.7556 --radius 2] [--reviewer "Name"]
// Steps: fetch (only if no snapshots) ─► extract claims ─► review claims ─► draft blueprint ─► review blueprint ─► publish ─► queue.
// Options:
//   --mode manual|live|record|replay   default: MANKIND_AI_MODE, else live with a key, else manual (paste into a chat app)
//   --source "claude.ai"               where manual replies come from (recorded on the claims)
//   --chunk 25                         sources per manual prompt
//   --reviewer "Name"                  review pending drafts here, one by one (y accept, n reject, s skip, q stop); without it they are listed
//   --partial                          draft from the claims accepted so far, without waiting for every source
//   --redraft                          draft again (after more claims were accepted)
// Nothing is accepted automatically: a review always needs a named person's answer.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { loadTypescript } from '../lib/load-typescript.mjs';
const mod = async path => import(await loadTypescript(path));
const { runAi, aiMode } = await mod('lib/ai/boundary');
const { batchPrompt, parseBatchReply } = await mod('lib/ai/manual');
const { claimsTask, placeDocuments, verifyClaims, CLAIMS_SCHEMA, CLAIMS_VERSION } = await mod('lib/ai/claims');
const { readDraft, saveDraft, status, review } = await mod('lib/ai/review');
const { digestOf } = await mod('lib/plan/digest');

const opt = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
const flag = name => process.argv.includes(name);
const place = opt('--place'), year = Number(opt('--year'));
if (!place || !Number.isInteger(year)) { console.error('Usage: run.mjs --place <slug> --year <astronomical year> [--title T --lng X --lat Y --radius km] [--reviewer "Name"] [--mode manual|live|record|replay] [--partial] [--redraft]'); process.exit(2); }
const mode = opt('--mode') ?? (aiMode() === 'off' ? 'manual' : aiMode()), source = opt('--source', process.env.MANKIND_AI_MANUAL_SOURCE ?? 'chat-app'), chunk = Number(opt('--chunk', '25'));
const reviewer = opt('--reviewer')?.trim(), draftId = `draft-${place}`, sourceDir = `data/history/${place}/source`, batches = `data/ai/manual/batches/${place}`;
if (!['manual', 'live', 'record', 'replay'].includes(mode)) { console.error(`Unknown mode ${mode}`); process.exit(2); }
const again = () => `node scripts/research/run.mjs ${process.argv.slice(2).map(a => /\s/.test(a) ? `"${a}"` : a).join(' ')}`;
const step = (n, title) => console.log(`\n── ${n}. ${title}`);
const stop = (why, next = again()) => { console.log(`\nStopped: ${why}\nNext: ${next}`); process.exit(0); };
const node = (script, args, env = {}) => spawnSync(process.execPath, [script, ...args], { stdio: 'inherit', env: { ...process.env, ...env } }).status;

// Answers for the reviews, read line by line so they can also be piped in.
const lines = createInterface({ input: process.stdin })[Symbol.asyncIterator]();
const ask = async question => { process.stdout.write(question); const next = await lines.next(); if (next.done) return undefined; if (!process.stdin.isTTY) process.stdout.write(`${next.value}\n`); return next.value.trim(); };
const year$ = y => y === null || y === undefined ? '?' : y < 1 ? `${1 - y} BCE` : `AD ${y}`;

// 1. Sources. Network access happens only here, and only when the place has no snapshots yet.
step(1, 'Sources');
if (!existsSync(`${sourceDir}/manifest.json`)) {
  const lng = opt('--lng'), lat = opt('--lat');
  if (!lng || !lat) stop(`${place} has no fetched sources.`, `${again()} --title "<name>" --lng <longitude> --lat <latitude> [--radius 2]`);
  if (node('scripts/research/fetch-place.mjs', ['--title', opt('--title', place), '--lng', lng, '--lat', lat, '--radius', opt('--radius', '2'), '--slug', place]) !== 0) stop('the fetch failed (see above).');
}
const manifest = JSON.parse(readFileSync(`${sourceDir}/manifest.json`, 'utf8')), docs = placeDocuments(place), title = opt('--title', manifest.place.title);
const draftKey = d => d.sourceId.replace(/^source:/, '');
console.log(`${title}: ${docs.length} source documents (${manifest.entries.map(e => `${e.records} ${e.source}`).join(', ')}), fetched ${manifest.fetchedAt.slice(0, 10)}.`);

// 2. Claims: one draft per source document. Sources already drafted are never asked again.
step(2, `Claims (${mode})`);
let pending = docs.filter(d => !readDraft('claims', draftKey(d)));
const keep = (doc, raw, extractedBy) => {
  const result = { ...verifyClaims(doc, claimsTask(doc).validate(raw)), extractedBy, promptVersion: CLAIMS_VERSION };
  saveDraft('claims', draftKey(doc), result);
  return result;
};
if (mode === 'manual') {
  // Fixed chunks over the sorted documents, so a reply always belongs to the same file. A filled reply is imported, then set aside.
  mkdirSync(batches, { recursive: true });
  const chunks = Array.from({ length: Math.ceil(docs.length / chunk) }, (_, k) => docs.slice(k * chunk, (k + 1) * chunk));
  chunks.forEach((all, k) => {
    const base = `${batches}/claims-${String(k + 1).padStart(2, '0')}`, reply = `${base}.reply.txt`;
    if (existsSync(reply) && readFileSync(reply, 'utf8').trim()) {
      let answers;
      try { answers = parseBatchReply(readFileSync(reply, 'utf8')); } catch (e) { console.log(`${reply}: ${e.message}; fix or replace the reply.`); return; }
      let kept = 0, drafted = 0;
      for (const doc of all.filter(d => !readDraft('claims', draftKey(d)) && answers.has(d.sourceId))) {
        try { kept += keep(doc, answers.get(doc.sourceId), `manual:${source}`).accepted.length; drafted++; } catch (e) { console.log(`  ${doc.sourceId}: ${e.message}`); }
      }
      renameSync(reply, `${base}.imported-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
      console.log(`Imported ${reply}: ${drafted} sources, ${kept} claims kept.`);
    }
    const left = all.filter(d => !readDraft('claims', draftKey(d)));
    if (left.length) {
      writeFileSync(`${base}.prompt.md`, batchPrompt({ task: 'claims', promptVersion: CLAIMS_VERSION, system: claimsTask(left[0]).system, schema: CLAIMS_SCHEMA }, left.map(d => ({ id: d.sourceId, user: d.text }))));
      if (!existsSync(reply)) writeFileSync(reply, '');
    }
  });
  pending = docs.filter(d => !readDraft('claims', draftKey(d)));
  const open = readdirSync(batches).filter(f => /^claims-\d+\.prompt\.md$/.test(f) && chunks[Number(f.slice(7, 9)) - 1].some(d => pending.includes(d)));
  if (pending.length && !flag('--partial')) stop(`${pending.length} of ${docs.length} sources have no claims yet. Paste each prompt into a chat app and save its whole reply beside it:\n${open.map(f => `  ${batches}/${f}  →  ${f.replace('.prompt.md', '.reply.txt')}`).join('\n')}`, `${again()}${opt('--source') ? '' : ' --source "<chat app and model>"'}`);
} else {
  for (const doc of pending) {
    const r = await runAi(claimsTask(doc), { mode });
    if (!r.ok) { if (r.error === 'over-budget' || r.error === 'disabled') stop(r.message); console.log(`  ${doc.sourceId}: ${r.error}: ${r.message}`); continue; }
    try { console.log(`  ${doc.sourceId}: ${keep(doc, r.value, r.record.servedBy ?? r.record.model).accepted.length} claims kept`); } catch (e) { console.log(`  ${doc.sourceId}: ${e.message}`); }
  }
  pending = docs.filter(d => !readDraft('claims', draftKey(d)));
  if (pending.length && !flag('--partial')) stop(`${pending.length} sources failed extraction (see above); running again retries them.`);
}
const drafts = docs.map(d => ({ doc: d, key: draftKey(d), draft: readDraft('claims', draftKey(d)) })).filter(x => x.draft);
console.log(`${drafts.length} of ${docs.length} sources extracted; ${drafts.reduce((n, x) => n + x.draft.accepted.length, 0)} claims kept, ${drafts.reduce((n, x) => n + x.draft.discarded.length, 0)} discarded by verification.`);

// 3. Claims review. Drafts with no verified claims have nothing to decide.
step(3, 'Claims review');
const showClaims = ({ doc, draft }) => [`${doc.title} · ${doc.sourceId} · ${doc.url} · by ${draft.extractedBy ?? '?'}`,
  ...draft.accepted.map(c => `  - ${c.feature} (${c.kind}${c.coordinate ? ` at ${c.coordinate.map(v => v.toFixed(4)).join(', ')}` : ''}, ${year$(c.existence.startYear)}–${year$(c.existence.endYear)}, ${c.confidence}): "${c.quote.length > 140 ? `${c.quote.slice(0, 140)}…` : c.quote}"`),
  ...(draft.discarded.length ? [`  (${draft.discarded.length} discarded: ${[...new Set(draft.discarded.map(d => d.reason))].join('; ')})`] : [])].join('\n');
const undecided = () => drafts.filter(x => x.draft.accepted.length && status('claims', x.key) === 'draft');
if (reviewer) {
  for (const x of undecided()) {
    console.log(`\n${showClaims(x)}`);
    const answer = await ask('Accept these claims? [y]es [n]o [s]kip [q]uit: ');
    if (answer === undefined || answer === 'q') break;
    if (answer === 'y') review('claims', x.key, 'accepted', reviewer, '');
    else if (answer === 'n') review('claims', x.key, 'rejected', reviewer, (await ask('Why (optional): ')) ?? '');
  }
}
const decided = drafts.filter(x => x.draft.accepted.length && status('claims', x.key) !== 'draft');
console.log(`${decided.filter(x => status('claims', x.key) === 'accepted').length} accepted, ${decided.filter(x => status('claims', x.key) === 'rejected').length} rejected, ${undecided().length} awaiting review.`);
if (undecided().length && !flag('--partial')) stop(`${undecided().length} claims drafts await review.${reviewer ? '' : ` First few:\n\n${undecided().slice(0, 3).map(showClaims).join('\n\n')}`}`, reviewer ? again() : `${again()} --reviewer "<your name>"`);
const accepted = drafts.filter(x => status('claims', x.key) === 'accepted').flatMap(x => x.draft.accepted);
if (!accepted.length) stop('no claims are accepted, so there is nothing to draft from.');

// 4. Blueprint draft, from every accepted claim for the place.
step(4, 'Blueprint draft');
let blueprint = readDraft('blueprint', draftId);
const missed = blueprint ? accepted.filter(c => c.coordinate && !JSON.stringify(blueprint).includes(c.id)) : [];
if (!blueprint || flag('--redraft')) {
  if (node('scripts/ai/draft-blueprint.mjs', ['--place', place, '--title', title, '--year', String(year)], { MANKIND_AI_MODE: mode, MANKIND_AI_MANUAL_SOURCE: source }) !== 0) stop('drafting did not finish (see above). In manual mode, paste the prompt it names into a chat app and save the reply beside it.', again().replace(/ --redraft\b/, ''));
  blueprint = readDraft('blueprint', draftId);
} else if (missed.length) console.log(`The draft does not use ${missed.length} claims accepted since it was made; add --redraft to draft again.`);
const report = (() => { try { return JSON.parse(readFileSync(`docs/previews/phase5b/draft-eval-${place}.json`, 'utf8')); } catch { return undefined; } })();
const summary = `${blueprint.title}: ${blueprint.features.length} features${report ? ` (${report.features.documented} documented, ${report.features.inferred} inferred), Checkpoint A ${report.checkpointA.errors.length} errors, ${report.checkpointA.warnings} warnings` : ''}.`;
console.log(summary);

// 5. Blueprint review.
step(5, 'Blueprint review');
if (status('blueprint', draftId) === 'draft' && reviewer) {
  for (const f of blueprint.features) console.log(`  - ${f.title} (${f.kind}, ${f.evidence.certainty})`);
  const answer = await ask(`Accept ${draftId} into the app? [y]es [n]o [s]kip: `);
  if (answer === 'y') review('blueprint', draftId, 'accepted', reviewer, '');
  else if (answer === 'n') review('blueprint', draftId, 'rejected', reviewer, (await ask('Why (optional): ')) ?? '');
}
const verdict = status('blueprint', draftId);
console.log(`${draftId}: ${verdict}.`);
if (verdict === 'draft') stop(`${draftId} awaits review. Inspect it with: node scripts/ai/review.mjs show blueprint ${draftId}`, reviewer ? again() : `${again()} --reviewer "<your name>"`);
if (verdict === 'rejected') stop(`${draftId} was rejected. Accept more claims or adjust them, then draft again.`, `${again()} --redraft`);

// 6. Publish, if the accepted draft is not already what the app loads.
step(6, 'Publish');
const published = JSON.parse(readFileSync('lib/plan/accepted/blueprints.json', 'utf8')).find(b => b.id === blueprint.id);
if (published && digestOf(published) === digestOf(blueprint)) console.log(`${blueprint.id} is already published.`);
else if (node('scripts/research/publish-accepted.mjs', []) !== 0) stop('publishing failed (see above).');

// 7. What the place still lacks.
step(7, 'Remaining gaps');
node('scripts/research/queue.mjs', [JSON.stringify({ place: { id: blueprint.place.id }, year })]);
console.log(`Done: ${title} plans from its published blueprint. Reload the app (or restart the dev server) to load it.`);
process.exit(0);
