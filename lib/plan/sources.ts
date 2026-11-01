import type { SpatialBlueprint } from '@/lib/plan/contracts';
import type { AssetCatalogue } from '@/lib/assets/catalogueValidation';

export interface SourceEntry { id: string; title: string; url: string; licence?: string }

/**
 * Every source the blueprints and catalogue define, by id. Landmark snapshot sources (`source:osm-landmark-<id>`,
 * `source:ohm-landmark-<id>`) are not listed in the landmarks file: build-landmarks.mjs names them after the OpenStreetMap or
 * OpenHistoricalMap element each landmark records in `position`, under the snapshot licence in the file header. They resolve from
 * that record; an id with no record stays unresolved and Checkpoint A reports it.
 */
export function sourceIndex(blueprints: readonly SpatialBlueprint[], catalogue: AssetCatalogue): Map<string, SourceEntry> {
  const index = new Map<string, SourceEntry>();
  const add = (s: { id: string; title: string; url: string; licence?: string }) => { if (!index.has(s.id)) index.set(s.id, { id: s.id, title: s.title, url: s.url, ...(s.licence ? { licence: s.licence } : {}) }); };
  for (const b of blueprints) for (const layer of b.layers) {
    const listed = (layer.collections.sources ?? layer.header.sources) as { id: string; title: string; url: string; licence?: string }[] | undefined;
    listed?.forEach(add);
    if (layer.codec === 'rome-landmarks@1') {
      const header = layer.header as { osm: { accessed: string; licence: string }; ohm: { accessed: string; licence: string } };
      for (const l of layer.collections.landmarks as { id: string; title: string; position: string; sources: string[] }[]) {
        // The snapshot key is the OSM element's own name, not always the landmark id; the element is the one `position` names.
        for (const element of l.position.matchAll(/(OpenStreetMap|OpenHistoricalMap) (node|way|relation)\/(\d+)/g)) {
          const osm = element[1] === 'OpenStreetMap', cited = l.sources.filter(s => s.startsWith(`source:${osm ? 'osm' : 'ohm'}-landmark-`));
          if (cited.length !== 1) continue;
          add({ id: cited[0], title: `${l.title} · ${element[1]} ${element[2]} ${element[3]} (accessed ${(osm ? header.osm : header.ohm).accessed})`,
            url: `https://www.${osm ? 'openstreetmap' : 'openhistoricalmap'}.org/${element[2]}/${element[3]}`, licence: (osm ? header.osm : header.ohm).licence });
        }
      }
    }
  }
  for (const entry of catalogue.entries) entry.sources.forEach(s => add({ id: s.id, title: s.title, url: s.url }));
  return index;
}
