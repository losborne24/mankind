import type { ContextInfo, HistoricalTime, ScenarioDefinition } from '@/lib/scenarios/schema';
import { matchHistoricalTime } from '@/lib/history/time';

export type ContextMatch = 'within' | 'possible' | 'outside';
export interface ContextFeature extends ContextInfo {
  id: string;
  title: string;
  kind: 'marker' | 'polygon' | 'line';
  overlayId: string;
  sources: { id: string; title: string; url: string; licence?: string }[];
  match: ContextMatch;
}
/** No date range is a landform present throughout. Uncertainty only widens the edges: inside the range is still 'within'. */
export function matchContext(info: ContextInfo, at: HistoricalTime): ContextMatch {
  if (!info.time) return 'within';
  const exact = matchHistoricalTime(info.time, at);
  if (exact === 'within' || !info.uncertaintyYears) return exact;
  return matchHistoricalTime({ ...info.time, uncertaintyYears: info.uncertaintyYears }, at) === 'outside' ? 'outside' : 'possible';
}
/** Every map layer an action references, with its date match. Pure: no map or camera access. */
export function contextFeatures(scenario: ScenarioDefinition, overlayIds: string[], at: HistoricalTime): ContextFeature[] {
  const { content } = scenario, features: ContextFeature[] = [];
  const cite = (ids: string[]) => ids.flatMap(id => content.sources.filter(s => s.id === id));
  for (const overlay of content.overlays.filter(o => overlayIds.includes(o.id))) {
    if (overlay.type === 'point') {
      const location = content.locations.find(l => l.id === overlay.location)!;
      if (location.context) features.push({ ...location.context, id: location.id, title: location.title, kind: 'marker', overlayId: overlay.id, sources: cite(location.sources), match: matchContext(location.context, at) });
    }
    if (overlay.type === 'polygon' || overlay.type === 'line') {
      const { kind, coordinates, sources, ...rest } = content.geometries!.find(g => g.id === overlay.geometry)!;
      void coordinates;
      features.push({ ...rest, kind, overlayId: overlay.id, sources: cite(sources), match: matchContext(rest, at) });
    }
  }
  return features;
}
