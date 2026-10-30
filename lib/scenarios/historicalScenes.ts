import type { HistoricalDatasetSession } from '@/lib/history/session';
import type { HistoricalTime, ScenarioDefinition } from '@/lib/scenarios/schema';
import type { HistoricalWorldData } from '@/lib/history/schema';
/** Registered local worlds only; the journey never searches for or substitutes models. */
export class HistoricalJourneyScenes {
  private owned = false;
  constructor(private session: HistoricalDatasetSession, private worlds: Record<string, HistoricalWorldData>) {}
  resolve(requirements: string[], scenario: ScenarioDefinition, _time: HistoricalTime): { warning?: string } {
    if (!scenario.historicalDataset) {
      this.release();
      return { warning: requirements.length ? 'Requested scene unavailable; map and geographic overlays remain available.' : undefined };
    }
    const world = Object.hasOwn(this.worlds, scenario.historicalDataset) ? this.worlds[scenario.historicalDataset] : undefined;
    const requested = requirements.map(id => scenario.content.scenes?.find(s => s.id === id));
    const mapped = requested.map(s => world?.scenes.find(record => record.id === s?.historicalSceneId));
    const layouts = [...new Set(requested.flatMap(s => s?.interpretationLayoutId ? [s.interpretationLayoutId] : []))];
    const invalid = !world || requested.some((s, i) => !s || !mapped[i] || s.interpretationLayoutId && !mapped[i]!.layoutIds.includes(s.interpretationLayoutId)) || layouts.length > 1;
    if (invalid) {
      this.release();
      if (requested.some(s => s?.required)) throw Error('Required historical scene is unavailable.');
      return { warning: 'Historical scene plan unavailable; continuing with geographic context only.' };
    }
    this.owned = true;
    const selection = this.session.presentJourney(scenario.historicalDataset, world, layouts[0], mapped.map(s => s!.id));
    const missing = mapped.filter(s => !selection?.scenes?.some(r => r.scene.id === s!.id && r.status === 'ready'));
    if (missing.length && requested.some((s, i) => s?.required && missing.includes(mapped[i]))) throw Error('Required historical scene is unavailable.');
    return { warning: missing.length ? 'Reconstruction unavailable for this date or catalogue version; continuing with geographic context only.' : undefined };
  }
  release() { if (this.owned) { this.owned = false; this.session.clear(); } }
}

/** Keep runtime loading/failure distinct from successful metadata resolution. */
export function historicalModelStatus(hasDescriptor: boolean, local: boolean, state: string, errors: string[]): string {
  if (!hasDescriptor) return 'Reconstruction hidden for the current selection. Resume the journey to restore its interpretation.';
  if (!local) return 'The detailed model appears as you approach the temple.';
  if (errors.length) return 'The reconstruction could not load. Continue with the map and source cards, or retry the journey.';
  if (state === 'ready') return 'Reconstruction visible · inferred exterior interpretation.';
  return 'Preparing reconstruction · waiting for the model or terrain.';
}
