// Phase 5C research queue: plans a request and lists what research would close its gaps, with commands.
//   node scripts/research/queue.mjs '{"place":{"title":"Ostia","coordinate":[12.2923,41.7556],"tradition":"roman"},"year":100}'
//   node scripts/research/queue.mjs '{"place":{"id":"place:rome"},"year":150}'
import { loadTypescript } from '../lib/load-typescript.mjs';
const mod = async path => import(await loadTypescript(path));
const { planScenario } = await mod('lib/plan/planner');
const { defaultPlanningContext } = await mod('lib/plan/context');
const { researchTasks } = await mod('lib/research/queue');
const input = JSON.parse(process.argv[2] ?? '{}');
if (!input.place || !Number.isInteger(input.year)) { console.error('Usage: queue.mjs \'{"place": {"id": ...} | {"title", "coordinate", "tradition"?}, "year": N}\''); process.exit(2); }
const plan = planScenario({ schema: 1, place: input.place, time: { start: { year: input.year } }, scope: input.scope ?? 'auto', intent: 'tour' }, defaultPlanningContext());
console.log(`${plan.place?.title ?? 'Unresolved'} · ${plan.status} · ${plan.gaps.length} gaps\n`);
for (const t of researchTasks(plan)) console.log(`[${t.kind}] ${t.title}\n  sources: ${t.sources.join(', ') || '-'}\n${t.command ? `  run: ${t.command}\n` : ''}  ${t.note}\n`);
