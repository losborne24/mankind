import type { ContentGap, ScenePlan } from '@/lib/plan/contracts';
import { timeLabel } from '@/lib/plan/chronology';
import { slugify } from '@/lib/research/sources';

/**
 * The research queue (Phase 5C): a plan's gaps as concrete tasks, each with the allow-listed sources that could close it and the
 * command that starts it. Nothing here fetches or decides; it says what to do next. Model requests are listed but deferred:
 * Phase 5C acquires sources first, and models follow once that works.
 */
export type ResearchKind = 'fetch-place' | 'date-evidence' | 'coverage' | 'model' | 'review';
export interface ResearchTask { kind: ResearchKind; title: string; gapIds: string[]; sources: string[]; command?: string; note: string }

export function researchTasks(plan: ScenePlan): ResearchTask[] {
  const tasks: ResearchTask[] = [], ids = (gs: ContentGap[]) => gs.map(g => g.id);
  // A place without a blueprint: fetch its sources, extract claims, review, draft, review, publish.
  if (plan.reuse.case === 'typology-elsewhere' && !('id' in plan.request.place)) {
    const p = plan.request.place, slug = slugify(p.title), gaps = plan.gaps.filter(g => g.kind === 'spatial' && g.blocking);
    tasks.push({ kind: 'fetch-place', title: `Sources for ${p.title}`, gapIds: ids(gaps), sources: ['Wikidata', 'Pleiades', 'Wikipedia', 'OpenStreetMap'],
      command: `node scripts/research/fetch-place.mjs --title "${p.title}" --lng ${p.coordinate[0]} --lat ${p.coordinate[1]} --radius 2 --slug ${slug}`,
      note: `Then: node scripts/ai/manual-batch.mjs export claims --place ${slug} (or extract-claims with a key), review the claims, draft with scripts/ai/draft-blueprint.mjs --place ${slug} --year ${plan.request.time.start.year}, review the draft, and publish with scripts/research/publish-accepted.mjs.` });
  }
  // Dates the blueprint cannot confirm at the requested time: dated evidence per feature, grouped.
  const dates = plan.gaps.filter(g => g.kind === 'chronology' && g.subject.feature);
  if (dates.length) tasks.push({ kind: 'date-evidence', title: `Dated evidence for ${dates.length} feature${dates.length === 1 ? '' : 's'} at ${timeLabel(plan.request.time)}`, gapIds: ids(dates), sources: ['Wikidata (inception, dissolved)', 'Wikipedia', 'Pleiades'],
    note: `Features: ${dates.slice(0, 8).map(g => g.title.replace(/^Confirm /, '').replace(/ at .*$/, '')).join(', ')}${dates.length > 8 ? `, and ${dates.length - 8} more` : ''}. Fetch their sources, extract dated claims, and record a dated revision as a derived layer of the blueprint.` });
  const blueprintDate = plan.gaps.filter(g => g.kind === 'chronology' && !g.subject.feature);
  if (blueprintDate.length) tasks.push({ kind: 'date-evidence', title: blueprintDate[0].title, gapIds: ids(blueprintDate), sources: ['Wikidata', 'Pleiades', 'Wikipedia'], note: blueprintDate[0].needed.join(' ') });
  const coverage = plan.gaps.filter(g => g.kind === 'coverage' || (g.kind === 'spatial' && !g.blocking && !g.subject.feature));
  for (const g of coverage) tasks.push({ kind: 'coverage', title: g.title, gapIds: [g.id], sources: g.title.match(/settlement/i) ? ['Pleiades (settlement list)', 'Wikidata'] : g.title.match(/road/i) ? ['Pleiades (roads)', 'OpenStreetMap (surviving roads)'] : ['Wikidata', 'Pleiades'], note: g.needed.join(' ') });
  const models = plan.assetRequests;
  if (models.length) tasks.push({ kind: 'model', title: `${models.length} model request${models.length === 1 ? '' : 's'}`, gapIds: ids(plan.gaps.filter(g => g.assetRequestId)), sources: [], note: 'Deferred: Phase 5C acquires sources first; finding and ingesting openly licensed models follows.' });
  return tasks;
}
