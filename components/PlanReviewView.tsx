"use client";
import { useMemo, useState } from 'react';
import { PlanDialog } from '@/components/ZoningPlanView';
import type { ScenePlan } from '@/lib/plan/contracts';
import type { PlanningContext } from '@/lib/plan/planner';
import { REVIEW_LEGEND, REVIEW_SIZE, planReviewSvg } from '@/lib/plan/review';

/**
 * The general 2D review of a plan at any spatial scale: the drawing from planReviewSvg beside the plan's evidence lists. A click on
 * a drawn feature shows its state, representation and evidence; the lists give every gap, request, deferred area and absence.
 */
export function PlanReviewView({ plan, ctx, onClose }: { plan: ScenePlan; ctx: PlanningContext; onClose(): void }) {
  const svg = useMemo(() => planReviewSvg(plan, ctx), [plan, ctx]);
  const [selected, setSelected] = useState<string | null>(null);
  const component = selected ? plan.components.find(c => `${c.ref.blueprint}#${c.ref.feature}` === selected) : undefined;
  const feature = component && ctx.store.get(plan.versions.blueprints.find(b => b.id === component.ref.blueprint)!)?.features.find(f => f.id === component.ref.feature);
  const deferred = selected ? plan.deferred.find(d => (d.blueprint?.id ?? d.title) === selected) : undefined;
  const h = 'mt-3 text-[11px] font-medium uppercase tracking-wider text-accent';
  const aside = <aside aria-label="Plan details" className="max-h-[40dvh] shrink-0 overflow-y-auto rounded-xl border border-white/10 bg-panel p-3 text-xs text-white/75 lg:max-h-none lg:w-80">
    <p className="text-white">{plan.place?.title ?? 'Unresolved'} · {plan.lod} · {plan.status}</p>
    <p className="mt-1 text-[11px] text-white/50">Checkpoint A {plan.validation.ok ? 'passed' : 'failed'} · {plan.validation.issues.length} notes · reuse: {plan.reuse.case}</p>
    {component && <div className="mt-3 rounded-lg border border-white/10 p-2">
      <p className="text-white">{component.title}</p>
      <p className="mt-1">{component.state} · rung {component.rung} · {feature?.evidence.certainty}</p>
      <p className="mt-1 text-white/60">{component.reason}</p>
      {feature && <p className="mt-1 text-white/60">{feature.evidence.note}</p>}
      {feature && feature.evidence.sources.length > 0 && <p className="mt-1 text-[10px] text-white/45">Sources: {feature.evidence.sources.join(', ')}</p>}
    </div>}
    {deferred && <div className="mt-3 rounded-lg border border-white/10 p-2"><p className="text-white">{deferred.title}</p><p className="mt-1 text-white/60">Deferred: {deferred.reason}</p></div>}
    <h3 className={h}>Gaps ({plan.gaps.length})</h3>
    <ul className="mt-1 space-y-1">{plan.gaps.slice(0, 40).map(g => <li key={g.id}><span className={g.blocking ? 'text-red-300' : 'text-white'}>{g.title}</span> <span className="text-white/45">· {g.kind} · {g.lod}</span></li>)}</ul>
    {plan.gaps.length > 40 && <p className="text-white/45">and {plan.gaps.length - 40} more</p>}
    <h3 className={h}>Asset requests ({plan.assetRequests.length})</h3>
    <ul className="mt-1 space-y-1">{plan.assetRequests.slice(0, 20).map(r => <li key={r.id}>{r.title} <span className="text-white/45">· rung {r.currentRung} → {r.targetRung}</span></li>)}</ul>
    {plan.assetRequests.length > 20 && <p className="text-white/45">and {plan.assetRequests.length - 20} more</p>}
    <h3 className={h}>Deferred ({plan.deferred.length})</h3>
    <ul className="mt-1 space-y-1">{plan.deferred.map(d => <li key={d.title}>{d.title} <span className="text-white/45">· {d.lod}</span></li>)}</ul>
    {plan.absent.length > 0 && <><h3 className={h}>Not standing at this date ({plan.absent.length})</h3><ul className="mt-1 space-y-1">{plan.absent.map(a => <li key={`${a.ref.blueprint}#${a.ref.feature}`}>{a.title} <span className="text-white/45">· {a.reason}</span></li>)}</ul></>}
    {plan.typology && <><h3 className={h}>Reusable typology · {plan.typology.tradition}</h3><ul className="mt-1 list-disc space-y-1 pl-4">{[...plan.typology.rules, ...plan.typology.kits].map(t => <li key={t}>{t}</li>)}</ul></>}
  </aside>;
  return <PlanDialog title={`Plan review · ${plan.place?.title ?? 'unresolved'}`} label={`Plan review for ${plan.place?.title ?? 'an unresolved place'}`} hint="Tap a feature for its state and evidence"
    svg={svg} width={REVIEW_SIZE + REVIEW_LEGEND} height={REVIEW_SIZE} onInspect={setSelected} onClose={onClose} aside={aside}/>;
}
