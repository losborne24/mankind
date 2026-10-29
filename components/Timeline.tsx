"use client";

import { useScenario } from '@/components/ScenarioContext';
import { ScenarioTimeline } from '@/components/ScenarioTimeline';
import { timelinePresentation } from '@/lib/scenarios/progress';

/** The bottom bar is reserved for the current scenario. */
export function Timeline() {
  const { player, snapshot } = useScenario();
  if (!player || !snapshot || snapshot.state === 'idle') return null;
  if (timelinePresentation(snapshot) === 'scenario') {
    return <ScenarioTimeline player={player} snapshot={snapshot} />;
  }

  const completed = snapshot.state === 'completed';
  return (
    <section aria-label="Suspended scenario" className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 px-3 pb-3 sm:px-6 sm:pb-5">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2 rounded-2xl border border-panel-border bg-panel px-4 py-3 text-xs backdrop-blur-md sm:px-6">
        <div className="min-w-0">
          <p className="truncate text-white/75">{player.scenario?.title}</p>
          <p className="mt-1 text-white/45">{completed ? 'Journey completed' : 'Exploring freely'}</p>
        </div>
        <div className="flex shrink-0 items-center">
          <button className="journey-button text-accent" onClick={() => completed ? player.restart() : player.resume()}>{completed ? 'Replay journey' : 'Resume scenario'}</button>
          <button className="journey-button" onClick={() => player.stop()}>Exit scenario</button>
        </div>
      </div>
    </section>
  );
}
