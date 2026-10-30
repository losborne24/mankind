import { assetRegistry, type AssetId } from '@/lib/assets/registry';
import { readAssetCatalogue } from '@/lib/assets/catalogue';
import { catalogueStatus, catalogueKey, type AssetCatalogue, type CatalogueVersion, type CatalogueReview } from '@/lib/assets/catalogueValidation';
import type { HistoricalAsset } from '@/lib/history/schema';
import type { HistoricalTime } from '@/lib/scenarios/schema';
import { matchHistoricalTime } from '@/lib/history/time';

export interface HistoricalAssetBinding {
  status: 'registered' | 'unresolved' | 'category-mismatch' | 'catalogue-blocked';
  registryId?: AssetId;
  reason?: string;
  catalogue?: { entry: CatalogueVersion; status: 'draft' | 'usable' | 'retired'; review?: CatalogueReview };
}
/** Validated records/snapshot only. No search, fetching, nearest-era match or floating latest version. */
export function resolveHistoricalAsset(reference: HistoricalAsset, placeId: string, time: HistoricalTime, catalogue?: AssetCatalogue, explicitInterpretation = false): HistoricalAssetBinding {
  let registryId = reference.registryId, metadata: HistoricalAssetBinding['catalogue'];
  if (reference.catalogueRef) {
    const snapshot = catalogue ?? readAssetCatalogue();
    const pin = reference.catalogueRef, entry = snapshot.entries.find(e => e.id === pin.id && e.version === pin.version);
    if (!entry) return { status: 'catalogue-blocked', reason: 'Pinned asset version is absent from the catalogue.' };
    const status = catalogueStatus(snapshot, entry), review = snapshot.reviews.filter(r => catalogueKey(r) === catalogueKey(entry)).at(-1);
    metadata = { entry, status, ...(review ? { review } : {}) };
    const blocked = (reason: string): HistoricalAssetBinding => ({ status: 'catalogue-blocked', reason, catalogue: metadata });
    if (status !== 'usable') return blocked(`Catalogue version is ${status}; no model will be selected.`);
    if (entry.placeId !== placeId) return blocked('Catalogue version belongs to another historical place.');
    if (entry.category !== reference.category) return blocked('Catalogue version has a different asset category.');
    const phase = matchHistoricalTime(entry.period, time);
    if (phase === 'outside' || phase === 'possible' && !explicitInterpretation) return blocked('Catalogue phase does not securely cover the selected date.');
    if (!entry.rendering || entry.rights.status !== 'cleared') return blocked('Catalogue model or reuse rights are unavailable.');
    registryId = entry.rendering.registryId;
  }
  if (!registryId || !Object.hasOwn(assetRegistry, registryId)) return { status: 'unresolved', ...(metadata ? { catalogue: metadata } : {}) };
  const asset = assetRegistry[registryId as AssetId];
  if (asset.category !== reference.category) return { status: 'category-mismatch', ...(metadata ? { catalogue: metadata } : {}) };
  return { status: 'registered', registryId: registryId as AssetId, ...(metadata ? { catalogue: metadata } : {}) };
}
