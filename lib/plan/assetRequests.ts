import type { AssetRequest, PlanFeature, SpatialBlueprint } from '@/lib/plan/contracts';
import { landmarkRow } from '@/lib/plan/codecs';
import { catalogueStatus, type AssetCatalogue } from '@/lib/assets/catalogueValidation';

/**
 * The content-production queue. A Rome landmark is drawn as a kit massing (rung 3); its request asks for a reviewed bespoke model
 * (rung 1) and lists what the evidence lacks. Requests are keyed by the feature, so every scene needing the same monument shares one.
 */
export function landmarkAssetRequest(blueprint: SpatialBlueprint, feature: PlanFeature, catalogue: AssetCatalogue): AssetRequest | undefined {
  if (feature.kind !== 'landmark' || !feature.asset?.requestId || !feature.record) return undefined;
  const layer = blueprint.layers.find(l => l.id === feature.record!.layer);
  if (layer?.codec !== 'rome-landmarks@1') return undefined;
  const row = landmarkRow(layer, feature.record.index) as ReturnType<typeof landmarkRow> & { built: number };
  const proposedId = `catalogue:${blueprint.place.id.replace(/^place:/, '')}-${row.id}`;
  const entry = catalogue.entries.filter(e => e.id === proposedId).sort((a, b) => b.version - a.version)[0];
  const missing = [
    'A bespoke exterior model, ingested as a catalogue version with sources, feature certainty, rights and a recorded review',
    ...(row.certainty === 'best-guess' ? ['A sourced position and footprint: the placeholder is placed and sized as a best guess'] : []),
    ...(!row.size ? ['Published plan dimensions: the placeholder uses a kit default'] : []),
    'Elevation evidence (orders, storeys, roof form) for the model beyond the published height',
  ];
  return {
    id: feature.asset.requestId,
    feature: { blueprint: blueprint.id, feature: feature.id },
    title: `${row.title} · bespoke model`,
    catalogue: { proposedId, ...(entry ? { existing: { id: entry.id, version: entry.version, status: catalogueStatus(catalogue, entry) } } : {}) },
    location: { anchor: row.centre, ...(row.size ? { sizeMeters: row.size } : {}), ...(row.height !== undefined ? { heightMeters: row.height } : {}), angleDegrees: row.angle, positionNote: row.position },
    // From construction to the blueprint's date: the period the placeholder already stands for.
    period: { start: { year: row.built }, end: blueprint.applicability.end ?? blueprint.applicability.start },
    assetType: 'bespoke-landmark',
    detail: `Exterior of the ${row.kit.replace(/-/g, ' ')} at its mapped footprint${row.size ? ` (${row.size[0]} × ${row.size[1]} m)` : ''}${row.height !== undefined ? `, ${row.height} m high` : ''}, replacing the kit massing.`,
    currentRung: 3, targetRung: 1,
    evidence: feature.evidence, refs: feature.refs, missing,
  };
}

/** What the pinned catalogue version says it leaves out: the architectural-scale gaps of a site whose exterior exists. */
export function architecturalAssetRequest(blueprint: SpatialBlueprint, feature: PlanFeature, catalogue: AssetCatalogue): AssetRequest | undefined {
  const pin = feature.asset?.catalogue;
  const entry = pin && catalogue.entries.find(e => e.id === pin.id && e.version === pin.version);
  if (!entry) return undefined;
  const omitted = entry.limitations.filter(l => /omitted|interior/i.test(l));
  if (!omitted.length) return undefined;
  return {
    id: `asset-request:${blueprint.id.replace(/^blueprint:/, '')}/interior`,
    feature: { blueprint: blueprint.id, feature: feature.id },
    title: `${blueprint.place.title} · interior and architectural detail`,
    catalogue: { proposedId: `${entry.id}-interior`, existing: { id: entry.id, version: entry.version, status: catalogueStatus(catalogue, entry) } },
    location: { anchor: blueprint.place.anchor, positionNote: 'Within the pinned exterior model.' },
    period: entry.period,
    assetType: 'interior',
    detail: `Architectural-scale detail the exterior model ${entry.id}@${entry.version} omits.`,
    currentRung: 5, targetRung: 1,
    evidence: { certainty: 'unknown', sources: entry.sources.map(s => s.id), note: entry.limitations.join(' ') },
    refs: [{ store: 'catalogue', id: entry.id, version: entry.version }],
    missing: omitted,
  };
}
