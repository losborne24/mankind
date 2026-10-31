import type { GeoJSONSource, Map } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import { generateRomeFill, type RomeFill } from '@/lib/scenarios/romeFill';
import { romeZoning } from '@/lib/scenarios/zoning';
import { matchContext } from '@/lib/scenarios/contextLayers';
import type { ContextInfo, HistoricalTime } from '@/lib/scenarios/schema';

const source = 'rome-fill', cover = 'rome-fill-cover', roadsFar = 'rome-fill-roads', roadsNear = 'rome-fill-roads-near', flat = 'rome-fill-flat', solid = 'rome-fill-3d';
const all = [solid, flat, roadsNear, roadsFar, cover];
const BUILT = ['insula', 'house', 'domus', 'warehouse', 'villa', 'tomb', 'pier', 'channel'];
const GUESS = '#b58ad6';
/** 1 until the lit 3D ground fades in, then 0: flat layers give way to it, as the zoning and the flat ground do. */
const handover = ['-', 1, ['coalesce', ['global-state', 'local-ground'], 0]] as const;

/** Whether a point lies within `radius` metres of `centre` (the local 3D ground's disc). */
const within = (centre: [number, number], radius: number) => (p: readonly number[]) =>
  Math.hypot((p[0] - centre[0]) * Math.cos(centre[1] * Math.PI / 180) * 111320, (p[1] - centre[1]) * 110950) < radius;

/**
 * The fill and the consular roads as one GeoJSON collection; roads near the local ground are marked so they can give way to it. The
 * illustrative ways in to the gates (straight lines) are left to the zoning layer: the fill does not draw them as streets.
 */
export function fillFeatures(fill: RomeFill, near: (p: readonly number[]) => boolean): FeatureCollection {
  const features: Feature[] = fill.items.map(i => ({ type: 'Feature', properties: { k: i.kind, h: i.height, b: i.base, c: i.colour }, geometry: { type: 'Polygon', coordinates: [[...i.ring, i.ring[0]]] } }));
  for (const l of romeZoning.lines.filter(l => l.kind === 'road')) for (const line of [...l.lines, ...(l.gaps ?? []), ...(l.links ?? []).filter(k => k.certainty !== 'illustrative').map(k => k.line)]) {
    // Split each line where it enters or leaves the local ground's disc.
    let run: [number, number][] = [], inside = near(line[0]);
    for (const p of line) {
      if (near(p) !== inside && run.length) { features.push({ type: 'Feature', properties: { k: 'road', near: inside }, geometry: { type: 'LineString', coordinates: [...run, p] } }); run = []; inside = !inside; }
      run.push(p);
    }
    if (run.length > 1) features.push({ type: 'Feature', properties: { k: 'road', near: inside }, geometry: { type: 'LineString', coordinates: run } });
  }
  return { type: 'FeatureCollection', features };
}

/**
 * The zoned fill of Rome c. AD 100 (lib/scenarios/romeFill.ts) on the map. From afar its buildings are crisp flat footprints, so the
 * city reads by its lots thinning out, not by a glow; from zoom 13 they stand as extrusions (one per lot, roofed in the neighbourhood's
 * tile colours), batched per tile by the map, so draw calls stay a handful whatever the count. Field strips and the consular roads lie
 * under them. Everything is a best guess: the best-guess switch hides it, and it is shown only around AD 100. The extrusions stay
 * when the lit 3D scene takes over close in (they are kept clear of the neighbourhood it draws); the flat layers give way to its
 * ground, roads only within its disc. `keepOut` is the neighbourhood's footprints; `ground` the centre of the local ground's disc;
 * `onReady` hears when the fill has been generated.
 */
export function romeFillOverlay(map: Map, keepOut: [number, number][][], ground: [number, number], onReady?: (fill: RomeFill) => void, groundRadius = 720) {
  map.addSource(source, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, tolerance: 0.2 });
  const before = ['reconstruction-fill', 'scenario-context-fill'].find(id => map.getLayer(id));
  const hidden = { visibility: 'none' } as const, kind = (kinds: string[]) => ['in', ['get', 'k'], ['literal', kinds]] as never;
  map.addLayer({ id: cover, type: 'fill', source, minzoom: 9.5, filter: kind(['field']), layout: hidden,
    paint: { 'fill-color': ['get', 'c'], 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9.5, 0, 11, ['*', 0.5, handover], 16, ['*', 0.4, handover]] as never } }, before);
  const roadPaint = (fade: boolean) => ({ 'line-color': '#dccba0', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.8, 14, 2, 17, 6] as never,
    'line-opacity': (fade ? ['interpolate', ['linear'], ['zoom'], 10.5, 0, 11.5, ['*', 0.85, handover]] : ['interpolate', ['linear'], ['zoom'], 10.5, 0, 11.5, 0.85]) as never });
  map.addLayer({ id: roadsFar, type: 'line', source, minzoom: 10.5, filter: ['all', ['==', ['get', 'k'], 'road'], ['!', ['get', 'near']]] as never, layout: { ...hidden, 'line-cap': 'round', 'line-join': 'round' }, paint: roadPaint(false) }, before);
  map.addLayer({ id: roadsNear, type: 'line', source, minzoom: 10.5, filter: ['all', ['==', ['get', 'k'], 'road'], ['get', 'near']] as never, layout: { ...hidden, 'line-cap': 'round', 'line-join': 'round' }, paint: roadPaint(true) }, before);
  map.addLayer({ id: flat, type: 'fill', source, minzoom: 9, maxzoom: 14, filter: kind(BUILT), layout: hidden,
    paint: { 'fill-color': ['get', 'c'], 'fill-antialias': false, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0, 10, 0.9, 13.2, 0.9, 13.8, 0] as never } }, before);
  map.addLayer({ id: solid, type: 'fill-extrusion', source, minzoom: 13, filter: kind(BUILT), layout: hidden,
    paint: { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-vertical-gradient': true,
      'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 13.6, 0.95] as never } }, before);
  // Generated once, after the first frame, so the journey starts without waiting for it (about half a second). The map is handed a
  // blob URL rather than the collection: its worker parses and tiles the data, and the page keeps only the URL, not a second copy
  // of some 30,000 features.
  let url: string | undefined, state = { visible: false, tint: false }, applied = false, disposed = false;
  const apply = () => {
    if (url && !applied) { (map.getSource(source) as GeoJSONSource | undefined)?.setData(url); applied = true; }
    for (const id of all) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', state.visible && url ? 'visible' : 'none');
    const colour = (state.tint ? GUESS : ['get', 'c']) as never;
    if (map.getLayer(flat)) map.setPaintProperty(flat, 'fill-color', colour);
    if (map.getLayer(solid)) map.setPaintProperty(solid, 'fill-extrusion-color', colour);
  };
  const timer = setTimeout(() => {
    if (disposed) return;
    const fill = generateRomeFill(keepOut);
    url = URL.createObjectURL(new Blob([JSON.stringify(fillFeatures(fill, within(ground, groundRadius)))], { type: 'application/geo+json' }));
    apply(); onReady?.(fill);
  }, 0);
  return {
    /** Shown around AD 100 only (the fill's date, ±25 years like the neighbourhood's guessed lots), and only with best guesses on. */
    update(at: HistoricalTime, includeGuess: boolean, tint: boolean) {
      const dated = matchContext({ time: { start: { year: 100 }, end: { year: 100 } }, uncertaintyYears: 25 } as ContextInfo, at) !== 'outside';
      state = { visible: dated && includeGuess, tint }; apply();
    },
    dispose() {
      disposed = true; clearTimeout(timer); if (url) URL.revokeObjectURL(url);
      for (const id of all) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(source)) map.removeSource(source);
    },
  };
}
