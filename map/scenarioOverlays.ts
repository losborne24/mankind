import type { GeoJSONSource, Map, MapLayerMouseEvent, ExpressionSpecification } from 'maplibre-gl';
import type { FeatureCollection, Feature } from 'geojson';
import type { HistoricalTime, ScenarioDefinition } from '@/lib/scenarios/schema';
import { contextFeatures } from '@/lib/scenarios/contextLayers';
const source = 'scenario-geography';
type Ring = [number, number][];
const labelPoints = new globalThis.Map<string, [number, number]>();
/** An interior point far from every edge (coarse pole of inaccessibility), so one label sits inside the shape. */
function labelPoint(id: string, rings: Ring[]): [number, number] {
    const cached = labelPoints.get(id);
    if (cached) return cached;
    const xs = rings[0].map(p => p[0]), ys = rings[0].map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const inside = (x: number, y: number) => { let c = false; for (const ring of rings) for (let i = 0; i < ring.length - 1; i++) { const [ax, ay] = ring[i], [bx, by] = ring[i + 1]; if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) c = !c; } return c; };
    const edge = (x: number, y: number) => { let best = Infinity; for (const ring of rings) for (let i = 0; i < ring.length - 1; i++) { const [ax, ay] = ring[i], [bx, by] = ring[i + 1], dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1))); best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy)); } return best; };
    let best: [number, number] = [(x0 + x1) / 2, (y0 + y1) / 2], score = -1;
    for (let i = 0; i <= 24; i++) for (let j = 0; j <= 24; j++) {
        const x = x0 + (x1 - x0) * i / 24, y = y0 + (y1 - y0) * j / 24;
        if (!inside(x, y)) continue;
        const d = edge(x, y);
        if (d > score) { score = d; best = [x, y]; }
    }
    labelPoints.set(id, best);
    return best;
}
const layers = ['scenario-labels', 'scenario-points', 'scenario-route', 'scenario-context-labels', 'scenario-context-markers', 'scenario-context-lines', 'scenario-context-outline', 'scenario-context-fill'];
const certainty = (documented: number | string, approximate: number | string, illustrative: number | string): ExpressionSpecification => ['match', ['get', 'certainty'], 'documented', documented, 'approximate', approximate, illustrative];
const fills: ExpressionSpecification = ['match', ['get', 'style'], 'water', '#5f8ea3', 'ground', '#b3a78e', 'extent', '#d2b36b', 'footprint', '#e9b75d', 'structure', '#c9b9a0', '#c9b9a0'];
export function scenarioOverlays(map: Map, onInspect?: (id: string) => void) {
    map.addSource(source, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    // Illustrative ground and water sit under everything else so no beat shows the bare biome plane.
    map.addLayer({ id: 'scenario-context-fill', type: 'fill', source, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': fills, 'fill-opacity': ['match', ['get', 'style'], 'ground', .92, 'water', .88, 'extent', .16, 'footprint', .35, .3] } });
    map.addLayer({ id: 'scenario-context-outline', type: 'line', source, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'line-color': ['match', ['get', 'style'], 'ground', 'rgba(0,0,0,0)', 'water', '#8fb8c9', '#f0d79a'], 'line-width': ['match', ['get', 'style'], 'footprint', 2, 1.5], 'line-opacity': ['case', ['==', ['get', 'state'], 'possible'], .45, .9], 'line-dasharray': ['match', ['get', 'certainty'], 'documented', ['literal', [1, 0]], ['literal', [3, 2]]] } });
    map.addLayer({ id: 'scenario-route', type: 'line', source, filter: ['==', ['get', 'kind'], 'route'], paint: { 'line-color': '#f0b64a', 'line-width': 3, 'line-opacity': .75 } });
    map.addLayer({ id: 'scenario-context-lines', type: 'line', source, filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'kind'], 'context']], paint: { 'line-color': '#f0d79a', 'line-width': 3, 'line-opacity': ['case', ['==', ['get', 'state'], 'possible'], .4, .85], 'line-dasharray': certainty(['literal', [1, 0]] as unknown as number, ['literal', [3, 2]] as unknown as number, ['literal', [1, 2]] as unknown as number) } });
    map.addLayer({ id: 'scenario-points', type: 'circle', source, filter: ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'kind'], 'point']], paint: { 'circle-radius': 6, 'circle-color': '#f0b64a', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } });
    // Orientation labels use a lighter, smaller style than sourced layers.
    map.addLayer({ id: 'scenario-context-markers', type: 'circle', source, filter: ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'kind'], 'context'], ['!=', ['get', 'style'], 'orientation'], ['!=', ['get', 'label'], true]], paint: { 'circle-radius': 5, 'circle-color': certainty('#f0b64a', '#d3b77e', '#9aa4ab'), 'circle-stroke-width': 1.5, 'circle-stroke-color': '#fff', 'circle-opacity': ['case', ['==', ['get', 'state'], 'possible'], .5, 1] } });
    map.addLayer({ id: 'scenario-context-labels', type: 'symbol', source, filter: ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'kind'], 'context']], layout: { 'symbol-placement': 'point', 'text-field': ['get', 'title'], 'text-size': ['match', ['get', 'style'], 'orientation', 11, 12], 'text-offset': ['match', ['get', 'style'], 'orientation', ['literal', [0, 0]], ['literal', [0, 1.1]]], 'text-anchor': ['match', ['get', 'style'], 'orientation', 'center', 'top'], 'text-letter-spacing': ['match', ['get', 'style'], 'orientation', .12, 0], 'text-transform': ['match', ['get', 'style'], 'orientation', 'uppercase', 'none'], 'text-max-width': 9 }, paint: { 'text-color': ['match', ['get', 'style'], 'orientation', 'rgba(255,255,255,.7)', '#fff'], 'text-halo-color': '#0b1119', 'text-halo-width': ['match', ['get', 'style'], 'orientation', 1.2, 2], 'text-opacity': ['case', ['==', ['get', 'state'], 'possible'], .6, 1] } });
    map.addLayer({ id: 'scenario-labels', type: 'symbol', source, filter: ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'kind'], 'point']], layout: { 'text-field': ['get', 'title'], 'text-size': 12, 'text-offset': [0, 1.4], 'text-anchor': 'top' }, paint: { 'text-color': '#fff', 'text-halo-color': '#0b1119', 'text-halo-width': 2 } });
    const inspect = (event: MapLayerMouseEvent) => {
        // The ground tile sits under everything; a click on it should reach the feature above, or nothing.
        const id = event.features?.find(f => f.properties?.style !== 'ground')?.properties?.id;
        if (typeof id === 'string') onInspect?.(id);
    };
    const inspectable = ['scenario-context-markers', 'scenario-context-lines', 'scenario-context-fill', 'scenario-context-labels'];
    const pointer = () => { map.getCanvas().style.cursor = 'pointer'; };
    const reset = () => { map.getCanvas().style.cursor = ''; };
    if (onInspect) for (const id of inspectable) { map.on('click', id, inspect); map.on('mouseenter', id, pointer); map.on('mouseleave', id, reset); }
    return {
        /** Date-filtered, so layers outside the viewing date are left out rather than drawn faintly. */
        update(ids: string[], scenario: ScenarioDefinition, at: HistoricalTime = scenario.scope.time) {
            const features: Feature[] = [];
            const context = contextFeatures(scenario, ids, at);
            for (const overlay of scenario.content.overlays.filter(o => ids.includes(o.id))) {
                if (overlay.type === 'point') {
                    const location = scenario.content.locations.find(l => l.id === overlay.location)!;
                    if (location.context) continue;
                    features.push({ type: 'Feature', properties: { kind: 'point', title: location.title }, geometry: { type: 'Point', coordinates: location.coordinate } });
                }
                if (overlay.type === 'route') {
                    const route = scenario.content.routes.find(r => r.id === overlay.route)!;
                    features.push({ type: 'Feature', properties: { kind: 'route', certainty: route.certainty }, geometry: { type: 'LineString', coordinates: route.coordinates } });
                }
            }
            for (const feature of context) {
                if (feature.match === 'outside') continue;
                const properties = { kind: 'context', id: feature.id, title: feature.title, certainty: feature.certainty, style: feature.style, state: feature.match };
                if (feature.kind === 'marker') {
                    features.push({ type: 'Feature', properties, geometry: { type: 'Point', coordinates: scenario.content.locations.find(l => l.id === feature.id)!.coordinate } });
                } else {
                    const geometry = scenario.content.geometries!.find(g => g.id === feature.id)!;
                    features.push({ type: 'Feature', properties, geometry: feature.kind === 'polygon' ? { type: 'Polygon', coordinates: geometry.coordinates } : { type: 'MultiLineString', coordinates: geometry.coordinates } });
                    // Labels are separate points so each shape is named once, not once per tile.
                    if (feature.style !== 'ground') features.push({ type: 'Feature', properties: { ...properties, label: true }, geometry: { type: 'Point', coordinates: feature.kind === 'polygon' ? labelPoint(feature.id, geometry.coordinates as Ring[]) : geometry.coordinates[0][0] } });
                }
            }
            const data: FeatureCollection = { type: 'FeatureCollection', features };
            (map.getSource(source) as GeoJSONSource | undefined)?.setData(data);
        },
        dispose() {
            if (onInspect) for (const id of inspectable) { map.off('click', id, inspect); map.off('mouseenter', id, pointer); map.off('mouseleave', id, reset); }
            for (const id of layers)
                if (map.getLayer(id))
                    map.removeLayer(id);
            if (map.getSource(source))
                map.removeSource(source);
        },
    };
}
