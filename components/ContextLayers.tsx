"use client";
import { formatHistoricalDate } from '@/lib/historicalDate';
import type { ContextFeature } from '@/lib/scenarios/contextLayers';
import type { ContextBasis } from '@/lib/scenarios/schema';

const certaintyLabel = { documented: 'Documented', approximate: 'Approximate', illustrative: 'Illustrative' } as const;
const basisLabel: Record<ContextBasis, string> = { 'ancient-evidence': 'Ancient evidence', 'modern-geometry': 'Modern geometry used as an approximation', 'point-only': 'Single point, not an extent', schematic: 'Schematic, no source geometry' };
const chip = { documented: 'border-accent text-accent', approximate: 'border-white/40 text-white/80', illustrative: 'border-white/20 text-white/50' } as const;
export function contextPeriod(feature: Pick<ContextFeature, 'time' | 'uncertaintyYears'>) {
  if (!feature.time) return 'Landform · present throughout';
  const { start, end } = feature.time;
  return `${formatHistoricalDate(start)}${end ? ` – ${formatHistoricalDate(end)}` : ''}${feature.uncertaintyYears ? ` (±${feature.uncertaintyYears} years)` : ''}`;
}
export const CertaintyChip = ({ certainty }: { certainty: ContextFeature['certainty'] }) => <span className={`rounded-full border px-1.5 py-px text-[9px] uppercase tracking-wider ${chip[certainty]}`}>{certaintyLabel[certainty]}</span>;

/** Layers date-filtered out of the current view, named so the omission is visible. */
export function LeftOut({ features, year }: { features: ContextFeature[]; year: string }) {
  const out = features.filter(f => f.match === 'outside');
  if (!out.length) return null;
  // A title that already says when the feature was built keeps its own wording rather than a bare start date.
  return <p role="note" className="mt-2 text-[11px] leading-relaxed text-white/55">Not shown at {year}: {out.map(f => /\(.*\d.*\)$/.test(f.title) ? f.title : `${f.title} (${f.time ? `from ${formatHistoricalDate(f.time.start)}` : 'undated'})`).join('; ')}.</p>;
}
/** A switchable group of map layers (the AD 100 land-use zoning), listed with the others when it is on. */
export interface LayerGroup { title: string; on: boolean; onChange(on: boolean): void; features: ContextFeature[] }
export function ContextLayerList({ features, onInspect, group }: { features: ContextFeature[]; onInspect(id: string): void; group?: LayerGroup }) {
  const shown = features.filter(f => f.match !== 'outside'), grouped = group?.on ? group.features.filter(f => f.match !== 'outside') : [];
  if (!shown.length && !group) return null;
  const item = (f: ContextFeature) => <li key={f.id}><button className="flex w-full items-center justify-between gap-2 text-left underline-offset-2 hover:underline" onClick={() => onInspect(f.id)}><span>{f.title}</span><CertaintyChip certainty={f.certainty} /></button></li>;
  return <details className="mt-3 text-[11px] text-white/65">
    <summary className="cursor-pointer text-accent">Map layers ({shown.length + grouped.length}) · solid outline documented, dashed approximate, pale illustrative</summary>
    {group && <label className="mt-2 flex items-center gap-1.5 text-white/80"><input type="checkbox" checked={group.on} onChange={e => group.onChange(e.target.checked)} />{group.title}</label>}
    {grouped.length > 0 && <ul aria-label={group!.title} className="mt-1 space-y-1 border-l border-white/10 pl-2">{grouped.map(item)}</ul>}
    <ul className="mt-2 space-y-1">{shown.map(item)}</ul>
  </details>;
}
/** `aside` docks the card at the screen's right edge, clear of a full-screen view such as the 2D plan. */
export function ContextInspector({ feature, year, onClose, aside = false }: { feature: ContextFeature; year: string; onClose(): void; aside?: boolean }) {
  return <section aria-label="Map layer evidence" className={`pointer-events-auto absolute inset-x-3 z-30 overflow-y-auto rounded-2xl border border-panel-border bg-panel p-4 text-xs shadow-xl backdrop-blur-md sm:inset-x-auto sm:w-[300px] ${aside ? 'bottom-3 max-h-[45dvh] sm:bottom-auto sm:right-4 sm:top-16 sm:max-h-[calc(100dvh-88px)]' : 'top-28 max-h-[calc(100dvh-292px)] sm:top-20 sm:max-h-[calc(100dvh-260px)] sm:right-[calc(4rem+min(340px,calc(100vw-76px))+12px)]'}`}>
    <div className="flex items-start justify-between gap-2"><h2 className="text-sm font-medium leading-snug">{feature.title}</h2><button aria-label="Close layer evidence" className="text-white/60 hover:text-white" onClick={onClose}>✕</button></div>
    <div className="mt-2"><CertaintyChip certainty={feature.certainty} /></div>
    <dl className="mt-2 space-y-1 text-white/70">
      <div><dt className="inline text-white/45">Basis · </dt><dd className="inline">{basisLabel[feature.basis]}</dd></div>
      <div><dt className="inline text-white/45">Date range · </dt><dd className="inline">{contextPeriod(feature)}</dd></div>
      <div><dt className="inline text-white/45">At {year} · </dt><dd className="inline">{{ within: 'within the date range', possible: 'possibly present; the date range is uncertain', outside: 'outside the date range' }[feature.match]}</dd></div>
    </dl>
    <p className="mt-2 leading-relaxed text-white/65">{feature.note}</p>
    {feature.sources.length > 0 && <ul className="mt-2 space-y-1">{feature.sources.map(s => <li key={s.id}><a href={s.url} target="_blank" rel="noreferrer" className="text-[10px] text-accent underline">{s.title}</a>{s.licence && <span className="block text-[10px] text-white/40">{s.licence}</span>}</li>)}</ul>}
  </section>;
}
