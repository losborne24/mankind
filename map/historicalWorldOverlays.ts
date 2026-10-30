import type { GeoJSONSource, Map, MapLayerMouseEvent } from 'maplibre-gl';
import type { FeatureCollection, Feature } from 'geojson';
import type { HistoricalSelection } from '@/lib/history/selection';

/** Map-only historical discovery. No scene/GLB loads and no camera mutations. */
export function historicalWorldOverlays(map: Map, onInspectPlace?: (id: string) => void) {
  const source = 'historical-world-records';
  let visibleIds = new Set<string>();
  const inspect = (event: MapLayerMouseEvent) => {
    const id = event.features?.[0]?.properties?.id;
    if (typeof id === 'string' && visibleIds.has(id)) onInspectPlace?.(id);
  };
  map.addSource(source, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'historical-world-reference-areas', type: 'line', source, filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['==', ['get', 'referenceOnly'], true]], paint: { 'line-color': '#9ccacb', 'line-width': 2, 'line-opacity': .8, 'line-dasharray': [3, 2] } });
  map.addLayer({ id: 'historical-world-footprints', type: 'line', source, filter: ['==', ['get', 'footprint'], true], paint: { 'line-color': '#e9b75d', 'line-width': 2.5, 'line-opacity': .9, 'line-dasharray': [2, 2] } });
  map.addLayer({ id: 'historical-world-routes', type: 'line', source, filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#d3b77e', 'line-width': 2, 'line-opacity': .55, 'line-dasharray': [2, 2] } });
  map.addLayer({ id: 'historical-world-points', type: 'circle', source, filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 5, 'circle-color': ['case', ['get', 'possible'], '#ac9376', '#f0b64a'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } });
  map.addLayer({ id: 'historical-world-labels', type: 'symbol', source, filter: ['==', ['geometry-type'], 'Point'], layout: { 'text-field': ['get', 'title'], 'text-size': 11, 'text-offset': [0, 1.2], 'text-anchor': 'top' }, paint: { 'text-color': '#fff', 'text-halo-color': '#0b1119', 'text-halo-width': 2 } });
  if (onInspectPlace) map.on('click', 'historical-world-points', inspect);
  return {
    update(selection: HistoricalSelection | null) {
      const features: Feature[] = [];
      visibleIds = new Set();
      for (const area of selection?.referenceAreas ?? []) features.push({ type: 'Feature', properties: { id: area.id, title: area.title, referenceOnly: true }, geometry: area.geometry });
      for (const { footprint, match } of selection?.footprints ?? []) features.push({ type: 'Feature', properties: { id: footprint.id, title: footprint.title, footprint: true, possible: match === 'possible', representation: footprint.representation }, geometry: footprint.geometry });
      for (const row of selection?.places ?? []) {
        if (!['within', 'possible'].includes(row.presence) || Math.abs(row.place.position.coordinate[1]) > 85) continue;
        const events = selection!.events.filter(e => e.event.locations.some(l => l.placeId === row.place.id));
        visibleIds.add(row.place.id);
        features.push({ type: 'Feature', properties: { id: row.place.id, title: row.place.title, possible: row.presence === 'possible', certainty: row.place.position.evidence.certainty, events: events.map(e => e.event.title).join('; '), basis: row.basis }, geometry: { type: 'Point', coordinates: row.place.position.coordinate } });
      }
      for (const { route, match } of selection?.routes ?? []) {
        if (route.coordinates.some(p => Math.abs(p[1]) > 85)) continue;
        features.push({ type: 'Feature', properties: { id: route.id, certainty: route.evidence.certainty, possible: match === 'possible' }, geometry: { type: 'LineString', coordinates: route.coordinates } });
      }
      (map.getSource(source) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features } as FeatureCollection);
    },
    dispose() {
      visibleIds.clear();
      if (onInspectPlace) map.off('click', 'historical-world-points', inspect);
      for (const id of ['historical-world-labels', 'historical-world-points', 'historical-world-routes', 'historical-world-reference-areas', 'historical-world-footprints']) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(source)) map.removeSource(source);
    },
  };
}
