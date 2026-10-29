import type { PlayerSnapshot } from '@/lib/scenarios/player';
import type { ScenarioDefinition } from '@/lib/scenarios/schema';

/** Positions are narrative milliseconds, independent of historical dates. */
export function scenarioMarkers(scenario: ScenarioDefinition) {
    const durations = scenario.beats.map(beat => beat.actions.reduce((sum, action) => sum + action.camera.duration, 0));
    const total = durations.reduce((sum, duration) => sum + duration, 0);
    let elapsed = 0;
    return scenario.beats.map((beat, index) => {
        const marker = { id: beat.id, title: beat.title, position: elapsed / total, duration: durations[index], start: elapsed };
        elapsed += durations[index];
        return marker;
    });
}
export function timelinePresentation(snapshot: PlayerSnapshot | null) {
    return !snapshot || snapshot.state === 'idle' || snapshot.suspendedForExploration ? 'explore' : 'scenario';
}
