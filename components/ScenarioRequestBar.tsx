"use client";
import { useMemo, useState } from 'react';
import { useScenarioController } from '@/components/ScenarioContext';
import { PlanReviewView } from '@/components/PlanReviewView';
import { SPATIAL_LODS, type ScenarioRequest, type ScenePlan, type SpatialLOD } from '@/lib/plan/contracts';
import { defaultPlanningContext } from '@/lib/plan/context';
import { composeScenario } from '@/lib/plan/composer';
import { planScenario } from '@/lib/plan/planner';
import { reopenScenario, saveScenario, scenarioBytes, type SavedScenario } from '@/lib/plan/persistence';
import { timeLabel } from '@/lib/plan/chronology';
import { fromHistoricalYearParts, type Era } from '@/lib/historicalDate';

const SAVES = 'mankind.plan.saves';
type SaveRow = { title: string; savedAt: string; saved: SavedScenario };
const readSaves = (): SaveRow[] => { try { return JSON.parse(localStorage.getItem(SAVES) ?? '[]') as SaveRow[]; } catch { return []; } };
const writeSaves = (rows: SaveRow[]) => { try { localStorage.setItem(SAVES, JSON.stringify(rows.slice(0, 12))); return true; } catch { return false; } };

/**
 * The structured request bar (Phase 5A): place, date, spatial scope and an optional target landmark. No free text is interpreted;
 * the same ScenarioRequest is what a Phase 5B text interpreter must produce. A plan is shown with its gaps before anything plays.
 */
export function ScenarioRequestBar() {
  const ctx = useMemo(() => defaultPlanningContext(), []);
  const places = useMemo(() => ctx.store.gazetteer(), [ctx]);
  const { player } = useScenarioController();
  const [open, setOpen] = useState(false), [placeId, setPlaceId] = useState('place:rome'), [year, setYear] = useState(100), [era, setEra] = useState<Era>('CE');
  const [scope, setScope] = useState<ScenarioRequest['scope']>('auto'), [target, setTarget] = useState(''), [custom, setCustom] = useState({ title: '', lng: '', lat: '', tradition: 'roman' });
  const [plan, setPlan] = useState<ScenePlan | null>(null), [error, setError] = useState(''), [review, setReview] = useState(false), [saves, setSaves] = useState<SaveRow[]>([]), [note, setNote] = useState('');
  const entry = places.find(p => p.placeId === placeId);
  const targets = useMemo(() => { const b = entry && ctx.store.get(entry.blueprint); return b && !entry.feature ? b.features.filter(f => f.kind === 'landmark').map(f => ({ id: f.id, title: f.title })) : []; }, [entry, ctx]);

  const request = (): ScenarioRequest => {
    const y = fromHistoricalYearParts(year, era);
    const place = placeId === 'custom' ? { title: custom.title.trim(), coordinate: [Number(custom.lng), Number(custom.lat)] as [number, number], ...(custom.tradition ? { tradition: custom.tradition } : {}) } : { id: placeId };
    return { schema: 1, place, time: { start: { year: y } }, scope, intent: target ? 'landmark' : 'tour', ...(target ? { target } : {}) };
  };
  const run = () => {
    setError(''); setNote('');
    try { setPlan(planScenario(request(), ctx)); } catch (e) { setPlan(null); setError((e as Error).message); }
  };
  const play = (p: ScenePlan) => {
    try { const scenario = composeScenario(p, ctx); player?.load(scenario); player?.play(); setOpen(false); }
    catch (e) { setError((e as Error).message); }
  };
  const save = (p: ScenePlan) => {
    try {
      const saved = saveScenario(p, composeScenario(p, ctx), ctx), rows = [{ title: `${p.place?.title ?? 'Plan'} · ${timeLabel(p.request.time)}`, savedAt: new Date().toISOString().slice(0, 16).replace('T', ' '), saved }, ...readSaves()];
      setNote(writeSaves(rows) ? `Saved (${(scenarioBytes(saved) / 1024).toFixed(1)} KB, references only).` : 'Could not save in this browser.'); setSaves(readSaves());
    } catch (e) { setError((e as Error).message); }
  };
  const reopen = (row: SaveRow) => {
    try { const { plan: p } = reopenScenario(row.saved, ctx); setPlan(p); setNote(`Reopened ${row.title}: same plan ${p.id}.`); setError(''); }
    catch (e) { setError(`Could not reopen: ${(e as Error).message}`); }
  };
  const field = 'mt-1 w-full rounded border border-panel-border bg-background p-1 text-xs text-white';
  const counts = plan && { ready: plan.components.filter(c => c.state === 'ready').length, missing: plan.components.filter(c => c.state === 'missing').length };

  return <div className="pointer-events-auto relative">
    <button aria-expanded={open} aria-controls="scenario-request" onClick={() => { setOpen(o => !o); setSaves(readSaves()); }}
      className="w-40 rounded-full border border-panel-border bg-panel px-4 py-1.5 text-left text-sm text-white/70 backdrop-blur-md hover:border-accent sm:w-64">
      Plan a journey…
    </button>
    {open && <section id="scenario-request" aria-label="Plan a journey" className="absolute right-0 top-11 z-30 max-h-[calc(100dvh-5rem)] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-panel-border bg-panel p-4 text-xs text-white/75 backdrop-blur-md">
      <form onSubmit={e => { e.preventDefault(); run(); }}>
        <label className="block">Place<select className={field} value={placeId} onChange={e => { setPlaceId(e.target.value); setTarget(''); setPlan(null); }}>
          {SPATIAL_LODS.map(lod => { const group = places.filter(p => p.lod === lod && !p.feature); return group.length ? <optgroup key={lod} label={lod}>{group.map(p => <option key={p.placeId} value={p.placeId}>{p.title}</option>)}</optgroup> : null; })}
          <optgroup label="landmarks without a blueprint">{places.filter(p => p.feature).map(p => <option key={p.placeId} value={p.placeId}>{p.title}</option>)}</optgroup>
          <option value="custom">Another place (coordinates)…</option>
        </select></label>
        {placeId === 'custom' && <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="col-span-2 block">Title<input className={field} value={custom.title} onChange={e => setCustom({ ...custom, title: e.target.value })} required/></label>
          <label className="block">Longitude<input className={field} inputMode="decimal" value={custom.lng} onChange={e => setCustom({ ...custom, lng: e.target.value })} required/></label>
          <label className="block">Latitude<input className={field} inputMode="decimal" value={custom.lat} onChange={e => setCustom({ ...custom, lat: e.target.value })} required/></label>
          <label className="col-span-2 block">Building tradition<select className={field} value={custom.tradition} onChange={e => setCustom({ ...custom, tradition: e.target.value })}><option value="roman">Roman</option><option value="">Unknown</option></select></label>
        </div>}
        <div className="mt-2 grid grid-cols-3 gap-2">
          <label className="col-span-2 block">Year<input className={field} type="number" min={1} max={2025} value={year} onChange={e => setYear(Number(e.target.value))} required/></label>
          <label className="block">Era<select className={field} value={era} onChange={e => setEra(e.target.value as Era)}><option>CE</option><option>BCE</option></select></label>
        </div>
        <label className="mt-2 block">Spatial scope<select className={field} value={scope} onChange={e => setScope(e.target.value as SpatialLOD | 'auto')}><option value="auto">The place&apos;s own scale</option>{SPATIAL_LODS.map(l => <option key={l} value={l}>{l}</option>)}</select></label>
        {targets.length > 0 && <label className="mt-2 block">Focus landmark (optional)<select className={field} value={target} onChange={e => setTarget(e.target.value)}><option value="">None</option>{targets.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label>}
        <button type="submit" className="mt-3 rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-black">Plan</button>
      </form>
      {error && <p role="alert" className="mt-3 text-red-300">{error}</p>}
      {plan && counts && <div className="mt-4 border-t border-white/10 pt-3" aria-live="polite">
        <p className="text-sm text-white">{plan.place?.title ?? 'Unresolved place'} · {timeLabel(plan.request.time)}</p>
        <p className="mt-1">{plan.lod} scale · <span className={plan.status === 'ready' ? 'text-accent' : plan.status === 'partial' ? 'text-amber-300' : 'text-red-300'}>{plan.status}</span> · Checkpoint A {plan.validation.ok ? 'passed' : 'failed'}</p>
        <p className="mt-1">{counts.ready} ready · {counts.missing} missing · {plan.deferred.length} deferred {plan.deferred.length === 1 ? 'area' : 'areas'} · {plan.assetRequests.length} {plan.assetRequests.length === 1 ? 'model' : 'models'} requested</p>
        <p className="mt-1 text-white/55">Reuse: {plan.reuse.detail}</p>
        {plan.gaps.length > 0 && <><p className="mt-2 text-white">Gaps</p><ul className="mt-1 list-disc space-y-0.5 pl-4">{[...plan.gaps].sort((a, b) => Number(b.blocking) - Number(a.blocking) || Number(a.kind === 'asset') - Number(b.kind === 'asset')).slice(0, 6).map(g => <li key={g.id} className={g.blocking ? 'text-red-300' : undefined}>{g.title}</li>)}</ul>{plan.gaps.length > 6 && <p className="text-white/45">and {plan.gaps.length - 6} more in the review</p>}</>}
        <div className="mt-3 flex flex-wrap gap-2">
          {plan.status !== 'unresolved' && plan.validation.ok && <button className="rounded-full bg-accent px-3 py-1 font-medium text-black" onClick={() => play(plan)}>Play journey</button>}
          <button className="rounded-full border border-white/20 px-3 py-1 hover:border-accent" onClick={() => { setReview(true); setOpen(false); }}>Review in 2D</button>
          {plan.status !== 'unresolved' && plan.validation.ok && <button className="rounded-full border border-white/20 px-3 py-1 hover:border-accent" onClick={() => save(plan)}>Save</button>}
        </div>
        {note && <p role="status" className="mt-2 text-white/60">{note}</p>}
      </div>}
      {saves.length > 0 && <div className="mt-4 border-t border-white/10 pt-3"><p className="text-white">Saved journeys</p>
        <ul className="mt-1 space-y-1">{saves.map(row => <li key={`${row.saved.plan.id}-${row.savedAt}`}><button className="text-accent underline" onClick={() => reopen(row)}>{row.title}</button> <span className="text-white/45">· {row.savedAt}</span></li>)}</ul></div>}
    </section>}
    {review && plan && <PlanReviewView plan={plan} ctx={ctx} onClose={() => setReview(false)}/>}
  </div>;
}
