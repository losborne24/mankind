"use client";
import { useEffect, useRef } from 'react';
import type { HistoricalInspection } from '@/lib/history/inspection';
import type { HistoricalPeriod } from '@/lib/history/schema';
import { formatHistoricalDate } from '@/lib/historicalDate';

export function formatInspectionPeriod(period: HistoricalPeriod) {
  return `${formatHistoricalDate(period.start)}${period.end ? ` – ${formatHistoricalDate(period.end)}` : ''}${period.uncertaintyYears ? ` (±${period.uncertaintyYears} years)` : ''}${period.approximate ? ' (approximate)' : ''}`;
}
export function HistoricalInspector({ inspection, onClose, onVisit, onInspectPlace }: {
  inspection: HistoricalInspection;
  onClose(): void;
  onVisit(placeId: string): void;
  onInspectPlace(placeId: string): void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const recordKey = `${inspection.key.kind}:${inspection.key.id}`;
  useEffect(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && !panel.current?.contains(active)) returnFocus.current = active;
    heading.current?.focus({ preventScroll: true });
  }, [recordKey]);
  useEffect(() => () => { if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true }); }, []);
  const matchLabel = { within: 'Matches selected date', possible: 'May overlap selected date', outside: 'Outside selected date', undated: 'Date unknown' }[inspection.match];
  const availability = { ready: 'Dated layout available', none: 'Geographic context only · no dated layout', ambiguous: 'Layout selection is ambiguous', unavailable: 'Detailed layout unavailable', outside: 'No layout at the selected date' };
  return <aside ref={panel} aria-label="Historical record" className="fixed right-3 top-16 z-30 max-h-[calc(100dvh-245px)] w-[min(370px,calc(100vw-24px))] overflow-y-auto rounded-2xl border border-panel-border bg-panel p-5 text-sm text-foreground shadow-xl backdrop-blur-md sm:right-16 sm:top-20">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-[10px] uppercase tracking-[.2em] text-accent">Historical {inspection.key.kind}</p><h2 ref={heading} tabIndex={-1} className="mt-2 text-base font-medium outline-none">{inspection.title}</h2></div>
      <button aria-label="Close historical record" className="journey-button shrink-0" onClick={onClose}>×</button>
    </div>
    {inspection.description && <p className="mt-3 text-xs leading-relaxed text-white/70">{inspection.description}</p>}
    <p className="mt-3 text-xs text-accent" role="status">{matchLabel}</p>
    <p className="mt-1 text-xs text-white/60">Selected: {formatInspectionPeriod(inspection.time)}</p>
    <p className="mt-1 text-xs text-white/60">Record: {inspection.period ? formatInspectionPeriod(inspection.period) : inspection.basis === 'dated-context' ? 'Shown through dated context; place lifespan unknown.' : 'No dated lifespan supplied.'}</p>
    <div className="mt-4 space-y-4">
      {inspection.locations.map((location, index) => <section key={`${location.placeId}:${index}`} aria-label={`Location: ${location.title}`} className="border-t border-panel-border pt-3">
        <h3 className="text-sm font-medium">{location.title}</h3><p className="mt-1 text-xs text-white/50">{location.role}</p>
        <p className="mt-2 text-xs text-white/65">{location.layoutStatus !== 'ready' && location.footprints?.some(f => f.match !== 'outside') ? '2D extent available · no reconstruction' : availability[location.layoutStatus]}</p>
        <p className="mt-1 font-mono text-[11px] text-white/50">{location.coordinate.map(value => value.toFixed(4)).join(', ')} · {location.uncertaintyMeters !== undefined ? `stated uncertainty ${location.uncertaintyMeters} m` : 'accuracy unquantified'}</p>
        {location.layouts.map((layout, i) => <p key={i} className="mt-2 text-xs text-white/60">{layout.title} · {formatInspectionPeriod(layout.period)}</p>)}
        {location.warnings.map((warning, i) => <p key={i} className="mt-2 text-xs leading-relaxed text-white/60">{warning}</p>)}
        {location.scenes?.filter(r => r.status !== 'outside-period' || location.scenes?.every(s => s.status === 'outside-period')).map(resolution => <section key={resolution.scene.id} aria-label={`Scene availability: ${resolution.scene.title}`} className="mt-3 rounded-lg border border-panel-border p-3 text-xs leading-relaxed text-white/65"><h4 className="font-medium text-white/80">{resolution.scene.title}</h4><p className="mt-1 text-accent">{{ ready: '3D layout resolved · loading handled separately', 'map-only': 'Map-only fallback', unavailable: 'Scene unavailable', 'outside-period': 'Outside selected date' }[resolution.status]}</p><p>{resolution.scene.required ? 'Required' : 'Optional'} · {formatInspectionPeriod(resolution.scene.period)}</p>{resolution.issues.map((issue, i) => <p className="mt-2" key={i}>{issue.message}</p>)}{resolution.footprintIds.length > 0 && <p className="mt-2">A 2D extent is available; it does not supply walls, heights or a model.</p>}</section>)}
        {location.referenceAreas?.map((area, i) => <div key={i} className="mt-3 text-xs leading-relaxed text-white/65"><p>{area.title}</p><p>Dashed blue outline · source reference only; no phase-specific building geometry.</p><p>{area.licence.attribution} · <a href={area.licence.url} target="_blank" rel="noreferrer" className="text-accent underline">{area.licence.title}</a></p></div>)}
        {location.catalogueModels?.map(({ entry, status, review }) => <details key={`${entry.id}:${entry.version}`} className="mt-3 rounded-lg border border-panel-border p-3 text-xs leading-relaxed text-white/65"><summary className="cursor-pointer text-white/80">Asset catalogue · version {entry.version} · {status}</summary><h4 className="mt-2 font-medium">{entry.title}</h4><p>Phase: {formatInspectionPeriod(entry.period)}</p><p>Model rights: {entry.rights.status} · {entry.rights.title}</p><p>{entry.rights.note}</p>{entry.rights.url && <p><a href={entry.rights.url} target="_blank" rel="noreferrer" className="text-accent underline">Model reuse terms</a></p>}{entry.rights.attribution && <p>{entry.rights.attribution}</p>}{review && <p className="mt-2">Reviewed {review.at} · {review.reviewer}. {review.note}</p>}{entry.features.map((feature, i) => <p key={i} className="mt-2">{feature.title} · {feature.certainty}. {feature.note}</p>)}{entry.limitations.map((note, i) => <p key={i} className="mt-2">{note}</p>)}{entry.sources.map(source => <p key={source.id} className="mt-2"><a href={source.url} target="_blank" rel="noreferrer" className="text-accent underline">{source.title}</a></p>)}</details>)}
        {location.footprints?.map((footprint, i) => <div key={i} className="mt-3 text-xs leading-relaxed text-white/65"><p>{footprint.title}</p><p>{footprint.phaseTitle} · {formatInspectionPeriod(footprint.period)} · {footprint.match === 'outside' ? 'Outside selected date; outline hidden' : footprint.match === 'possible' ? 'Possible phase match' : 'Matches selected date'}</p><p>{footprint.representation === 'property-extent' ? 'Property extent, including open spaces; not a wall plan or roof outline.' : 'Wall footprint only; no height or reconstruction model supplied.'}</p><p>{footprint.licence.attribution} · <a href={footprint.licence.url} target="_blank" rel="noreferrer" className="text-accent underline">{footprint.licence.title}</a></p></div>)}
        {location.unavailableReason && <p className="mt-2 text-xs text-white/60">{location.unavailableReason}</p>}
        <button disabled={!location.target} className="journey-button mt-2 bg-white/10 text-xs disabled:opacity-40" onClick={() => onVisit(location.placeId)}>Visit {location.target && location.layoutStatus === 'ready' ? 'dated layout' : location.target && location.footprints?.some(f => f.match !== 'outside') ? 'footprint context' : 'geographic context'}</button>
        {inspection.key.kind === 'event' && <button className="journey-button text-xs text-accent" onClick={() => onInspectPlace(location.placeId)}>Inspect place</button>}
      </section>)}
    </div>
    <section className="mt-4 border-t border-panel-border pt-3" aria-label="Historical evidence">
      <h3 className="text-xs font-medium">Evidence and uncertainty</h3>
      {inspection.evidence.map((group, i) => <div key={i} className="mt-3 text-xs"><p className="text-white/70">{group.label} · {group.value.certainty}</p><p className="mt-1 leading-relaxed text-white/55">{group.value.note}</p></div>)}
    </section>
    <section className="mt-4 border-t border-panel-border pt-3" aria-label="Historical sources">
      <h3 className="text-xs font-medium">Sources</h3>
      {!inspection.sources.length && <p className="mt-2 text-xs text-white/55">No source citation supplied for these claims.</p>}
      {inspection.sources.map(source => <div key={source.id} className="mt-3 text-xs"><a className="text-accent underline" href={source.url} target="_blank" rel="noreferrer">{source.title}</a><p className="mt-1 text-white/50">{source.publisher} · accessed {source.accessed}</p>{source.citation && <p className="mt-1 leading-relaxed text-white/50">{source.citation}</p>}</div>)}
    </section>
  </aside>;
}
