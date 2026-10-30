import { resolveHistoricalAsset, type HistoricalAssetBinding } from '@/lib/history/assetResolution';
import type { HistoricalSceneRequirement, HistoricalWorldData } from '@/lib/history/schema';
import type { HistoricalTime } from '@/lib/scenarios/schema';
import type { HistoricalPlaceSelection } from '@/lib/history/selection';
import type { SettlementDescriptor } from '@/map/settlements/settlementStreaming';
import { matchHistoricalTime } from '@/lib/history/time';

export interface HistoricalSceneResolution {
  scene: HistoricalSceneRequirement;
  match: 'within' | 'possible' | 'outside';
  /** Static projection readiness; does not assert that GLB bytes have loaded. */
  status: 'ready' | 'map-only' | 'unavailable' | 'outside-period';
  issues: { code: string; message: string; assetId?: string }[];
  assets: { id: string; registryId?: string; status: 'registered' | 'unresolved' | 'category-mismatch' | 'unplaced' | 'unsupported' | 'unreviewed' | 'catalogue-blocked'; catalogue?: HistoricalAssetBinding['catalogue'] }[];
  descriptorIds: string[];
  footprintIds: string[];
}
/** Already validated data and date projections. No fetching, model substitution or camera writes. */
export function resolveSceneRequirements(world: HistoricalWorldData, time: HistoricalTime, places: HistoricalPlaceSelection[], descriptors: SettlementDescriptor[], footprints: { footprint: { id: string; placeId: string } }[]): HistoricalSceneResolution[] {
  const results = world.scenes.map(scene => {
    const match = matchHistoricalTime(scene.period, time);
    const result: HistoricalSceneResolution = { scene, match, status: 'outside-period', issues: [], assets: [], descriptorIds: [], footprintIds: [] };
    if (match === 'outside') return result;
    const issue = (code: string, message: string, assetId?: string) => { result.issues.push({ code, message, ...(assetId ? { assetId } : {}) }); };
    const row = places.find(p => p.place.id === scene.placeId)!;
    result.footprintIds = footprints.filter(f => f.footprint.placeId === scene.placeId).map(f => f.footprint.id);
    if (match === 'possible' || row.presence !== 'within') issue('uncertain-date', 'Date uncertainty prevents automatic 3D scene selection.');
    const locationSupported = Math.abs(row.place.position.coordinate[1]) <= 85;
    if (!locationSupported) issue('unsupported-location', 'This location is outside the supported display range.');
    if (row.place.position.evidence.certainty === 'unknown') issue('unreviewed-location', 'The geographic placement has no established interpretation.');
    const candidates = scene.layoutIds.filter(id => row.layoutIds.includes(id));
    if (!scene.layoutIds.length) issue('missing-layout', 'No reconstructed building layout has been supplied.');
    else if (candidates.length !== 1 || row.layoutStatus === 'ambiguous') issue('ambiguous-layout', 'No single dated layout can be selected for this requirement.');
    const descriptor = candidates.length === 1 && row.layoutStatus === 'ready' ? descriptors.find(d => d.id === candidates[0]) : undefined;
    if (candidates.length === 1 && !descriptor) issue('unavailable-layout', 'Building geometry or a supported layout projection is unavailable.');
    const layout = candidates.length === 1 ? world.layouts.find(l => l.id === candidates[0]) : undefined;
    if (layout && (layout.evidence.certainty === 'unknown' || layout.buildings.some(b => b.evidence.certainty === 'unknown'))) issue('unreviewed-geometry', 'The layout or a building placement has no established interpretation.');
    const placedAssets = new Set(layout?.buildings.map(b => b.assetId));
    const assets = new Set([...scene.assetIds, ...placedAssets]);
    result.assets = [...assets].map(id => {
      const reference = world.assets.find(a => a.id === id)!;
      const binding = resolveHistoricalAsset(reference, scene.placeId, time);
      const status = binding.status !== 'registered' ? binding.status : reference.evidence.certainty === 'unknown' ? 'unreviewed' : !['building', 'infrastructure'].includes(reference.category) ? 'unsupported' : !placedAssets.has(id) ? 'unplaced' : 'registered';
      if (status !== 'registered') issue(`asset-${status}`, status === 'catalogue-blocked' ? binding.reason! : status === 'unresolved' ? 'A requested building model is unavailable.' : status === 'category-mismatch' ? 'An assigned model has the wrong category.' : status === 'unreviewed' ? 'A model has no established historical interpretation.' : status === 'unplaced' ? 'A requested model has no building placement.' : 'This asset category has no historical scene placement support.', id);
      return { id, ...(binding.registryId ? { registryId: binding.registryId } : {}), status, ...(binding.catalogue ? { catalogue: binding.catalogue } : {}) };
    });
    result.status = !result.issues.length && descriptor ? 'ready' : locationSupported && !scene.required && scene.fallback === 'map-only' ? 'map-only' : 'unavailable';
    if (result.status === 'ready') result.descriptorIds = [descriptor!.id];
    return result;
  });
  // A failed mandatory requirement cannot be bypassed by another optional scene at the same place.
  const blockedPlaces = new Set(results.filter(r => r.scene.required && r.status === 'unavailable').map(r => r.scene.placeId));
  for (const result of results) if (result.status === 'ready' && blockedPlaces.has(result.scene.placeId)) {
    result.status = 'unavailable'; result.descriptorIds = [];
    result.issues.push({ code: 'required-scene-unavailable', message: 'Another required scene at this place is unavailable.' });
  }
  return results;
}
