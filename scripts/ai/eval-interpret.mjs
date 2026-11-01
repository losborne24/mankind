// Phase 5B step 8 eval: runs lib/ai/evals/interpret-cases.json through the interpreter and grades it deterministically.
// Costs money in live/record mode (each case is one capped call). Usage:
//   MANKIND_AI_MODE=record node scripts/ai/eval-interpret.mjs [--limit N] [--out docs/previews/phase5b]
// `record` also saves each response under lib/ai/recordings/, so later runs can replay it for free (MANKIND_AI_MODE=replay).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { loadTypescript } from '../lib/load-typescript.mjs';
const mod = async path => import(await loadTypescript(path));
const { runAi, aiMode } = await mod('lib/ai/boundary');
const { interpretTask, INTERPRET_VERSION } = await mod('lib/ai/interpret');
const { gradeInterpretation, summarise } = await mod('lib/ai/evalInterpret');
const { defaultPlanningContext } = await mod('lib/plan/context');
const args = process.argv.slice(2), opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const mode = aiMode(), limit = Number(opt('--limit') ?? Infinity), out = opt('--out') ?? 'docs/previews/phase5b';
if (mode === 'off') { console.error('AI is off: set ANTHROPIC_API_KEY (and MANKIND_AI_MODE=live|record|replay).'); process.exit(2); }
const { cases } = JSON.parse(readFileSync('lib/ai/evals/interpret-cases.json', 'utf8')), store = defaultPlanningContext().store, results = [];
for (const c of cases.slice(0, limit)) {
  const r = await runAi(interpretTask(c.text, store));
  const failures = gradeInterpretation(c, r.ok ? r.value : { error: `${r.error}: ${r.message}` });
  results.push({ id: c.id, expected: c.expect.outcome, failures, costUsd: r.record.costUsd, got: r.ok ? r.value : { error: r.error, message: r.message } });
  console.log(`${failures.length ? 'FAIL' : 'pass'} ${c.id}${failures.length ? `: ${failures.join('; ')}` : ''}`);
}
const report = { promptVersion: INTERPRET_VERSION, mode, model: 'claude-opus-5-5', at: new Date().toISOString(), summary: summarise(results), results };
mkdirSync(out, { recursive: true }); writeFileSync(`${out}/interpret-eval.json`, JSON.stringify(report, null, 2) + '\n');
console.log(report.summary);
