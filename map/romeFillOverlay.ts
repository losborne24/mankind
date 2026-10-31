import type { GeoJSONSource, Map } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import { generateRomeFill, type RomeFill } from '@/lib/scenarios/romeFill';
import { romeZoning } from '@/lib/scenarios/zoning';
import { matchContext } from '@/lib/scenarios/contextLayers';
import type { ContextInfo, HistoricalTime } from '@/lib/scenarios/schema';
import { certaintyColour, PLASTER } from '@/map/reconstructionOverlay';

const source = 'rome-fill', cover = 'rome-fill-cover', roadsFar = 'rome-fill-roads', roadsNear = 'rome-fill-roads-near', flat = 'rome-fill-flat', solid = 'rome-fill-3d', roofs = 'rome-fill-roofs', roofSource = 'rome-fill-roof-data';
/**
 * Roofs are built for the lots within this distance of the view's centre, again once it has moved a third of the way out. Beyond
 * it, at zoom 15, a lot is a few pixels across and its roof steps do not show; the map keeps a copy of the roof data on the page, so
 * a wider ring costs heap (about 23 MB more at 3 km).
 */
const ROOF_RADIUS = 1500;
const all = [roofs, solid, flat, roadsNear, roadsFar, cover];
const BUILT = ['insula', 'house', 'domus', 'warehouse', 'villa', 'tomb', 'pier', 'channel', 'landmark'];
const KX = Math.cos(41.892 * Math.PI / 180) * 111320, KY = 110950;
const LOTS = new Set(['insula', 'house', 'domus', 'villa']);
/** Close in (from zoom 15) lots take plaster walls and a stepped tile roof, as the neighbourhood's do. */
const ROOFS_FROM = 15;
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
  const features: Feature[] = [];
  // Coordinates to 1e-6 degree (about 10 cm): the data handed to the map is a third smaller.
  const q6 = (p: readonly number[]) => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6];
  const polygon = (ring: readonly (readonly number[])[]) => ({ type: 'Polygon' as const, coordinates: [[...ring, ring[0]].map(q6)] });
  fill.items.forEach((i, n) => {
    const properties: Record<string, unknown> = { k: i.kind, h: i.height, b: i.base, c: i.colour };
    if (i.id) Object.assign(properties, { id: i.id, q: i.certainty });
    // A lot's walls turn to plaster close in (from afar its top is the roof, in the tile colour); its roof is built near the view.
    if (LOTS.has(i.kind)) properties.w = PLASTER[n % PLASTER.length];
    features.push({ type: 'Feature', properties, geometry: polygon(i.ring) });
  });
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

/** The lots as a compact table for building roofs near the view: four corners and the wall height each, and a tile colour index. */
export interface LotTable { corners: Float64Array; height: Float32Array; colour: Uint8Array; palette: string[] }
export function lotTable(fill: RomeFill): LotTable {
  const lots = fill.items.filter(i => LOTS.has(i.kind)), palette = [...new Set(lots.map(i => i.colour))];
  const corners = new Float64Array(lots.length * 8), height = new Float32Array(lots.length), colour = new Uint8Array(lots.length);
  lots.forEach((i, n) => { i.ring.forEach((p, k) => { corners[n * 8 + k * 2] = p[0]; corners[n * 8 + k * 2 + 1] = p[1]; }); height[n] = i.height; colour[n] = palette.indexOf(i.colour); });
  return { corners, height, colour, palette };
}
/**
 * The neighbourhood's stepped gable (massingFeatures, the same rise) on every lot within `radius` metres of `centre`: a slab over
 * the whole lot, then two narrower bands along its length, on top of its walls.
 */
export function roofFeatures(lots: LotTable, centre: readonly number[], radius: number): FeatureCollection {
  const features: Feature[] = [], { corners: k } = lots, r1 = (v: number) => Math.round(v * 10) / 10, q6 = (v: number) => Math.round(v * 1e6) / 1e6;
  for (let n = 0; n < lots.height.length; n++) {
    const o = n * 8, c = [0, 1, 2, 3].map(j => [k[o + j * 2], k[o + j * 2 + 1]]);
    if (Math.hypot((c[0][0] - centre[0]) * KX, (c[0][1] - centre[1]) * KY) > radius) continue;
    const m = (a: number[], b: number[]) => Math.hypot((b[0] - a[0]) * KX, (b[1] - a[1]) * KY), [c0, c1, c2, c3] = c;
    const along01 = m(c0, c1) >= m(c1, c2), rise = Math.min(2.4, Math.min(m(c0, c1), m(c1, c2)) * 0.17), h = lots.height[n], colour = lots.palette[lots.colour[n]];
    const lerp = (a: number[], b: number[], t: number) => [q6(a[0] + (b[0] - a[0]) * t), q6(a[1] + (b[1] - a[1]) * t)];
    const band = (t0: number, t1: number) => along01 ? [lerp(c0, c3, t0), lerp(c1, c2, t0), lerp(c1, c2, t1), lerp(c0, c3, t1)] : [lerp(c0, c1, t0), lerp(c3, c2, t0), lerp(c3, c2, t1), lerp(c0, c1, t1)];
    const slab = (ring: number[][], top: number, base: number) => features.push({ type: 'Feature', properties: { h: r1(h + rise * top), b: r1(h + rise * base), c: colour }, geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] } });
    slab(band(0, 1), 0.45, 0); slab(band(0.2, 0.8), 0.8, 0.45); slab(band(0.4, 0.6), 1, 0.8);
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
  // Landmarks are tinted by how sure their placing is; everything else the fill makes is a best guess. Lots' walls turn from the
  // tile colour (their top, from afar) to plaster as their roofs come in.
  const colour = (tint: boolean) => (tint ? ['match', ['get', 'q'], 'evidence-based', certaintyColour['evidence-based'], certaintyColour['best-guess']]
    : ['interpolate', ['linear'], ['zoom'], ROOFS_FROM, ['get', 'c'], ROOFS_FROM + 0.5, ['coalesce', ['get', 'w'], ['get', 'c']]]) as never;
  map.addLayer({ id: cover, type: 'fill', source, minzoom: 9.5, filter: kind(['field']), layout: hidden,
    paint: { 'fill-color': ['get', 'c'], 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9.5, 0, 11, ['*', 0.5, handover], 16, ['*', 0.4, handover]] as never } }, before);
  const roadPaint = (fade: boolean) => ({ 'line-color': '#dccba0', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.8, 14, 2, 17, 6] as never,
    'line-opacity': (fade ? ['interpolate', ['linear'], ['zoom'], 10.5, 0, 11.5, ['*', 0.85, handover]] : ['interpolate', ['linear'], ['zoom'], 10.5, 0, 11.5, 0.85]) as never });
  map.addLayer({ id: roadsFar, type: 'line', source, minzoom: 10.5, filter: ['all', ['==', ['get', 'k'], 'road'], ['!', ['get', 'near']]] as never, layout: { ...hidden, 'line-cap': 'round', 'line-join': 'round' }, paint: roadPaint(false) }, before);
  map.addLayer({ id: roadsNear, type: 'line', source, minzoom: 10.5, filter: ['all', ['==', ['get', 'k'], 'road'], ['get', 'near']] as never, layout: { ...hidden, 'line-cap': 'round', 'line-join': 'round' }, paint: roadPaint(true) }, before);
  map.addLayer({ id: flat, type: 'fill', source, minzoom: 9, maxzoom: 14, filter: kind(BUILT), layout: hidden,
    paint: { 'fill-color': ['get', 'c'], 'fill-antialias': false, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0, 10, 0.9, 13.2, 0.9, 13.8, 0] as never } }, before);
  map.addLayer({ id: solid, type: 'fill-extrusion', source, minzoom: 13, filter: kind(BUILT), layout: hidden,
    paint: { 'fill-extrusion-color': colour(false), 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-vertical-gradient': true,
      'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 13.6, 0.95] as never } }, before);
  map.addSource(roofSource, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, tolerance: 0.1 });
  map.addLayer({ id: roofs, type: 'fill-extrusion', source: roofSource, minzoom: ROOFS_FROM, layout: hidden,
    paint: { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': ['get', 'b'],
      'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], ROOFS_FROM, 0, ROOFS_FROM + 0.5, 0.95] as never } }, before);
  // Generated once, after the first frame, so the journey starts without waiting for it (about half a second). The map is handed a
  // blob URL rather than the collection, so the page never holds the collection and its JSON text at once. MapLibre (6.15) still
  // sends data loaded from a URL back to the page as the source's copy, so one copy of the features does stay on the main thread.
  // The roofs are built from a compact table of the lots (about a megabyte).
  let url: string | undefined, state = { visible: false, tint: false }, applied = false, disposed = false;
  // Roofs: rebuilt for the lots round the view whenever it is close enough to show them and has moved a third of the radius since.
  let lots: LotTable | undefined, roofUrl: string | undefined, roofCentre: [number, number] | undefined;
  const refreshRoofs = () => {
    if (!lots || !state.visible || map.getZoom() < ROOFS_FROM) return;
    const { lng, lat } = map.getCenter();
    if (roofCentre && Math.hypot((lng - roofCentre[0]) * KX, (lat - roofCentre[1]) * KY) < ROOF_RADIUS / 3) return;
    roofCentre = [lng, lat];
    const previous = roofUrl;
    roofUrl = URL.createObjectURL(new Blob([JSON.stringify(roofFeatures(lots, roofCentre, ROOF_RADIUS))], { type: 'application/geo+json' }));
    (map.getSource(roofSource) as GeoJSONSource | undefined)?.setData(roofUrl);
    if (previous) setTimeout(() => URL.revokeObjectURL(previous), 5000);   // after the worker has read it
  };
  map.on('moveend', refreshRoofs);
  const apply = () => {
    if (url && !applied) { (map.getSource(source) as GeoJSONSource | undefined)?.setData(url); applied = true; }
    for (const id of all) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', state.visible && url ? 'visible' : 'none');
    const flatColour = (state.tint ? ['match', ['get', 'q'], 'evidence-based', certaintyColour['evidence-based'], certaintyColour['best-guess']] : ['get', 'c']) as never;
    if (map.getLayer(flat)) map.setPaintProperty(flat, 'fill-color', flatColour);
    if (map.getLayer(solid)) map.setPaintProperty(solid, 'fill-extrusion-color', colour(state.tint));
    if (map.getLayer(roofs)) map.setPaintProperty(roofs, 'fill-extrusion-color', (state.tint ? certaintyColour['best-guess'] : ['get', 'c']) as never);
    refreshRoofs();
  };
  const timer = setTimeout(() => {
    if (disposed) return;
    const fill = generateRomeFill(keepOut);
    url = URL.createObjectURL(new Blob([JSON.stringify(fillFeatures(fill, within(ground, groundRadius)))], { type: 'application/geo+json' }));
    lots = lotTable(fill);
    apply(); onReady?.(fill);
  }, 0);
  return {
    /** Shown around AD 100 only (the fill's date, ±25 years like the neighbourhood's guessed lots), and only with best guesses on. */
    update(at: HistoricalTime, includeGuess: boolean, tint: boolean) {
      const dated = matchContext({ time: { start: { year: 100 }, end: { year: 100 } }, uncertaintyYears: 25 } as ContextInfo, at) !== 'outside';
      state = { visible: dated && includeGuess, tint }; apply();
    },
    dispose() {
      disposed = true; clearTimeout(timer); map.off('moveend', refreshRoofs);
      for (const u of [url, roofUrl]) if (u) URL.revokeObjectURL(u);
      for (const id of all) if (map.getLayer(id)) map.removeLayer(id);
      for (const s of [source, roofSource]) if (map.getSource(s)) map.removeSource(s);
    },
  };
}
