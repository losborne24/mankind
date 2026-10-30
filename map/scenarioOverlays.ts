import type { GeoJSONSource, Map, MapLayerMouseEvent, ExpressionSpecification, CircleLayerSpecification, SymbolLayerSpecification } from 'maplibre-gl';
import type { FeatureCollection, Feature } from 'geojson';
import type { HistoricalTime, ScenarioDefinition } from '@/lib/scenarios/schema';
import { contextFeatures } from '@/lib/scenarios/contextLayers';
import { LOD_DISTANCES } from '@/map/settlements/settlementStreaming';
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
/** Centreline of a river polygon, midway between its banks row by row, for a label that follows the water. */
function centreline(ring: Ring): [number, number][] {
    const ys = ring.map(p => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys), line: [number, number][] = [];
    let previous: number | undefined;
    for (let i = 1; i < 120; i++) {
        const y = y0 + (y1 - y0) * (i - .5) / 120, xs: number[] = [];
        for (let j = 0; j < ring.length - 1; j++) { const [ax, ay] = ring[j], [bx, by] = ring[j + 1]; if ((ay > y) !== (by > y)) xs.push(ax + (bx - ax) * (y - ay) / (by - ay)); }
        xs.sort((a, b) => a - b);
        const spans: [number, number][] = [];
        for (let j = 0; j + 1 < xs.length; j += 2) spans.push([xs[j], xs[j + 1]]);
        if (!spans.length) continue;
        const mid = (s: [number, number]) => (s[0] + s[1]) / 2;
        const span = previous === undefined ? spans.reduce((a, b) => b[1] - b[0] > a[1] - a[0] ? b : a) : spans.reduce((a, b) => Math.abs(mid(b) - previous!) < Math.abs(mid(a) - previous!) ? b : a);
        previous = mid(span);
        line.push([previous, y]);
    }
    return line;
}
// Context LOD. Zooms are the map zoom at which the camera sits LOD_DISTANCES away (800 px viewport, 36.9 degree fov, Rome's latitude),
// so the ground and labels hand over at the same points as the settlement scene: regional below, local above.
const zoomAt = (metres: number) => Math.log2(78271.517 * Math.cos(41.89 * Math.PI / 180) * 1200 / metres);
const REGIONAL_ZOOM = zoomAt(LOD_DISTANCES.regionalEnter), LOCAL_ZOOM = zoomAt(LOD_DISTANCES.localEnter);
/** Where each named detail first earns its label; the site name and its single marker cover everything below. */
const labelTiers: { id: string; minzoom: number; ids: string[] }[] = [
    { id: 'crossing', minzoom: 15.5, ids: ['pons-aemilius', 'portus-tiberinus', 'cloaca-maxima-outlet'] },
    { id: 'market', minzoom: 16.5, ids: ['ara-maxima', 'arch-of-janus', 'santa-maria-in-cosmedin'] },
    { id: 'temples', minzoom: 17, ids: ['hercules-victor-footprint', 'portunus-footprint'] },
];
// The river's source polygon is finite, so it fades in rather than showing its ends at regional zoom; full before 'Rome from above' (z14.7).
const RIVER_FULL_ZOOM = 14.5;
const SITE = 'forum-boarium', ORIENTATION_MINZOOM = 14, SITE_MARKER_MAXZOOM = 16;
const labelLayerIds = ['scenario-context-labels', ...labelTiers.map(t => `scenario-context-labels-${t.id}`), 'scenario-context-labels-site', 'scenario-context-labels-river'];
const markerLayerIds = ['scenario-context-markers', ...labelTiers.map(t => `scenario-context-markers-${t.id}`), 'scenario-context-markers-site'];
const layers = ['scenario-labels', 'scenario-points', 'scenario-route', ...labelLayerIds, ...markerLayerIds, 'scenario-context-lines', 'scenario-context-outline', 'scenario-context-fill'];
const certainty = (documented: number | string, approximate: number | string, illustrative: number | string): ExpressionSpecification => ['match', ['get', 'certainty'], 'documented', documented, 'approximate', approximate, illustrative];
const fills: ExpressionSpecification = ['match', ['get', 'style'], 'water', '#5f8ea3', 'ground', '#b3a78e', 'extent', '#d2b36b', 'footprint', '#e9b75d', 'structure', '#c9b9a0', '#c9b9a0'];
export function scenarioOverlays(map: Map, onInspect?: (id: string) => void) {
    map.addSource(source, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    // Illustrative ground and water sit under everything else so no beat shows the bare biome plane.
    map.addLayer({ id: 'scenario-context-fill', type: 'fill', source, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': fills, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], REGIONAL_ZOOM, ['match', ['get', 'style'], 'ground', 0, 'water', 0, 'extent', .16, 'footprint', .35, .3], RIVER_FULL_ZOOM, ['match', ['get', 'style'], 'ground', 0, 'water', .88, 'extent', .16, 'footprint', .35, .3], LOCAL_ZOOM, ['match', ['get', 'style'], 'ground', .38, 'water', .88, 'extent', .16, 'footprint', .35, .3]] } });
    map.addLayer({ id: 'scenario-context-outline', type: 'line', source, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'line-color': ['match', ['get', 'style'], 'ground', 'rgba(0,0,0,0)', 'water', '#8fb8c9', '#f0d79a'], 'line-width': ['match', ['get', 'style'], 'footprint', 2, 1.5], 'line-opacity': ['interpolate', ['linear'], ['zoom'], REGIONAL_ZOOM, ['case', ['==', ['get', 'style'], 'water'], 0, ['==', ['get', 'state'], 'possible'], .45, .9], RIVER_FULL_ZOOM, ['case', ['==', ['get', 'state'], 'possible'], .45, .9]], 'line-dasharray': ['match', ['get', 'certainty'], 'documented', ['literal', [1, 0]], ['literal', [3, 2]]] } });
    map.addLayer({ id: 'scenario-route', type: 'line', source, filter: ['==', ['get', 'kind'], 'route'], paint: { 'line-color': '#f0b64a', 'line-width': 3, 'line-opacity': .75 } });
    map.addLayer({ id: 'scenario-context-lines', type: 'line', source, filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'kind'], 'context'], ['!=', ['get', 'label'], true]], paint: { 'line-color': '#f0d79a', 'line-width': 3, 'line-opacity': ['case', ['==', ['get', 'state'], 'possible'], .4, .85], 'line-dasharray': certainty(['literal', [1, 0]] as unknown as number, ['literal', [3, 2]] as unknown as number, ['literal', [1, 2]] as unknown as number) } });
    map.addLayer({ id: 'scenario-points', type: 'circle', source, filter: ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'kind'], 'point']], paint: { 'circle-radius': 6, 'circle-color': '#f0b64a', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } });
    const pointOf = (...extra: ExpressionSpecification[]): ExpressionSpecification => ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'kind'], 'context'], ...extra];
    const named = (ids: string[]): ExpressionSpecification => ['in', ['get', 'id'], ['literal', ids]];
    const allTierIds = labelTiers.flatMap(t => t.ids);
    const markerPaint: CircleLayerSpecification['paint'] = { 'circle-radius': 5, 'circle-color': certainty('#f0b64a', '#d3b77e', '#9aa4ab'), 'circle-stroke-width': 1.5, 'circle-stroke-color': '#fff', 'circle-opacity': ['case', ['==', ['get', 'state'], 'possible'], .5, 1] };
    // Detail markers and their labels arrive with the camera; below that the site has one marker and one label.
    for (const tier of labelTiers) {
        map.addLayer({ id: `scenario-context-markers-${tier.id}`, type: 'circle', source, minzoom: tier.minzoom, filter: pointOf(['!=', ['get', 'label'], true], named(tier.ids)), paint: markerPaint });
    }
    map.addLayer({ id: 'scenario-context-markers', type: 'circle', source, filter: pointOf(['!=', ['get', 'style'], 'orientation'], ['!=', ['get', 'label'], true], ['!', named(allTierIds)]), paint: markerPaint });
    map.addLayer({ id: 'scenario-context-markers-site', type: 'circle', source, maxzoom: SITE_MARKER_MAXZOOM, filter: pointOf(['==', ['get', 'label'], true], named([SITE])), paint: markerPaint });
    // Label layouts are literal per layer: collision is a layer property, and a data expression there invalidates the style.
    const labelLayout: SymbolLayerSpecification['layout'] = { 'text-field': ['coalesce', ['get', 'short'], ['get', 'title']], 'text-size': 12, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-max-width': 9 };
    const labelPaint: SymbolLayerSpecification['paint'] = { 'text-color': '#fff', 'text-halo-color': 'rgba(11,17,25,.55)', 'text-halo-width': 1.2, 'text-opacity': ['case', ['==', ['get', 'state'], 'possible'], .6, 1] };
    // MapLibre places the topmost symbol layer first, so layers are added lowest priority first: river, site name, hills, then the details.
    // The river is named along its own course, repeated sparsely rather than pinned beside the Forum.
    map.addLayer({ id: 'scenario-context-labels-river', type: 'symbol', source, minzoom: ORIENTATION_MINZOOM, filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'kind'], 'context'], ['==', ['get', 'label'], true]], layout: { 'symbol-placement': 'line', 'symbol-spacing': 700, 'text-field': ['coalesce', ['get', 'short'], ['get', 'title']], 'text-size': 12, 'text-letter-spacing': .1, 'text-max-angle': 30 }, paint: { 'text-color': '#cfe6f0', 'text-halo-color': 'rgba(11,17,25,.6)', 'text-halo-width': 1.2, 'text-opacity': ['case', ['==', ['get', 'state'], 'possible'], .6, 1] } });
    map.addLayer({ id: 'scenario-context-labels-site', type: 'symbol', source, filter: pointOf(['==', ['get', 'label'], true], named([SITE])), layout: { ...labelLayout, 'symbol-placement': 'point' }, paint: labelPaint });
    // Orientation labels use a lighter, smaller style; they outrank the site name so the hills keep theirs.
    map.addLayer({ id: 'scenario-context-labels', type: 'symbol', source, minzoom: ORIENTATION_MINZOOM, filter: pointOf(['==', ['get', 'style'], 'orientation']), layout: { ...labelLayout, 'symbol-placement': 'point', 'text-size': 11, 'text-offset': [0, 0], 'text-anchor': 'center', 'text-letter-spacing': .12, 'text-transform': 'uppercase' }, paint: { ...labelPaint, 'text-color': 'rgba(255,255,255,.7)', 'text-halo-width': 1 } });
    for (const tier of labelTiers)
        map.addLayer({ id: `scenario-context-labels-${tier.id}`, type: 'symbol', source, minzoom: tier.minzoom, filter: pointOf(['!=', ['get', 'style'], 'orientation'], named(tier.ids)), layout: { ...labelLayout, 'symbol-placement': 'point' }, paint: labelPaint });
    map.addLayer({ id: 'scenario-labels', type: 'symbol', source, filter: ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'kind'], 'point']], layout: { 'text-field': ['get', 'title'], 'text-size': 12, 'text-offset': [0, 1.4], 'text-anchor': 'top' }, paint: { 'text-color': '#fff', 'text-halo-color': '#0b1119', 'text-halo-width': 2 } });
    const inspect = (event: MapLayerMouseEvent) => {
        // The ground tile sits under everything; a click on it should reach the feature above, or nothing.
        const id = event.features?.find(f => f.properties?.style !== 'ground')?.properties?.id;
        if (typeof id === 'string') onInspect?.(id);
    };
    const inspectable = ['scenario-context-lines', 'scenario-context-fill', ...labelLayerIds, ...markerLayerIds];
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
                const properties = { kind: 'context', id: feature.id, title: feature.title, ...(feature.short ? { short: feature.short } : {}), certainty: feature.certainty, style: feature.style, state: feature.match };
                if (feature.kind === 'marker') {
                    features.push({ type: 'Feature', properties, geometry: { type: 'Point', coordinates: scenario.content.locations.find(l => l.id === feature.id)!.coordinate } });
                } else {
                    const geometry = scenario.content.geometries!.find(g => g.id === feature.id)!;
                    features.push({ type: 'Feature', properties, geometry: feature.kind === 'polygon' ? { type: 'Polygon', coordinates: geometry.coordinates } : { type: 'MultiLineString', coordinates: geometry.coordinates } });
                    // Labels are separate points so each shape is named once, not once per tile.
                    if (feature.style === 'water' && feature.kind === 'polygon') features.push({ type: 'Feature', properties: { ...properties, label: true }, geometry: { type: 'LineString', coordinates: centreline((geometry.coordinates as Ring[])[0]) } });
                    else if (feature.style !== 'ground') features.push({ type: 'Feature', properties: { ...properties, label: true }, geometry: { type: 'Point', coordinates: feature.kind === 'polygon' ? labelPoint(feature.id, geometry.coordinates as Ring[]) : geometry.coordinates[0][0] } });
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
