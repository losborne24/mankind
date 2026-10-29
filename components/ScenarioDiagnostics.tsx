"use client";
import { london2012 } from '@/lib/scenarios/london2012';
import { useScenario } from '@/components/ScenarioContext';
import { timelinePresentation, scenarioMarkers } from '@/lib/scenarios/progress';
import { useExplorationStore } from '@/state/explorationStore';
export function ScenarioDiagnostics() {
    const { player, snapshot } = useScenario();
    const year = useExplorationStore(s => s.year);
    const historicalTime = useExplorationStore(s => s.historicalTime);
    const scenario = player?.scenario;
    const marker = scenario && snapshot ? scenarioMarkers(scenario)[snapshot.beat] : undefined;
    return <details className="mt-3 border-t border-panel-border pt-2">
      <summary className="cursor-pointer">Scenario diagnostics</summary>
      <pre className="my-2 whitespace-pre-wrap text-[10px]">{JSON.stringify({ presentation: timelinePresentation(snapshot), lifecycle: snapshot?.state ?? 'idle', beat: scenario && snapshot ? scenario.beats[snapshot.beat].id : null, beatElapsed: marker && snapshot ? Math.round(snapshot.totalElapsed - marker.start) : 0, progress: Math.round((snapshot?.progress ?? 0) * 100), historicalDate: historicalTime ?? year, suspendedForExploration: !!snapshot?.suspendedForExploration, owner: snapshot?.owner ?? 'user', returning: snapshot?.returning, interruption: snapshot?.reason }, (_key, value) => typeof value === "number" ? Math.round(value) : value, 2)}</pre>
      {player && <div className="space-y-2"><button className="underline" onClick={() => { player.load(london2012); player.play(); }}>Load demo</button>{' · '}<button className="underline" onClick={() => player.restart()}>Restart</button>{scenario && <select aria-label="Jump to scenario beat" className="w-full bg-background" value={snapshot?.beat ?? 0} onChange={e => player.jump(Number(e.target.value))}>{scenario.beats.map((beat, index) => <option key={beat.id} value={index}>{beat.title}</option>)}</select>}</div>}
    </details>;
}
