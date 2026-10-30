"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Map } from 'maplibre-gl';
import type { ThreeTestLayer } from '@/map/threeTestLayer';
import type { HistoricalTime } from '@/lib/scenarios/schema';
import { forumReconstruction } from '@/lib/history/localContext';
import { certaintyColour, certaintyShare, reconstructionMatch, reconstructionOverlay } from '@/map/reconstructionOverlay';
import type { ReconstructionCertainty, ReconstructionObject } from '@/map/settlements/reconstructionSpec';
import { contextPeriod } from '@/components/ContextLayers';
import { DEFAULT_TERRAIN_EXAGGERATION, TERRAIN_SOURCE } from '@/map/mapStyle';
import { DEFAULT_LOCAL_HILLSHADE, LOCAL_RELIEF_EXAGGERATION, LOCAL_RELIEF_HILLSHADE } from '@/lib/scenarios/relief';
import { LOCAL_HILLSHADE_STRENGTH } from '@/map/hillshade';
import type { Coordinate } from '@/map/settlements/romanSettlement';

const label: Record<ReconstructionCertainty, string> = { documented: 'Documented', 'evidence-based': 'Evidence-based', 'best-guess': 'Best guess' };
const meaning: Record<ReconstructionCertainty, string> = { documented: 'survives, or is directly recorded', 'evidence-based': 'placed or shaped from a source', 'best-guess': 'plausible for the period and place, with a note on what it is based on' };
export const ReconstructionChip = ({ certainty }: { certainty: ReconstructionCertainty }) =>
  <span className="rounded-full border px-1.5 py-px text-[9px] uppercase tracking-wider" style={{ borderColor: certaintyColour[certainty], color: certaintyColour[certainty] }}>{label[certainty]}</span>;

/**
 * The neighbourhood's certainty legend, its best-guess switch and its inspector. The switch hides every best-guess
 * object in the 3D scene and on the map; the legend line says how much of the mapped area in view is a guess.
 */
export function ReconstructionControls({ map, layer, at, onInspect, inspectedId, onClose }: {
  map: Map; layer: ThreeTestLayer | null; at: HistoricalTime; inspectedId: string | null; onInspect(id: string): void; onClose(): void;
}) {
  const spec = forumReconstruction, origin = useMemo(() => spec.origin as unknown as Coordinate, [spec]);
  const [showGuess, setShowGuess] = useState(true), [tint, setTint] = useState(false), [view, setView] = useState(0), [relief, setRelief] = useState(true);
  const overlay = useRef<ReturnType<typeof reconstructionOverlay> | null>(null);
  // The parent re-renders on every playback tick with a fresh onInspect; keep the overlay (and its data) alive across that.
  const inspect = useRef(onInspect), latest = useRef({ at, showGuess, tint, inspectedId });
  useEffect(() => { inspect.current = onInspect; latest.current = { at, showGuess, tint, inspectedId }; });
  useEffect(() => {
    overlay.current = reconstructionOverlay(map, spec, origin, id => inspect.current(id), point => layer?.pickReconstruction(point));
    const { at, showGuess, tint, inspectedId } = latest.current;
    overlay.current.update(at, showGuess, tint, inspectedId ?? undefined);
    const move = () => setView(v => v + 1); map.on('moveend', move);
    return () => { map.off('moveend', move); overlay.current?.dispose(); overlay.current = null; };
  }, [map, spec, origin, layer]);
  useEffect(() => { overlay.current?.update(at, showGuess, tint, inspectedId ?? undefined); }, [at, showGuess, tint, inspectedId, map]);
  useEffect(() => { layer?.setBestGuessVisible(showGuess); }, [layer, showGuess]);
  useEffect(() => { layer?.setReconstructionTint(tint); }, [layer, tint]);
  // Local relief correction: the global DEM is coarse and understates Rome's hills, so the journey exaggerates relief (labelled below).
  useEffect(() => {
    try { map.setTerrain({ source: TERRAIN_SOURCE, exaggeration: relief ? LOCAL_RELIEF_EXAGGERATION : DEFAULT_TERRAIN_EXAGGERATION }); map.setGlobalStateProperty(LOCAL_HILLSHADE_STRENGTH, relief ? LOCAL_RELIEF_HILLSHADE : DEFAULT_LOCAL_HILLSHADE); } catch { /* style not ready */ }
    return () => { try { map.setTerrain({ source: TERRAIN_SOURCE, exaggeration: DEFAULT_TERRAIN_EXAGGERATION }); map.setGlobalStateProperty(LOCAL_HILLSHADE_STRENGTH, DEFAULT_LOCAL_HILLSHADE); } catch { /* map removed */ } };
  }, [map, relief]);
  const share = useMemo(() => map.getZoom() >= 15.5 ? certaintyShare(spec, origin, map.getBounds(), at, showGuess) : null, [map, spec, origin, at, showGuess, view]);
  const percent = (k: ReconstructionCertainty) => `${Math.round((share?.share(k) ?? 0) * 100)}%`;
  return <div className="mt-3 border-t border-white/10 pt-2 text-[11px] text-white/70">
    {share && share.sum > 0 && <p aria-label="Share of the view that is best guess" title="Share of the mapped object area in view (streets, buildings, quays, bridge, stalls and the two temples)">
      <span style={{ color: certaintyColour['best-guess'] }}>{percent('best-guess')} best guess</span> · <span style={{ color: certaintyColour['evidence-based'] }}>{percent('evidence-based')} evidence-based</span> · <span style={{ color: certaintyColour.documented }}>{percent('documented')} documented</span> <span className="text-white/40">of the mapped area in view</span></p>}
    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
      <label className="flex items-center gap-1.5"><input type="checkbox" checked={showGuess} onChange={e => setShowGuess(e.target.checked)} />Show best guesses</label>
      <label className="flex items-center gap-1.5"><input type="checkbox" checked={tint} onChange={e => setTint(e.target.checked)} />Colour by certainty</label>
    </div>
    <label className="mt-1 flex items-start gap-1.5" title="The global elevation model (cells of about 30 m, with modern buildings in it) shows about 30 m of rise from the Forum Boarium to the Palatine; the hills rise about 40 m. Relief is exaggerated ×2 so the Capitoline, Palatine and Aventine read as hills. Turn it off for the model's own heights.">
      <input className="mt-0.5" type="checkbox" checked={relief} onChange={e => setRelief(e.target.checked)} /><span>Relief ×{LOCAL_RELIEF_EXAGGERATION} <span className="text-white/40">· hills exaggerated for legibility</span></span></label>
  </div>;
}

export function ReconstructionInspector({ id, at, onClose }: { id: string; at: HistoricalTime; onClose(): void }) {
  const o: ReconstructionObject | undefined = forumReconstruction.objects.find(x => x.id === id);
  const sources = forumReconstruction.sources;
  if (!o) return null;
  const match = reconstructionMatch(o, at);
  return <section aria-label="Reconstruction object evidence" className="pointer-events-auto absolute inset-x-3 top-28 z-30 max-h-[calc(100dvh-292px)] overflow-y-auto rounded-2xl border border-panel-border bg-panel p-4 text-xs shadow-xl backdrop-blur-md sm:inset-x-auto sm:left-4 sm:top-24 sm:w-80">
    <div className="flex items-start justify-between gap-2"><h2 className="text-sm font-medium leading-snug">{o.title}</h2><button aria-label="Close object evidence" className="text-white/60 hover:text-white" onClick={onClose}>✕</button></div>
    <div className="mt-2 flex items-center gap-2"><ReconstructionChip certainty={o.certainty} /><span className="text-white/45">{meaning[o.certainty]}</span></div>
    <dl className="mt-2 space-y-1 text-white/70">
      <div><dt className="inline text-white/45">Kind · </dt><dd className="inline">{o.kind}</dd></div>
      <div><dt className="inline text-white/45">Date range · </dt><dd className="inline">{contextPeriod({ time: o.time as never, uncertaintyYears: o.uncertaintyYears })}</dd></div>
      <div><dt className="inline text-white/45">At this date · </dt><dd className="inline">{match === 'within' ? 'within the date range' : match === 'possible' ? 'possibly present' : 'outside the date range'}</dd></div>
    </dl>
    <p className="mt-2 leading-relaxed text-white/65">{o.note}</p>
    <ul className="mt-2 space-y-1">{o.sources.map(id => sources.find(s => s.id === id)).filter(Boolean).map(s => <li key={s!.id}>{/^https?:/.test(s!.url) ? <a href={s!.url} target="_blank" rel="noreferrer" className="text-[10px] text-accent underline">{s!.title}</a> : <span className="text-[10px] text-white/70">{s!.title} · {s!.url}</span>}{s!.licence && <span className="block text-[10px] text-white/40">{s!.licence}</span>}</li>)}</ul>
  </section>;
}
