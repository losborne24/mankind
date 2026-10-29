"use client";
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Map } from 'maplibre-gl';
import type { ThreeTestLayer } from '@/map/threeTestLayer';
import { HistoricalDatasetSession } from '@/lib/history/session';
import { validateHistoricalDate } from '@/lib/history/time';
import { useExplorationStore } from '@/state/explorationStore';
import { historicalWorldOverlays } from '@/map/historicalWorldOverlays';

export function HistoricalDatasetControls({ map, layer }: { map: Map; layer: ThreeTestLayer }) {
  const [session, setSession] = useState<HistoricalDatasetSession | null>(null);
  useEffect(() => {
    const overlays = historicalWorldOverlays(map);
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
  return <details className="mt-3 border-t border-panel-border pt-2">
    <summary className="cursor-pointer">Historical dataset</summary>
    <p className="my-2 text-white/50">Reviewed event context · approximate geography · no London architecture.</p>
    <button className="underline" onClick={() => void session.load('london2012')}>{snapshot.status === 'loading' ? 'Reload London dataset' : 'Load London dataset'}</button>
    {snapshot.status !== 'idle' && <button className="ml-2 underline" onClick={() => session.clear()}>Unload dataset</button>}
    <label className="mt-2 block">Dataset date<input aria-label="Historical dataset date" className="mt-1 w-full rounded border border-panel-border bg-background p-1" value={date} onChange={e => setDate(e.target.value)} /></label>
    <button className="mt-2 underline" onClick={applyDate}>Apply dataset date</button>
    <button data-manual-camera className="mt-2 block underline" onClick={() => { setDate('2012-07-27'); setError(''); useExplorationStore.getState().setHistoricalTime({ start: { year: 2012, month: 7, day: 27 } }); map.flyTo({ center: [-.0166, 51.5387], zoom: 13, pitch: 35 }); }}>View ceremony context</button>
    {(error || snapshot.error) && <p role="alert" className="my-2 text-red-300">{error || snapshot.error}</p>}
    <pre aria-label="Historical dataset diagnostics" className="mt-2 whitespace-pre-wrap text-[10px]">{JSON.stringify({ status: snapshot.status, dataset: snapshot.datasetId, time: snapshot.selection?.time, places: snapshot.selection?.places.map(row => ({ id: row.place.id, presence: row.presence, basis: row.basis, layout: row.layoutStatus, candidates: row.layoutIds, warnings: row.warnings })), events: snapshot.selection?.events.map(row => ({ id: row.event.id, match: row.match })), detailedLayouts: snapshot.selection?.descriptors.length }, null, 2)}</pre>
  </details>;
}
