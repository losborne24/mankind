"use client";
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { HistoricalInspector } from '@/components/HistoricalInspector';
import { useScenarioController } from '@/components/ScenarioContext';
import type { Map } from 'maplibre-gl';
import type { ThreeTestLayer } from '@/map/threeTestLayer';
import { HISTORICAL_DATASETS } from '@/lib/history/datasets';
import { HistoricalDatasetSession } from '@/lib/history/session';
import { validateHistoricalDate } from '@/lib/history/time';
import { useExplorationStore } from '@/state/explorationStore';
import { historicalWorldOverlays } from '@/map/historicalWorldOverlays';

export function HistoricalDatasetControls({ map, layer }: { map: Map; layer: ThreeTestLayer }) {
  const [session, setSession] = useState<HistoricalDatasetSession | null>(null);
  useEffect(() => {
    const overlays = historicalWorldOverlays(map, id => controller.inspect({ kind: 'place', id }));
    const controller = new HistoricalDatasetSession({
      time: () => { const state = useExplorationStore.getState(); return state.historicalTime ?? { start: { year: state.year } }; },
      subscribeTime: listener => useExplorationStore.subscribe((state, previous) => { if (state.year !== previous.year || state.historicalTime !== previous.historicalTime) listener(); }),
      apply: selection => { overlays.update(selection); layer.setHistoricalSettlements(selection?.descriptors ?? []); },
      release: () => { overlays.update(null); layer.useDevelopmentSettlements(); },
    });
    const fixtures = (event: Event) => { if ((event.target as Element | null)?.closest?.('[data-scenario-exit]')) controller.clear(); };
    document.addEventListener('click', fixtures, true); document.addEventListener('input', fixtures, true);
    const removed = () => controller.dispose(); map.on('remove', removed);
    const timer = setTimeout(() => setSession(controller), 0);
    return () => {
      clearTimeout(timer); controller.dispose(); overlays.dispose(); map.off('remove', removed);
      document.removeEventListener('click', fixtures, true); document.removeEventListener('input', fixtures, true);
    };
  }, [map, layer]);
  return session ? <DatasetControls session={session} map={map} /> : null;
}
function DatasetControls({ session, map }: { session: HistoricalDatasetSession; map: Map }) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const { player } = useScenarioController();
  const visit = (placeId: string) => {
    const target = session.getVisitTarget(placeId);
    if (!target) return;
    player?.pause('Visiting historical place');
    useExplorationStore.getState().setSelected(target.center);
    map.flyTo({ center: target.center, zoom: target.zoom, pitch: target.pitch, bearing: target.bearing, duration: 2000 });
  };
  const [datasetId, setDatasetId] = useState<string>('london2012');
  const dataset = HISTORICAL_DATASETS.find(item => item.id === datasetId) ?? HISTORICAL_DATASETS[0];
  const dateText = (value: { year: number; month?: number; day?: number }) => `${value.year}${value.month ? `-${String(value.month).padStart(2, '0')}` : ''}${value.day ? `-${String(value.day).padStart(2, '0')}` : ''}`;
  const [date, setDate] = useState('2012-07-27');
  const [error, setError] = useState('');
  const applyDate = () => {
    try {
      const parts = /^(-?\d{1,4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(date.trim());
      if (!parts) throw Error('Use year, year-month or year-month-day. Year 0 means 1 BCE.');
      const value = { year: Number(parts[1]), ...(parts[2] ? { month: Number(parts[2]) } : {}), ...(parts[3] ? { day: Number(parts[3]) } : {}) };
      validateHistoricalDate(value); useExplorationStore.getState().setHistoricalTime({ start: value }); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  return <><details className="mt-3 border-t border-panel-border pt-2">
    <summary className="cursor-pointer">Historical dataset</summary>
    <label className="mt-2 block">Dataset<select aria-label="Historical dataset selection" className="mt-1 w-full rounded border border-panel-border bg-background p-1" value={datasetId} onChange={event => {
      const next = HISTORICAL_DATASETS.find(item => item.id === event.target.value);
      if (!next) return;
      session.clear(); setDatasetId(next.id); setDate(dateText(next.preview.date)); setError('');
    }}>{HISTORICAL_DATASETS.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
    <p className="my-2 text-white/50">{dataset.description}</p>
    <button className="underline" onClick={() => void session.load(dataset.id)}>{snapshot.status === 'loading' ? `Reload ${dataset.label} dataset` : `Load ${dataset.label} dataset`}</button>
    {snapshot.status !== 'idle' && <button className="ml-2 underline" onClick={() => session.clear()}>Unload dataset</button>}
    <label className="mt-2 block">Dataset date<input aria-label="Historical dataset date" className="mt-1 w-full rounded border border-panel-border bg-background p-1" value={date} onChange={e => setDate(e.target.value)} /></label>
    <button className="mt-2 underline" onClick={applyDate}>Apply dataset date</button>
    <button data-manual-camera className="mt-2 block underline" onClick={() => { setDate(dateText(dataset.preview.date)); setError(''); useExplorationStore.getState().setHistoricalTime({ start: { ...dataset.preview.date } }); map.flyTo({ center: [...dataset.preview.center], zoom: dataset.preview.zoom, pitch: 35 }); }}>{dataset.preview.label}</button>
    {(error || snapshot.error) && <p role="alert" className="my-2 text-red-300">{error || snapshot.error}</p>}
    {snapshot.status === 'ready' && <section aria-label="Historical records" className="mt-3 border-t border-panel-border pt-2">
      <p className="text-white/55">Inspect records at the selected date</p>
      {snapshot.selection?.places.filter(row => ['within', 'possible'].includes(row.presence)).map(row => <button key={row.place.id} className="mt-2 block text-left underline" onClick={() => session.inspect({ kind: 'place', id: row.place.id })}>Inspect {row.place.title}</button>)}
      {snapshot.selection?.events.map(({ event }) => <button key={event.id} className="mt-2 block text-left underline" onClick={() => session.inspect({ kind: 'event', id: event.id })}>Inspect {event.title}</button>)}
      {snapshot.selection?.referenceAreas?.map(area => <details key={area.id} className="mt-3 text-xs text-white/60"><summary className="cursor-pointer">Dashed blue: reference outline · phase unspecified</summary><p className="mt-2">{area.licence.attribution} · <a href={area.licence.url} target="_blank" rel="noreferrer" className="underline">{area.licence.title}</a></p></details>)}
      {!snapshot.selection?.places.some(row => ['within', 'possible'].includes(row.presence)) && !snapshot.selection?.events.length && <p className="mt-2 text-white/50">No records in this dataset match this date.</p>}
    </section>}
    <pre aria-label="Historical dataset diagnostics" className="mt-2 whitespace-pre-wrap text-[10px]">{JSON.stringify({ status: snapshot.status, dataset: snapshot.datasetId, time: snapshot.selection?.time, places: snapshot.selection?.places.map(row => ({ id: row.place.id, presence: row.presence, basis: row.basis, layout: row.layoutStatus, candidates: row.layoutIds, warnings: row.warnings })), events: snapshot.selection?.events.map(row => ({ id: row.event.id, match: row.match })), detailedLayouts: snapshot.selection?.descriptors.length }, null, 2)}</pre>
  </details>{snapshot.inspection && createPortal(<HistoricalInspector inspection={snapshot.inspection} onClose={() => session.closeInspection()} onVisit={visit} onInspectPlace={id => session.inspect({ kind: 'place', id })} />, document.body)}</>;
}
