"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { Map } from 'maplibre-gl';
import type { ThreeTestLayer } from '@/map/threeTestLayer';
import { useExplorationStore } from '@/state/explorationStore';
import { ScenarioPlayer, type StreamingIntent } from '@/lib/scenarios/player';
import { portunusJourney } from '@/lib/scenarios/portunus';
import forumWorld from '@/lib/history/fixtures/forum-boarium.json';
import { validateHistoricalWorld } from '@/lib/history/validate';
import { HistoricalJourneyScenes, historicalModelStatus } from '@/lib/scenarios/historicalScenes';
import type { SettlementStatus } from '@/map/settlements/SettlementScene';
import type { StreamingStatus } from '@/map/threeTestLayer';
import { london2012 } from '@/lib/scenarios/london2012';
import { scenarioOverlays } from '@/map/scenarioOverlays';
import { framePadding as paddingFor } from '@/lib/scenarios/framing';
import { contextFeatures } from '@/lib/scenarios/contextLayers';
import { ContextInspector, ContextLayerList, LeftOut } from '@/components/ContextLayers';
import { formatHistoricalYear } from '@/lib/historicalDate';
import type { HistoricalTime, ScenarioDefinition } from '@/lib/scenarios/schema';
import { useScenarioController, useHistoricalDataset } from '@/components/ScenarioContext';
import { attachScenarioInput, attachScenarioControls } from '@/lib/scenarios/interruption';
export function ScenarioPanel({ map, layer, streamingStatus, settlementStatus }: {
    map: Map;
    layer: ThreeTestLayer | null;
    streamingStatus?: StreamingStatus;
    settlementStatus: SettlementStatus;
}) {
    const { player, setPlayer, historicalSession } = useScenarioController();
    const [inspectedId, setInspectedId] = useState<string | null>(null);
    useEffect(() => {
        if (!historicalSession) return;
        const historical = new HistoricalJourneyScenes(historicalSession, { 'forum-boarium': validateHistoricalWorld(forumWorld) });
        const currentTime = (): HistoricalTime => { const { historicalTime, year } = useExplorationStore.getState(); return historicalTime ?? { start: { year } }; };
        let shown: { ids: string[]; scenario: ScenarioDefinition } | null = null;
        const overlays = scenarioOverlays(map, id => { controller.pause('Inspecting a map layer'); setInspectedId(id); });
        let intent: StreamingIntent | null = null;
        const controller = new ScenarioPlayer({
            camera: { read: () => ({ center: [map.getCenter().lng, map.getCenter().lat], zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() }), write: pose => map.jumpTo({ ...pose, center: pose.center }, { scenario: true }), stop: () => map.stop() },
            timeline: time => useExplorationStore.getState().setHistoricalTime(time),
            overlays: (ids, scenario) => { shown = { ids, scenario }; setInspectedId(null); overlays.update(ids, scenario, currentTime()); },
            scenes: (ids, scenario, time) => historical.resolve(ids, scenario, time),
            releaseScenes: () => historical.release(),
            streaming: value => {
                intent = value;
                layer?.setScenarioTravel(value?.travelling ?? false);
            },
            frame: callback => requestAnimationFrame(callback), cancelFrame: id => cancelAnimationFrame(id),
        });
        // Centre guided subjects in the space left of the journey card (and above the
        // scenario bar) on wide screens. Flagged as scenario-owned so it never pauses playback.
        const framePadding = () => {
            map.setPadding(paddingFor(window.innerWidth), { scenario: true });
        };
        framePadding();
        window.addEventListener('resize', framePadding);
        controller.load(portunusJourney);
        // Haze and depth of field belong to guided beats only; any pause, exploration or idle turns them off.
        const guided = () => { const state = controller.getSnapshot().state, on = state === 'playing' || state === 'preparing'; layer?.setAtmosphere({ haze: on, dof: on }); };
        const unsubAtmosphere = controller.subscribe(guided);
        const detach = attachScenarioInput(map.getContainer(), reason => controller.pause(reason));
        const detachControls = attachScenarioControls(document, controller);
        const unsub = useExplorationStore.subscribe((state, previous) => {
            if (shown && (state.year !== previous.year || state.historicalTime !== previous.historicalTime)) overlays.update(shown.ids, shown.scenario, currentTime());
            if (state.year !== previous.year || state.historicalTime !== previous.historicalTime || state.isPlaying !== previous.isPlaying) {
                if (controller.snapshot.owner === 'scenario' && (state.isPlaying || state.historicalTime !== controller.snapshot.intendedTime))
                    controller.pause('Timeline manipulation');
            }
        });
        // Catch external API camera commands too; player writes carry explicit ownership metadata.
        const movement = (event: {
            scenario?: boolean;
            originalEvent?: Event;
        }) => {
            if (!event.scenario)
                controller.pause(event.originalEvent ? 'Map gesture' : 'Manual camera control');
        };
        map.on('movestart', movement);
        const removed = () => controller.dispose();
        map.on('remove', removed);
        if (process.env.NODE_ENV === 'development')
            (window as unknown as {
                __scenario?: unknown;
            }).__scenario = { player: controller, get intent() {
                    return intent;
                } };
        const timer = setTimeout(() => setPlayer(controller), 0);
        return () => {
            clearTimeout(timer);
            setPlayer(null);
            detach();
            unsubAtmosphere();
            layer?.setAtmosphere({ haze: false, dof: false });
            unsub();
            detachControls();
            map.off('movestart', movement);
            map.off('remove', removed);
            window.removeEventListener('resize', framePadding);
            controller.dispose();
            try { map.setPadding({ top: 0, left: 0, bottom: 0, right: 0 }, { scenario: true }); } catch { /* map already removed */ }
            if (map.getSource('scenario-geography'))
                overlays.dispose();
            if (process.env.NODE_ENV === 'development')
                delete (window as unknown as {
                    __scenario?: unknown;
                }).__scenario;
        };
    }, [map, layer, setPlayer, historicalSession]);
    return player ? <Playback player={player} streamingStatus={streamingStatus} settlementStatus={settlementStatus} inspectedId={inspectedId} onInspect={id => { player.pause('Inspecting a map layer'); setInspectedId(id); }} onCloseInspect={() => setInspectedId(null)}/> : null;
}
function Playback({ player, streamingStatus, settlementStatus, inspectedId, onInspect, onCloseInspect }: {
    player: ScenarioPlayer;
    inspectedId: string | null;
    onInspect(id: string): void;
    onCloseInspect(): void;
    streamingStatus?: StreamingStatus;
    settlementStatus: SettlementStatus;
}) {
    const { session: historicalSession, snapshot: historicalSnapshot } = useHistoricalDataset();
    const snapshot = useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
    const scenario = player.scenario;
    const storeYear = useExplorationStore(s => s.year), storeTime = useExplorationStore(s => s.historicalTime);
    const viewTime: HistoricalTime = storeTime ?? { start: { year: storeYear } };
    const features = useMemo(() => scenario && snapshot.state !== 'idle' ? contextFeatures(scenario, scenario.beats[snapshot.beat].actions[snapshot.action].overlays, viewTime) : [], [scenario, snapshot.state, snapshot.beat, snapshot.action, storeYear, storeTime]); // eslint-disable-line react-hooks/exhaustive-deps
    const yearLabel = formatHistoricalYear(viewTime.start.year);
    const inspected = features.find(f => f.id === inspectedId && f.match !== 'outside');
    if (!scenario)
        return <section role="alert" className="absolute right-12 top-20 z-20 max-w-xs rounded-2xl border border-panel-border bg-panel p-4 text-sm"><p>{snapshot.error}</p><button className="mt-3 rounded-full bg-accent px-4 py-2 text-black" onClick={() => player.load(london2012)}>Load London demo</button></section>;
    const beat = scenario.beats[snapshot.beat], active = beat.actions[snapshot.action];
    const text = scenario.content.overlays.filter(o => active.overlays.includes(o.id) && (o.type === 'caption' || o.type === 'card'));
    const idle = snapshot.state === 'idle';
    const historical = scenario.historicalDataset === 'forum-boarium';
    const requesting = !!beat.sceneRequirements?.length && !idle;
    const hasDescriptor = !!historicalSnapshot?.selection?.descriptors.some(d => d.id === 'layout:forum-boarium-temples');
    const local = streamingStatus?.activeId === 'layout:forum-boarium-temples' && streamingStatus.lod === 'local';
    const rendering = historical && requesting && !snapshot.warning ? historicalModelStatus(hasDescriptor, local, settlementStatus.state, settlementStatus.errors) : undefined;

    return <>{inspected && <ContextInspector feature={inspected} year={yearLabel} onClose={onCloseInspect}/>}<section aria-label="Historical scenario" className="pointer-events-auto absolute right-12 top-28 z-20 max-h-[calc(100dvh-292px)] sm:top-20 sm:max-h-[calc(100dvh-260px)] overflow-y-auto w-[min(340px,calc(100vw-76px))] rounded-2xl border border-panel-border bg-panel p-4 pb-8 shadow-xl backdrop-blur-md sm:right-16">
    <div className="text-[10px] uppercase tracking-[.22em] text-accent">A guided historical journey</div>
    <h1 className="mt-2 text-base font-medium leading-snug">{scenario.title}</h1>
    {idle && <label className="mt-3 block text-xs text-white/65">Journey<select aria-label="Journey selection" className="mt-1 w-full rounded border border-panel-border bg-background p-1" value={scenario.id} onChange={event => player.load(event.target.value === portunusJourney.id ? portunusJourney : london2012)}><option value={portunusJourney.id}>Portunus · evidence and reconstruction</option><option value={london2012.id}>London 2012 · geographic journey</option></select></label>}
    {historical && <p className="mt-3 text-[11px] text-accent">Interpretation · AD 100 editorial preview · inferred details</p>}
    {idle ? <><p className="my-3 text-xs leading-relaxed text-white/60">{scenario.description}</p><p className="mb-3 text-[11px] text-white/45">{historical ? 'Sourced map layers and two temple interpretations' : 'Illustrative route · geographic context'} · about {Math.round(scenario.beats.reduce((total, beat) => total + beat.actions.reduce((sum, action) => sum + action.camera.duration, 0), 0) / 1000)} seconds</p></> : <>
      {text.map(o => <div key={o.id} className="my-3"><h2 className="text-sm font-medium">{'title' in o ? o.title : ''}</h2><p className="mt-1 text-xs leading-relaxed text-white/65">{'text' in o ? o.text : ''}</p>{'sources' in o && o.sources?.map(id => {
            const source = scenario.content.sources.find(s => s.id === id)!;
            return <a key={id} href={source.url} target="_blank" rel="noreferrer" className="mt-2 block text-[10px] text-accent underline">{source.title}</a>;
        })}</div>)}
      <LeftOut features={features} year={yearLabel}/>
      <ContextLayerList features={features} onInspect={onInspect}/>
      {snapshot.warning && <p className="mt-2 text-xs text-white/60">{snapshot.warning}</p>}
    </>}
    {rendering && <p role="status" className="my-3 text-xs text-white/65">{rendering}</p>}
    {rendering && local && settlementStatus.errors.length > 0 && <button className="my-2 block text-xs text-accent underline" onClick={() => player.restart()}>Retry journey</button>}
    {historical && !idle && <button className="mt-2 block text-xs text-accent underline" onClick={() => { player.pause('Inspecting reconstruction evidence'); historicalSession?.inspect({ kind: 'place', id: 'place:forum-boarium-temples' }); }}>Inspect building evidence</button>}
    {historical && !idle && <p className="mt-1 text-[11px] text-white/50">Positions: {[['place:temple-of-portunus', 'Portunus'], ['place:temple-of-hercules-victor', 'Hercules Victor']].map(([id, label], i) => <span key={id}>{i ? ' · ' : ''}<button className="text-accent underline" onClick={() => { player.pause('Inspecting a temple position'); historicalSession?.inspect({ kind: 'place', id }); }}>{label}</button></span>)}</p>}
    {snapshot.error && <p role="alert" className="my-2 text-xs text-red-300">{snapshot.error}</p>}
    {idle && <button className="mt-3 rounded-full bg-accent px-4 py-2 text-xs font-medium text-black" onClick={() => player.play()}>{historical ? 'Start the Forum Boarium journey' : 'Start London journey'}</button>}
    <div aria-hidden className="pointer-events-none sticky -bottom-8 -mx-4 -mb-8 h-8 bg-gradient-to-t from-panel to-transparent"/>
  </section></>;
}
