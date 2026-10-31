import type { GeoJSONSource, Map, MapLayerMouseEvent } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import { offsetCoordinate, type Coordinate } from '@/map/settlements/romanSettlement';
import type { ReconstructionCertainty, ReconstructionObject, ReconstructionSpec } from '@/map/settlements/reconstructionSpec';
import { matchContext } from '@/lib/scenarios/contextLayers';
import type { ContextInfo, HistoricalTime } from '@/lib/scenarios/schema';

const source = 'reconstruction-objects', fill = 'reconstruction-fill', selected = 'reconstruction-selected', massSource = 'reconstruction-massing', massLayer = 'reconstruction-massing-3d', citySource = 'reconstruction-city', cityLayer = 'reconstruction-city-roofscape';
const PLASTER = ['#c9b08a', '#d6c8a8', '#b98a68', '#bcb3a0', '#cb9f78'];
export const certaintyColour: Record<ReconstructionCertainty, string> = { documented: '#e9b75d', 'evidence-based': '#6fc0aa', 'best-guess': '#b58ad6' };
const colourExpression = ['match', ['get', 'certainty'], 'documented', certaintyColour.documented, 'evidence-based', certaintyColour['evidence-based'], certaintyColour['best-guess']] as never;

/** Footprint area in square metres (shoelace): the weight each object has in the best-guess share. */
export const footprintArea = (o: ReconstructionObject) => Math.abs(o.footprint.reduce((a, p, i) => { const q = o.footprint[(i + 1) % o.footprint.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
/** Is the object present at this date? Same rule as every other map layer. */
export const reconstructionMatch = (o: ReconstructionObject, at: HistoricalTime) => matchContext({ time: o.time ?? { start: { year: 100 }, end: { year: 100 } }, uncertaintyYears: o.uncertaintyYears } as ContextInfo, at);

/** Share of the mapped object area inside the current view, by certainty. Pure; the legend line is built from it. */
export function certaintyShare(spec: ReconstructionSpec, origin: Coordinate, bounds: { contains(point: [number, number]): boolean }, at: HistoricalTime, includeGuess = true) {
  const totals: Record<ReconstructionCertainty, number> = { documented: 0, 'evidence-based': 0, 'best-guess': 0 };
  for (const o of spec.objects) {
    if (reconstructionMatch(o, at) === 'outside' || (!includeGuess && o.certainty === 'best-guess')) continue;
    const c = o.footprint.reduce((a, p) => [a[0] + p[0] / o.footprint.length, a[1] + p[1] / o.footprint.length], [0, 0]);
    if (bounds.contains(offsetCoordinate(origin, c as [number, number]) as [number, number])) totals[o.certainty] += footprintArea(o);
  }
  const sum = totals.documented + totals['evidence-based'] + totals['best-guess'];
  return { totals, sum, share: (k: ReconstructionCertainty) => sum ? totals[k] / sum : 0 };
}

const TILES = ['#b06a45', '#b97848', '#a2603f', '#bd8458', '#9c6a52', '#c08a62'];
const GROUND = '#66724a';
const hexMix = (a: string, b: string, t: number) => { const f = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16); return '#' + [0, 1, 2].map(i => Math.round(f(a, i) + (f(b, i) - f(a, i)) * t).toString(16).padStart(2, '0')).join(''); };
const isLot = (o: ReconstructionObject) => o.shape.type === 'building';
/** Where an object sits on the map, as the mean of its footprint (settlement metres). */
const centreOf = (o: ReconstructionObject): [number, number] => [o.footprint.reduce((a, p) => a + p[0], 0) / o.footprint.length, o.footprint.reduce((a, p) => a + p[1], 0) / o.footprint.length];

/**
 * How built-up the surroundings of each lot are, 0 at the thin edge of the laid-out area and 1 well inside it: lots within about
 * 60 m, counted on a 40 m grid and compared with the densest cell. Feathers the edge of the roofscape instead of cutting it.
 */
export function builtUpness(spec: ReconstructionSpec): Record<string, number> {
  const CELL = 40, cell = (v: number) => Math.floor(v / CELL), key = (i: number, j: number) => `${i},${j}`;
  const lots = spec.objects.filter(isLot), counts: Record<string, number> = {};
  for (const o of lots) { const [x, z] = centreOf(o), k = key(cell(x), cell(z)); counts[k] = (counts[k] ?? 0) + 1; }
  const around = (x: number, z: number) => { let n = 0; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) n += counts[key(cell(x) + i, cell(z) + j)] ?? 0; return n; };
  const raw = lots.map(o => around(...centreOf(o))), top = Math.max(1, [...raw].sort((a, b) => a - b)[Math.floor(raw.length * 0.8)] ?? 1);
  const out: Record<string, number> = {};
  lots.forEach((o, i) => { const t = Math.min(1, raw[i] / top), edge = t * t * (3 - 2 * t); out[o.id] = edge; });
  return out;
}

/**
 * Extruded massing for the regional view (zoom 13 to 17), drawn by the map itself, so Rome from above reads as a city before the 3D scene
 * streams in. It fades out as the lit 3D scene takes over. Buildings carry a stepped terracotta roof (the 3D scene's gable, in three
 * stacked slabs, same tile palette), the circus (stands round an empty track), the palace wings, and the bridges as a deck on piers.
 * Lots at the thin edge of the laid-out area are lower and blend into the ground colour.
 */
export function massingFeatures(spec: ReconstructionSpec, origin: Coordinate, at: HistoricalTime, includeGuess: boolean, tint: boolean, edges: Record<string, number> = builtUpness(spec)): FeatureCollection {
  const ll = (p: readonly number[]) => offsetCoordinate(origin, p as [number, number]) as [number, number];
  const ring = (points: readonly (readonly number[])[]) => [...points, points[0]].map(ll);
  const features: Feature[] = [];
  const add = (o: ReconstructionObject, rings: readonly (readonly (readonly number[])[])[], height: number, colour: string, base = 0) => features.push({ type: 'Feature', properties: { id: o.id, height, base, color: tint ? certaintyColour[o.certainty] : colour }, geometry: { type: 'Polygon', coordinates: rings.map(ring) } });
  const rect = (a: readonly number[], b: readonly number[], length: number, width: number, heading: number) => { const ux = Math.cos(heading), uz = Math.sin(heading); return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, t]) => [(a[0] + b[0]) / 2 + ux * length / 2 * s - uz * width / 2 * t, (a[1] + b[1]) / 2 + uz * length / 2 * s + ux * width / 2 * t]); };
  spec.objects.forEach((o, index) => {
    if (reconstructionMatch(o, at) === 'outside' || (!includeGuess && o.certainty === 'best-guess')) return;
    const shape = o.shape;
    if (shape.type === 'building') {
      const [c0, c1, c2, c3] = o.footprint, edge = edges[o.id] ?? 1, fade = 0.4 * (1 - edge), lerp = (a: readonly number[], b: readonly number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const wall = shape.height * (0.55 + 0.45 * edge), rise = Math.min(2.4, shape.size[1] * 0.17) * (0.55 + 0.45 * edge);
      const tone = (c: string) => hexMix(c, GROUND, fade), band = (from: number, to: number) => [lerp(c0, c3, from), lerp(c1, c2, from), lerp(c1, c2, to), lerp(c0, c3, to)];
      const roof = tone(TILES[(shape.tone + index) % TILES.length]);
      add(o, [o.footprint], wall, tone(PLASTER[shape.tone % PLASTER.length]));
      add(o, [o.footprint], wall + rise * 0.45, roof, wall);
      add(o, [band(0.2, 0.8)], wall + rise * 0.8, roof, wall + rise * 0.45);
      add(o, [band(0.4, 0.6)], wall + rise, roof, wall + rise * 0.8);
    }
    else if (shape.type === 'circus') add(o, [o.footprint, shape.trackOutline], shape.outerHeight, '#d2c6a8');
    else if (shape.type === 'palace') for (const v of shape.volumes as { c: number[]; size: number[]; heading: number; height: number; role: string }[]) {
      if (v.role === 'platform') continue;
      const ux = Math.cos(v.heading), uz = Math.sin(v.heading);
      const wing = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [v.c[0] + ux * v.size[0] / 2 * a - uz * v.size[1] / 2 * b, v.c[1] + uz * v.size[0] / 2 * a + ux * v.size[1] / 2 * b]);
      add(o, [wing], v.height, '#e0d4b8'); add(o, [wing], v.height + 1.2, '#a05f42', v.height);
    }
    else if (shape.type === 'bridge') {
      // A deck on pier blocks, stood on the 2D river: a simplified Pons Aemilius, not a ring of arches.
      const piers = shape.piersE as number[], head = (piers[0] + piers.at(-1)!) / 2, length = piers[0] - piers.at(-1)!;
      add(o, [rect([head, shape.axisS], [head, shape.axisS], length, shape.deckWidth, 0)], 6.4, '#b9ae98', 4.8);
      for (const e of piers.slice(1, -1)) add(o, [rect([e, shape.axisS], [e, shape.axisS], 3.4, shape.deckWidth * 0.85, 0)], 4.8, '#a79d89');
    }
    else if (shape.type === 'skew-bridge') {
      const [from, to] = [shape.from as number[], shape.to as number[]], length = Math.hypot(to[0] - from[0], to[1] - from[1]), heading = Math.atan2(to[1] - from[1], to[0] - from[0]);
      add(o, [rect(from, to, length, shape.deckWidth, heading)], 6.4, '#b9ae98', 4.8);
      for (let i = 1; i < shape.spans; i++) { const t = i / shape.spans, p = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]; add(o, [rect(p, p, 3, shape.deckWidth * 0.85, heading)], 4.8, '#a79d89'); }
    }
  });
  return { type: 'FeatureCollection', features };
}

/** One point per lot, for the low-LOD city layer: a soft tinted heatmap of the built-up area, seen from far out where blocks are sub-pixel. */
export function cityPoints(spec: ReconstructionSpec, origin: Coordinate, at: HistoricalTime, includeGuess: boolean): FeatureCollection {
  const features: Feature[] = [];
  for (const o of spec.objects) {
    if (!isLot(o) || reconstructionMatch(o, at) === 'outside' || (!includeGuess && o.certainty === 'best-guess')) continue;
    features.push({ type: 'Feature', properties: { w: Math.min(1, footprintArea(o) / 400) }, geometry: { type: 'Point', coordinates: offsetCoordinate(origin, centreOf(o)) as [number, number] } });
  }
  return { type: 'FeatureCollection', features };
}

const heatRamp = (rgb: string) => ['interpolate', ['linear'], ['heatmap-density'], 0, `rgba(${rgb},0)`, 0.12, `rgba(${rgb},0.16)`, 0.4, `rgba(${rgb},0.42)`, 1, `rgba(${rgb},0.7)`] as never;
const HEAT_NATURAL = '184,112,76', HEAT_TINT = '181,138,214';

/** Inspectable outlines for every placed object. Nearly invisible until tinted by certainty. */
export function reconstructionOverlay(map: Map, spec: ReconstructionSpec, origin: Coordinate, onInspect: (id: string) => void, pick?: (point: { x: number; y: number }) => string | undefined) {
  map.addSource(source, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  const before = map.getLayer('scenario-context-lines') ? 'scenario-context-lines' : undefined;
  map.addLayer({ id: fill, type: 'fill', source, minzoom: 15.5, paint: { 'fill-color': colourExpression, 'fill-opacity': 0.02 } }, before);
  map.addSource(massSource, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource(citySource, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  // Low LOD: from the first approach a tinted, feathered roofscape marks the laid-out area; the extruded blocks take over from zoom 13 to 15.5.
  map.addLayer({ id: cityLayer, type: 'heatmap', source: citySource, minzoom: 7, maxzoom: 16, paint: { 'heatmap-weight': ['get', 'w'], 'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 8, 1, 15, 1.2],
    'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 7, 7, 11, 8, 13, 9, 14.5, 16, 15.5, 30, 16, 40], 'heatmap-color': heatRamp(HEAT_NATURAL),
    'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.5, 9, 0.95, 14.2, 0.9, 15.6, 0] as never } }, before);
  // Hands over to the lit 3D scene (the same 'local-ground' state that retires the flat ground) so the two never double up.
  map.addLayer({ id: massLayer, type: 'fill-extrusion', source: massSource, minzoom: 13, paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-base': ['get', 'base'],
    'fill-extrusion-opacity': ['-', 0.94, ['*', 0.94, ['coalesce', ['global-state', 'local-ground'], 0]]] as never, 'fill-extrusion-vertical-gradient': true } }, before);
  map.addLayer({ id: selected, type: 'line', source, minzoom: 15.5, filter: ['==', ['get', 'id'], ''], paint: { 'line-color': '#ffffff', 'line-width': 2.5 } }, before);
  // A raised building is picked by ray first; anything flush with the ground (streets, the square) by its map outline.
  // The timeout lets this win over the other map layers' click handlers, which close this panel.
  const click = (event: MapLayerMouseEvent) => {
    const id = pick?.(event.point) ?? (map.getLayer(fill) ? map.queryRenderedFeatures(event.point, { layers: [fill] })[0]?.properties?.id : undefined);
    if (typeof id === 'string') setTimeout(() => onInspect(id), 0);
  };
  const pointer = () => { map.getCanvas().style.cursor = 'pointer'; }, reset = () => { map.getCanvas().style.cursor = ''; };
  map.on('click', click); map.on('mouseenter', fill, pointer); map.on('mouseleave', fill, reset);
  const edges = builtUpness(spec);
  const features = (at: HistoricalTime, includeGuess: boolean): FeatureCollection => ({ type: 'FeatureCollection', features: spec.objects
    .filter(o => reconstructionMatch(o, at) !== 'outside' && (includeGuess || o.certainty !== 'best-guess'))
    .map((o): Feature => ({ type: 'Feature', properties: { id: o.id, certainty: o.certainty, kind: o.kind }, geometry: { type: 'Polygon', coordinates: [[...o.footprint, o.footprint[0]].map(p => offsetCoordinate(origin, p as [number, number]) as [number, number])] } })) });
  return {
    update(at: HistoricalTime, includeGuess: boolean, tint: boolean, highlight?: string) {
      (map.getSource(source) as GeoJSONSource | undefined)?.setData(features(at, includeGuess));
      (map.getSource(massSource) as GeoJSONSource | undefined)?.setData(massingFeatures(spec, origin, at, includeGuess, tint, edges));
      (map.getSource(citySource) as GeoJSONSource | undefined)?.setData(cityPoints(spec, origin, at, includeGuess));
      if (map.getLayer(cityLayer)) map.setPaintProperty(cityLayer, 'heatmap-color', heatRamp(tint ? HEAT_TINT : HEAT_NATURAL));
      if (map.getLayer(fill)) map.setPaintProperty(fill, 'fill-opacity', tint ? 0.42 : 0.02);
      if (map.getLayer(selected)) map.setFilter(selected, ['==', ['get', 'id'], highlight ?? '']);
    },
    dispose() {
      map.off('click', click); map.off('mouseenter', fill, pointer); map.off('mouseleave', fill, reset);
      for (const id of [selected, fill, massLayer, cityLayer]) if (map.getLayer(id)) map.removeLayer(id);
      for (const id of [source, massSource, citySource]) if (map.getSource(id)) map.removeSource(id);
    },
  };
}
