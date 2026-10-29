import type { GeoJSONSource, Map } from 'maplibre-gl';
import type { FeatureCollection, Feature } from 'geojson';
import type { ScenarioDefinition } from '@/lib/scenarios/schema';
const source = 'scenario-geography';
export function scenarioOverlays(map: Map) {
    map.addSource(source, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'scenario-route', type: 'line', source, filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#f0b64a', 'line-width': 3, 'line-opacity': .75 } });
    map.addLayer({ id: 'scenario-points', type: 'circle', source, filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 6, 'circle-color': '#f0b64a', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } });
    map.addLayer({ id: 'scenario-labels', type: 'symbol', source, filter: ['==', ['geometry-type'], 'Point'], layout: { 'text-field': ['get', 'title'], 'text-size': 12, 'text-offset': [0, 1.4], 'text-anchor': 'top' }, paint: { 'text-color': '#fff', 'text-halo-color': '#0b1119', 'text-halo-width': 2 } });
    return {
        update(ids: string[], scenario: ScenarioDefinition) {
            const features: Feature[] = [];
            for (const overlay of scenario.content.overlays.filter(o => ids.includes(o.id))) {
                if (overlay.type === 'point') {
                    const location = scenario.content.locations.find(l => l.id === overlay.location)!;
                    features.push({ type: 'Feature', properties: { title: location.title }, geometry: { type: 'Point', coordinates: location.coordinate } });
                }
                if (overlay.type === 'route') {
                    const route = scenario.content.routes.find(r => r.id === overlay.route)!;
                    features.push({ type: 'Feature', properties: { certainty: route.certainty }, geometry: { type: 'LineString', coordinates: route.coordinates } });
                }
            }
            const data: FeatureCollection = { type: 'FeatureCollection', features };
            (map.getSource(source) as GeoJSONSource | undefined)?.setData(data);
        },
        dispose() {
            for (const id of ['scenario-labels', 'scenario-points', 'scenario-route'])
                if (map.getLayer(id))
                    map.removeLayer(id);
            if (map.getSource(source))
                map.removeSource(source);
        },
    };
}
