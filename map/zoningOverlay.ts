import type { GeoJSONSource, Map, MapLayerMouseEvent } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import { romeZoning, zoneColour, zoningFeatures } from '@/lib/scenarios/zoning';
import type { HistoricalTime } from '@/lib/scenarios/schema';

const source = 'rome-zoning', fill = 'rome-zoning-fill', outline = 'rome-zoning-outline', labels = 'rome-zoning-labels';
const certainty = (documented: unknown, approximate: unknown, illustrative: unknown) => ['match', ['get', 'certainty'], 'documented', documented, 'approximate', approximate, illustrative] as never;

/**
 * The AD 100 land-use zoning as a 2D map layer: a tinted fill per zone, outlined solid (documented), dashed (approximate) or pale
 * (illustrative), the same convention as the other map layers. It sits under the reconstruction and the scenario layers, and gives
 * way to the lit 3D ground close in, like the flat ground does. Hidden until switched on.
 */
export function zoningOverlay(map: Map, onInspect: (id: string) => void) {
  map.addSource(source, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  const before = ['reconstruction-fill', 'scenario-context-fill'].find(id => map.getLayer(id));
  const handover = ['-', 1, ['coalesce', ['global-state', 'local-ground'], 0]] as never;
  map.addLayer({ id: fill, type: 'fill', source, filter: ['==', ['geometry-type'], 'Polygon'], layout: { visibility: 'none' },
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['*', certainty(.55, .5, .32), handover] as never } }, before);
  map.addLayer({ id: outline, type: 'line', source, filter: ['==', ['geometry-type'], 'Polygon'], layout: { visibility: 'none' },
    paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1, 16, 2] as never, 'line-opacity': ['*', certainty(.95, .9, .45), handover] as never,
      'line-dasharray': certainty(['literal', [1, 0]], ['literal', [3, 2]], ['literal', [1, 2]]) } }, before);
  map.addLayer({ id: labels, type: 'symbol', source, minzoom: 12.5, maxzoom: 16.5, filter: ['==', ['geometry-type'], 'Point'], layout: { visibility: 'none', 'text-field': ['get', 'short'], 'text-size': 11, 'text-letter-spacing': .08, 'text-max-width': 8 },
    paint: { 'text-color': '#fff', 'text-halo-color': 'rgba(11,17,25,.6)', 'text-halo-width': 1.2, 'text-opacity': certainty(1, .9, .6) } });
  const click = (event: MapLayerMouseEvent) => { const id = event.features?.[0]?.properties?.id; if (typeof id === 'string') onInspect(id); };
  map.on('click', fill, click);
  return {
    /** Date-filtered like every other layer: a zone outside the viewing date is left out. */
    update(visible: boolean, at: HistoricalTime) {
      const shown = new Set(zoningFeatures(at).filter(f => f.match !== 'outside').map(f => f.id));
      const features: Feature[] = romeZoning.zones.filter(z => shown.has(z.id)).flatMap((z): Feature[] => {
        const properties = { id: z.id, short: z.short, certainty: z.certainty, color: zoneColour[z.use] };
        return [...z.multipolygon.map((coordinates): Feature => ({ type: 'Feature', properties, geometry: { type: 'Polygon', coordinates } })),
          { type: 'Feature', properties, geometry: { type: 'Point', coordinates: z.label } }];
      });
      (map.getSource(source) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features } as FeatureCollection);
      for (const id of [fill, outline, labels]) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    },
    dispose() {
      map.off('click', fill, click);
      for (const id of [labels, outline, fill]) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(source)) map.removeSource(source);
    },
  };
}
