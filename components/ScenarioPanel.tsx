"use client";
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Map } from 'maplibre-gl';
import type { ThreeTestLayer, StreamingStatus } from '@/map/threeTestLayer';
import { useExplorationStore } from '@/state/explorationStore';
import { ScenarioPlayer, type StreamingIntent } from '@/lib/scenarios/player';
import { london2012 } from '@/lib/scenarios/london2012';
import { scenarioOverlays } from '@/map/scenarioOverlays';
import { attachScenarioInput } from '@/lib/scenarios/interruption';
export function ScenarioPanel({ map, layer, streaming }: {
    map: Map;
    layer: ThreeTestLayer | null;
    streaming?: StreamingStatus;
}) {
    const [player, setPlayer] = useState<ScenarioPlayer | null>(null);
    useEffect(() => {
        const overlays = scenarioOverlays(map);
        let intent: StreamingIntent | null = null;
        const controller = new ScenarioPlayer({
            camera: { read: () => ({ center: [map.getCenter().lng, map.getCenter().lat], zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() }), write: pose => map.jumpTo({ ...pose, center: pose.center }, { scenario: true }), stop: () => map.stop() },
            timeline: time => useExplorationStore.getState().setHistoricalTime(time),
            overlays: (ids, scenario) => overlays.update(ids, scenario),
            streaming: value => {
                intent = value;
                layer?.setScenarioTravel(value?.travelling ?? false);
            },
            frame: callback => requestAnimationFrame(callback), cancelFrame: id => cancelAnimationFrame(id),
        });
        controller.load(london2012);
        const detach = attachScenarioInput(map.getContainer(), reason => controller.pause(reason));
        // Includes timeline, legacy debug buttons and navigation controls outside the canvas.
        const manual = (event: Event) => {
            const target = event.target as HTMLElement;
            if (target.closest('[aria-label="Historical timeline"]'))
                controller.pause('Timeline manipulation');
            else if (target.closest('[data-manual-camera]'))
                controller.pause('Manual camera control');
        };
        document.addEventListener('pointerdown', manual, true);
        document.addEventListener('keydown', manual, true);
        document.addEventListener('input', manual, true);
        document.addEventListener('click', manual, true);
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
            detach();
            unsub();
            document.removeEventListener('pointerdown', manual, true);
            document.removeEventListener('keydown', manual, true);
            document.removeEventListener('input', manual, true);
            document.removeEventListener('click', manual, true);
            map.off('movestart', movement);
            map.off('remove', removed);
            controller.dispose();
            if (map.getSource('scenario-geography'))
                overlays.dispose();
            if (process.env.NODE_ENV === 'development')
                delete (window as unknown as {
                    __scenario?: unknown;
                }).__scenario;
        };
    }, [map, layer]);
    return player ? <Playback player={player} streaming={streaming}/> : null;
}
function Playback({ player, streaming }: {
    player: ScenarioPlayer;
    streaming?: StreamingStatus;
}) {
    const snapshot = useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
    const year = useExplorationStore(s => s.year);
    const scenario = player.scenario;
    if (!scenario)
        return <section role="alert" className="absolute right-12 top-20 z-20 max-w-xs rounded-2xl border border-panel-border bg-panel p-4 text-sm"><p>{snapshot.error}</p><button className="mt-3 rounded-full bg-accent px-4 py-2 text-black" onClick={() => player.load(london2012)}>Load London demo</button></section>;
    const beat = scenario.beats[snapshot.beat], active = beat.actions[snapshot.action];
    const text = scenario.content.overlays.filter(o => active.overlays.includes(o.id) && (o.type === 'caption' || o.type === 'card'));
    const idle = snapshot.state === 'idle', completed = snapshot.state === 'completed', paused = snapshot.state === 'paused';
    return <section aria-label="Historical scenario" className="pointer-events-auto absolute right-12 top-20 z-20 max-h-[calc(100dvh-260px)] overflow-y-auto w-[min(340px,calc(100vw-76px))] rounded-2xl border border-panel-border bg-panel p-4 shadow-xl backdrop-blur-md sm:right-16">
    <div className="text-[10px] uppercase tracking-[.22em] text-accent">A guided historical journey</div>
    <h1 className="mt-2 text-base font-medium leading-snug">{scenario.title}</h1>
    {idle ? <><p className="my-3 text-xs leading-relaxed text-white/60">{scenario.description}</p><p className="mb-3 text-[11px] text-white/45">Illustrative route · geographic context · about 80 seconds</p></> : <>
      <p className="mt-3 text-xs text-accent" role="status">{paused ? 'Scenario paused — Explore freely' : completed ? 'Journey complete — Explore freely' : snapshot.returning ? 'Returning to your guided viewpoint…' : beat.title}</p>
      <div className="my-3 h-0.5 overflow-hidden rounded bg-white/10" role="progressbar" aria-label="Scenario progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(snapshot.progress * 100)}><div className="h-full bg-accent" style={{ width: `${snapshot.progress * 100}%` }}/></div>
      {text.map(o => <div key={o.id} className="my-3"><h2 className="text-sm font-medium">{'title' in o ? o.title : ''}</h2><p className="mt-1 text-xs leading-relaxed text-white/65">{'text' in o ? o.text : ''}</p>{'sources' in o && o.sources?.map(id => {
            const source = scenario.content.sources.find(s => s.id === id)!;
            return <a key={id} href={source.url} target="_blank" rel="noreferrer" className="mt-2 block text-[10px] text-accent underline">{source.title}</a>;
        })}</div>)}
      {snapshot.warning && <p className="text-xs text-white/60">{snapshot.warning}</p>}
    </>}
    {snapshot.error && <p role="alert" className="my-2 text-xs text-red-300">{snapshot.error}</p>}
    <div className="mt-3 flex flex-wrap gap-2 text-xs">
      <button className="rounded-full bg-accent px-4 py-2 font-medium text-black hover:bg-accent/85" onClick={() => idle ? player.play() : completed ? player.restart() : paused ? player.resume() : player.pause()}>{idle ? 'Start London journey' : completed ? 'Replay journey' : paused ? 'Resume guided scenario' : 'Pause'}</button>
      {!idle && !completed && <button className="rounded-full bg-white/8 px-3 py-2 hover:bg-white/15" onClick={() => player.skip()}>Skip forward</button>}
      {!idle && <button className="px-2 py-2 text-white/60 hover:text-white" onClick={() => player.stop()}>Exit scenario</button>}
    </div>
    {process.env.NODE_ENV === 'development' && <details className="mt-3 text-[10px] text-white/40"><summary className="cursor-pointer">Scenario diagnostics</summary><pre className="my-2 whitespace-pre-wrap">{JSON.stringify({ state: snapshot.state, beat: beat.id, command: snapshot.command, elapsed: Math.round(snapshot.elapsed), savedProgress: snapshot.savedPose ? Math.round(snapshot.elapsed) : null, interruption: snapshot.reason, returning: snapshot.returning, year, intendedTime: snapshot.intendedTime, owner: snapshot.owner, streaming: streaming?.stage }, null, 2)}</pre><button onClick={() => {
        player.load(london2012);
        player.play();
    }}>Load demo</button>{' · '}<button onClick={() => player.restart()}>Restart</button><select aria-label="Jump to scenario beat" value={snapshot.beat} onChange={e => player.jump(Number(e.target.value))} className="mt-2 w-full bg-background">{scenario.beats.map((b, i) => <option key={b.id} value={i}>{b.title}</option>)}</select></details>}
  </section>;
}
