"use client";
import { useEffect, useSyncExternalStore } from 'react';
import type { Map } from 'maplibre-gl';
import type { ThreeTestLayer } from '@/map/threeTestLayer';
import { useExplorationStore } from '@/state/explorationStore';
import { ScenarioPlayer, type StreamingIntent } from '@/lib/scenarios/player';
import { portunusJourney } from '@/lib/scenarios/portunus';
import portunusWorld from '@/lib/history/fixtures/portunus.json';
import { validateHistoricalWorld } from '@/lib/history/validate';
import { HistoricalJourneyScenes, historicalModelStatus } from '@/lib/scenarios/historicalScenes';
import type { SettlementStatus } from '@/map/settlements/SettlementScene';
import type { StreamingStatus } from '@/map/threeTestLayer';
import { london2012 } from '@/lib/scenarios/london2012';
import { scenarioOverlays } from '@/map/scenarioOverlays';
import { useScenarioController, useHistoricalDataset } from '@/components/ScenarioContext';
import { attachScenarioInput, attachScenarioControls } from '@/lib/scenarios/interruption';
export function ScenarioPanel({ map, layer, streamingStatus, settlementStatus }: {
    map: Map;
    layer: ThreeTestLayer | null;
    streamingStatus?: StreamingStatus;
    settlementStatus: SettlementStatus;
}) {
    const { player, setPlayer, historicalSession } = useScenarioController();
    useEffect(() => {
        if (!historicalSession) return;
        const historical = new HistoricalJourneyScenes(historicalSession, { portunus: validateHistoricalWorld(portunusWorld) });
        const overlays = scenarioOverlays(map);
        let intent: StreamingIntent | null = null;
        const controller = new ScenarioPlayer({
            camera: { read: () => ({ center: [map.getCenter().lng, map.getCenter().lat], zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() }), write: pose => map.jumpTo({ ...pose, center: pose.center }, { scenario: true }), stop: () => map.stop() },
            timeline: time => useExplorationStore.getState().setHistoricalTime(time),
            overlays: (ids, scenario) => overlays.update(ids, scenario),
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
            const wide = window.innerWidth >= 768;
            map.setPadding({ top: 0, left: 0, bottom: wide ? 120 : 0, right: wide ? Math.min(340, window.innerWidth - 76) + 80 : 0 }, { scenario: true });
        };
        framePadding();
        window.addEventListener('resize', framePadding);
        controller.load(portunusJourney);
        const detach = attachScenarioInput(map.getContainer(), reason => controller.pause(reason));
        const detachControls = attachScenarioControls(document, controller);
        const unsub = useExplorationStore.subscribe((state, previous) => {
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
    return player ? <Playback player={player} streamingStatus={streamingStatus} settlementStatus={settlementStatus}/> : null;
}
function Playback({ player, streamingStatus, settlementStatus }: {
    player: ScenarioPlayer;
    streamingStatus?: StreamingStatus;
    settlementStatus: SettlementStatus;
}) {
    const { session: historicalSession, snapshot: historicalSnapshot } = useHistoricalDataset();
    const snapshot = useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
    const scenario = player.scenario;
    if (!scenario)
        return <section role="alert" className="absolute right-12 top-20 z-20 max-w-xs rounded-2xl border border-panel-border bg-panel p-4 text-sm"><p>{snapshot.error}</p><button className="mt-3 rounded-full bg-accent px-4 py-2 text-black" onClick={() => player.load(london2012)}>Load London demo</button></section>;
    const beat = scenario.beats[snapshot.beat], active = beat.actions[snapshot.action];
    const text = scenario.content.overlays.filter(o => active.overlays.includes(o.id) && (o.type === 'caption' || o.type === 'card'));
    const idle = snapshot.state === 'idle';
    const historical = scenario.historicalDataset === 'portunus';
    const requesting = !!beat.sceneRequirements?.length && !idle;
    const hasDescriptor = !!historicalSnapshot?.selection?.descriptors.some(d => d.id === 'layout:portunus-classical');
    const local = streamingStatus?.activeId === 'layout:portunus-classical' && streamingStatus.lod === 'local';
    const rendering = historical && requesting && !snapshot.warning ? historicalModelStatus(hasDescriptor, local, settlementStatus.state, settlementStatus.errors) : undefined;

    return <section aria-label="Historical scenario" className="pointer-events-auto absolute right-12 top-28 z-20 max-h-[calc(100dvh-292px)] sm:top-20 sm:max-h-[calc(100dvh-260px)] overflow-y-auto w-[min(340px,calc(100vw-76px))] rounded-2xl border border-panel-border bg-panel p-4 shadow-xl backdrop-blur-md sm:right-16">
    <div className="text-[10px] uppercase tracking-[.22em] text-accent">A guided historical journey</div>
    <h1 className="mt-2 text-base font-medium leading-snug">{scenario.title}</h1>
    {idle && <label className="mt-3 block text-xs text-white/65">Journey<select aria-label="Journey selection" className="mt-1 w-full rounded border border-panel-border bg-background p-1" value={scenario.id} onChange={event => player.load(event.target.value === portunusJourney.id ? portunusJourney : london2012)}><option value={portunusJourney.id}>Portunus · evidence and reconstruction</option><option value={london2012.id}>London 2012 · geographic journey</option></select></label>}
    {historical && <p className="mt-3 text-[11px] text-accent">Interpretation · AD 100 editorial preview · inferred details</p>}
    {idle ? <><p className="my-3 text-xs leading-relaxed text-white/60">{scenario.description}</p><p className="mb-3 text-[11px] text-white/45">{historical ? 'Sourced temple interpretation' : 'Illustrative route · geographic context'} · about {Math.round(scenario.beats.reduce((total, beat) => total + beat.actions.reduce((sum, action) => sum + action.camera.duration, 0), 0) / 1000)} seconds</p></> : <>
      {text.map(o => <div key={o.id} className="my-3"><h2 className="text-sm font-medium">{'title' in o ? o.title : ''}</h2><p className="mt-1 text-xs leading-relaxed text-white/65">{'text' in o ? o.text : ''}</p>{'sources' in o && o.sources?.map(id => {
            const source = scenario.content.sources.find(s => s.id === id)!;
            return <a key={id} href={source.url} target="_blank" rel="noreferrer" className="mt-2 block text-[10px] text-accent underline">{source.title}</a>;
        })}</div>)}
      {snapshot.warning && <p className="text-xs text-white/60">{snapshot.warning}</p>}
    </>}
    {rendering && <p role="status" className="my-3 text-xs text-white/65">{rendering}</p>}
    {rendering && local && settlementStatus.errors.length > 0 && <button className="my-2 block text-xs text-accent underline" onClick={() => player.restart()}>Retry journey</button>}
    {historical && !idle && <button className="mt-2 block text-xs text-accent underline" onClick={() => { player.pause('Inspecting reconstruction evidence'); historicalSession?.inspect({ kind: 'place', id: 'place:temple-of-portunus' }); }}>Inspect building evidence</button>}
    {snapshot.error && <p role="alert" className="my-2 text-xs text-red-300">{snapshot.error}</p>}
    {idle && <button className="mt-3 rounded-full bg-accent px-4 py-2 text-xs font-medium text-black" onClick={() => player.play()}>{historical ? 'Start Portunus interpretation' : 'Start London journey'}</button>}
  </section>;
}
