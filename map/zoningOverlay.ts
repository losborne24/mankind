import type { GeoJSONSource, Map, MapLayerMouseEvent } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import { colourOf, edgeFade, lineColour, romeZoning, unlabelled, zoningFeatures } from '@/lib/scenarios/zoning';
import type { HistoricalTime } from '@/lib/scenarios/schema';

const source = 'rome-zoning', fill = 'rome-zoning-fill', outline = 'rome-zoning-outline', extent = 'rome-zoning-extent', roads = 'rome-zoning-roads', markers = 'rome-zoning-markers', labels = 'rome-zoning-labels';
const all = [labels, markers, roads, extent, outline, fill];
const certainty = (documented: unknown, approximate: unknown, illustrative: unknown) => ['match', ['get', 'certainty'], 'documented', documented, 'approximate', approximate, illustrative] as never;
const role = (value: string) => ['==', ['get', 'role'], value] as never;

/**
 * The AD 100 land-use zoning as a 2D map layer: a tinted fill per zone, outlined solid (documented), dashed (approximate) or pale
 * (illustrative), the same convention as the other map layers; the approximate extent of the continuous city as a dashed line; and
 * the region and anchor markers; the suburbium as its three density classes, unoutlined. Roads and rivers fade out over the last
 * kilometre inside the frame. Everything is date-filtered. It sits under the reconstruction and the scenario layers, and gives
 * way to the lit 3D ground close in, like the flat ground does. The Campagna is left unfilled on the map (its square frame would show
 * on the globe); it is drawn in the 2D plan. Hidden until switched on.
 */
/** Cut lines into runs of equal edge fade (in tenths), dropping what lies on the frame's edge. */
function fadedRuns(lines: [number, number][][]): [number, [number, number][]][] {
  const runs: [number, [number, number][]][] = [];
  for (const line of lines) for (let n = 1; n < line.length; n++) {
    const fade = Math.round(edgeFade([(line[n - 1][0] + line[n][0]) / 2, (line[n - 1][1] + line[n][1]) / 2]) * 10) / 10, last = runs.at(-1);
    if (!fade) continue;
    if (last && last[0] === fade && last[1].at(-1) === line[n - 1]) last[1].push(line[n]); else runs.push([fade, [line[n - 1], line[n]]]);
  }
  return runs;
}

export function zoningOverlay(map: Map, onInspect: (id: string) => void) {
  map.addSource(source, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  const before = ['reconstruction-fill', 'scenario-context-fill'].find(id => map.getLayer(id));
  const handover = ['-', 1, ['coalesce', ['global-state', 'local-ground'], 0]] as never;
  const hidden = { visibility: 'none' } as const;
  map.addLayer({ id: fill, type: 'fill', source, filter: role('zone'), layout: hidden,
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['*', ['*', ['coalesce', ['get', 'fade'], 1], ['match', ['get', 'ring'], 'campagna', 0, 'suburbium', ['case', ['==', ['get', 'use'], 'suburban'], .4, .5], certainty(.55, .5, .32)]], handover] as never } }, before);
  map.addLayer({ id: outline, type: 'line', source, filter: ['all', role('zone'), ['!', ['in', ['get', 'ring'], ['literal', ['river', 'campagna']]]], ['!=', ['get', 'use'], 'suburban']] as never, layout: hidden,
    paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1, 16, 2] as never, 'line-opacity': ['*', certainty(.95, .9, .45), handover] as never,
      'line-dasharray': certainty(['literal', [1, 0]], ['literal', [3, 2]], ['literal', [1, 2]]) } }, before);
  map.addLayer({ id: extent, type: 'line', source, filter: role('extent'), layout: hidden,
    paint: { 'line-color': '#fff6e0', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.5, 15, 2.5] as never, 'line-opacity': ['*', .85, handover] as never, 'line-dasharray': ['literal', [4, 3]] } }, before);
  // Roads and aqueducts: solid documented, dashed approximate, dotted illustrative; aqueducts wider and paler.
  map.addLayer({ id: roads, type: 'line', source, filter: role('line'), layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 10, ['case', ['==', ['get', 'kind'], 'aqueduct'], 2.5, 1.2], 15, ['case', ['==', ['get', 'kind'], 'aqueduct'], 5, 2.5]] as never,
      'line-opacity': ['*', ['*', ['coalesce', ['get', 'fade'], 1], ['case', ['==', ['get', 'link'], true], .55, .9]], handover] as never, 'line-dasharray': certainty(['literal', [1, 0]], ['literal', [3, 2]], ['literal', [1, 2]]) } });
  map.addLayer({ id: markers, type: 'circle', source, minzoom: 12, filter: role('marker'), layout: hidden,
    paint: { 'circle-radius': 4, 'circle-color': ['case', ['==', ['get', 'kind'], 'region'], '#f0b64a', '#9fd6ff'] as never, 'circle-stroke-width': 1.2, 'circle-stroke-color': '#fff', 'circle-opacity': certainty(1, 1, .6) } });
  map.addLayer({ id: labels, type: 'symbol', source, minzoom: 12.5, maxzoom: 16.5, filter: ['in', ['get', 'role'], ['literal', ['label', 'marker']]] as never,
    layout: { visibility: 'none', 'text-field': ['get', 'short'], 'text-size': ['case', role('marker'), 10, 11] as never, 'text-letter-spacing': .08, 'text-max-width': 8,
      'text-offset': ['case', role('marker'), ['literal', [0, 1]], ['literal', [0, 0]]] as never, 'text-anchor': ['case', role('marker'), 'top', 'center'] as never },
    paint: { 'text-color': ['case', role('marker'), '#ffe7b0', '#fff'] as never, 'text-halo-color': 'rgba(11,17,25,.6)', 'text-halo-width': 1.2, 'text-opacity': certainty(1, .9, .6) } });
  const click = (event: MapLayerMouseEvent) => { const id = event.features?.[0]?.properties?.id; if (typeof id === 'string') onInspect(id); };
  map.on('click', fill, click); map.on('click', markers, click); map.on('click', roads, click);
  return {
    /** Date-filtered like every other layer: a zone or marker outside the viewing date is left out. */
    update(visible: boolean, at: HistoricalTime) {
      const shown = new Set(zoningFeatures(at).filter(f => f.match !== 'outside').map(f => f.id));
      const { extent: area } = romeZoning;
      const features: Feature[] = [
        ...(shown.has(area.id) ? [{ type: 'Feature', properties: { role: 'extent', id: area.id }, geometry: { type: 'LineString', coordinates: area.ring } } as Feature] : []),
        ...romeZoning.zones.filter(z => shown.has(z.id)).flatMap((z): Feature[] => {
          const properties = { id: z.id, short: z.short ?? '', certainty: z.certainty, color: colourOf(z), ring: z.ring, use: z.use, band: z.band ?? 0 };
          return [...z.multipolygon.map((coordinates, k): Feature => ({ type: 'Feature', properties: { ...properties, role: 'zone', fade: z.fade?.[k] ?? 1 }, geometry: { type: 'Polygon', coordinates } })).filter(f => f.properties!.fade > 0),
            ...(unlabelled(z) ? [] : [{ type: 'Feature', properties: { ...properties, role: 'label' }, geometry: { type: 'Point', coordinates: z.label } } as Feature])];
        }),
        // Roads and aqueducts in short runs, each faded near the frame's edge; gaps dotted; the ways in to the gates fainter, over the city.
        ...romeZoning.lines.filter(l => shown.has(l.id)).flatMap(l => [
          ...fadedRuns(l.lines).map(([fade, coordinates]): Feature => ({ type: 'Feature', properties: { role: 'line', id: l.id, kind: l.kind, certainty: l.certainty, color: lineColour[l.kind], fade }, geometry: { type: 'LineString', coordinates } })),
          ...fadedRuns(l.gaps ?? []).map(([fade, coordinates]): Feature => ({ type: 'Feature', properties: { role: 'line', id: l.id, kind: l.kind, certainty: 'illustrative', color: lineColour[l.kind], fade }, geometry: { type: 'LineString', coordinates } })),
          ...(l.links ?? []).map((link): Feature => ({ type: 'Feature', properties: { role: 'line', id: l.id, kind: l.kind, certainty: link.certainty, color: lineColour[l.kind], link: true }, geometry: { type: 'LineString', coordinates: link.line } }))]),
        ...romeZoning.markers.filter(m => shown.has(m.id)).map((m): Feature => ({ type: 'Feature', properties: { role: 'marker', id: m.id, kind: m.kind, certainty: m.certainty, short: m.title.replace(/ \(.*\)$/, '') }, geometry: { type: 'Point', coordinates: m.coordinate } })),
      ];
      (map.getSource(source) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features } as FeatureCollection);
      for (const id of all) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    },
    dispose() {
      map.off('click', fill, click); map.off('click', markers, click); map.off('click', roads, click);
      for (const id of all) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(source)) map.removeSource(source);
    },
  };
}
