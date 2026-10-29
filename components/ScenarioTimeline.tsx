"use client";

import type { ScenarioPlayer, PlayerSnapshot } from '@/lib/scenarios/player';
import { scenarioMarkers } from '@/lib/scenarios/progress';
import { formatHistoricalDate, formatHistoricalYear } from '@/lib/historicalDate';
import { useExplorationStore } from '@/state/explorationStore';

export function ScenarioTimeline({ player, snapshot }: { player: ScenarioPlayer; snapshot: PlayerSnapshot }) {
    const year = useExplorationStore(s => s.year);
    const time = useExplorationStore(s => s.historicalTime);
    const scenario = player.scenario;
    if (!scenario) return null;
    const markers = scenarioMarkers(scenario);
    const completed = snapshot.state === 'completed';
    const paused = snapshot.state === 'paused';
    const preparing = snapshot.state === 'preparing';
    const failed = snapshot.state === 'error';
    const status = completed ? 'Completed' : failed ? 'Journey interrupted' : preparing ? 'Preparing journey…' : paused ? 'Paused' : snapshot.returning ? 'Returning to journey…' : 'Playing';
    const primary = completed ? 'Replay journey' : paused ? 'Resume' : failed ? 'Retry journey' : 'Pause';
    return <section aria-label="Scenario timeline" className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 px-3 pb-3 sm:px-6 sm:pb-5">
      <div className="mx-auto max-w-4xl rounded-2xl border border-panel-border bg-panel px-4 py-3 shadow-xl backdrop-blur-md sm:px-6">
        <div className="flex items-center gap-3">
          <button className="journey-button shrink-0 font-medium" style={{ backgroundColor: 'var(--accent)', color: '#05080d' }} onClick={() => completed || failed ? player.restart() : paused ? player.resume() : player.pause()}>{primary}</button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] text-white/60" title={scenario.title}>{scenario.title}</p>
            <p className="truncate text-sm" title={scenario.beats[snapshot.beat].title}>{scenario.beats[snapshot.beat].title}</p>
          </div>
          <div className="shrink-0 text-right text-[11px]">
            <p role="status" className="text-accent">{status}</p>
            <p className="mt-1 font-mono text-white/75">{time ? `${formatHistoricalDate(time.start)}${time.end ? ` – ${formatHistoricalDate(time.end)}` : ''}` : formatHistoricalYear(year)}</p>
          </div>
        </div>
        <div className="relative mt-1 h-6 mx-4">
          <div role="progressbar" aria-label="Journey progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(snapshot.progress * 100)} aria-valuetext={`${Math.round(snapshot.progress * 100)}% · ${scenario.beats[snapshot.beat].title}`} className="absolute inset-x-0 top-3 h-1 rounded bg-white/15">
            <div className="h-full rounded bg-accent" style={{ width: `${snapshot.progress * 100}%` }} />
          </div>
          {markers.map((marker, index) => <button key={marker.id} title={marker.title} aria-label={`Go to beat ${index + 1}: ${marker.title}`} aria-current={index === snapshot.beat ? 'step' : undefined} onClick={() => player.jump(index)} style={{ left: `${marker.position * 100}%` }} className="absolute top-0 flex h-6 w-8 -translate-x-1/2 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2">
            <span className={`h-2.5 w-2.5 rounded-full border ${index <= snapshot.beat ? 'border-accent bg-accent' : 'border-white/60 bg-background'}`} />
          </button>)}
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-1">
            <button aria-label="Previous beat" disabled={snapshot.beat === 0} className="journey-button" onClick={() => player.jump(snapshot.beat - 1)}>← <span className="hidden sm:inline">Previous</span></button>
            <button aria-label="Next beat" disabled={snapshot.beat >= markers.length - 1} className="journey-button" onClick={() => player.skip()}><span className="hidden sm:inline">Next</span> →</button>
            <span className="ml-1 tabular-nums text-white/65">{Math.round(snapshot.progress * 100)}%</span>
          </div>
          <p className="hidden text-white/55 md:block">Moving the map pauses the journey</p>
          <details className="relative">
            <summary className="journey-button cursor-pointer">Journey options</summary>
            <div className="absolute bottom-full right-0 mb-2 w-56 rounded-xl border border-panel-border bg-background p-2 shadow-xl">
              <p className="p-2 text-white/60 md:hidden">Moving the map pauses the journey</p>
              <button className="journey-button w-full text-left" onClick={() => player.exploreFreely()}>{completed ? 'Continue exploring' : 'Explore freely'}</button>
              <button className="journey-button w-full text-left" onClick={() => player.stop()}>Exit scenario</button>
            </div>
          </details>
          {completed && <button className="journey-button hidden sm:block" onClick={() => player.exploreFreely()}>Continue exploring</button>}
        </div>
        {snapshot.error && <p role="alert" className="mt-2 text-xs text-red-300">{snapshot.error}</p>}
      </div>
    </section>;
}
