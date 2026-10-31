import type { GeoJSONSource, Map, MapLayerMouseEvent } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import { offsetCoordinate, type Coordinate } from '@/map/settlements/romanSettlement';
import type { ReconstructionCertainty, ReconstructionObject, ReconstructionSpec } from '@/map/settlements/reconstructionSpec';
import { matchContext } from '@/lib/scenarios/contextLayers';
import { queryTerrainSample } from '@/map/terrain';
import type { ContextInfo, HistoricalTime } from '@/lib/scenarios/schema';

const source = 'reconstruction-objects', fill = 'reconstruction-fill', selected = 'reconstruction-selected', massSource = 'reconstruction-massing', massLayer = 'reconstruction-massing-3d', flatLayer = 'reconstruction-massing-flat';
const PLASTER = ['#c9b08a', '#d6c8a8', '#b98a68', '#bcb3a0', '#cb9f78'];
export const certaintyColour: Record<ReconstructionCertainty, string> = { documented: '#e9b75d', 'evidence-based': '#6fc0aa', 'best-guess': '#b58ad6' };
const colourExpression = ['match', ['get', 'certainty'], 'documented', certaintyColour.documented, 'evidence-based', certaintyColour['evidence-based'], certaintyColour['best-guess']] as never;

const BUILDING_KINDS = new Set(['temple', 'palace', 'theatre', 'circus', 'colonnade', 'insula', 'flats', 'shop', 'warehouse']);
/** Footprint area in square metres (shoelace): the weight each object has in the best-guess share. */
export const footprintArea = (o: ReconstructionObject) => Math.abs(o.footprint.reduce((a, p, i) => { const q = o.footprint[(i + 1) % o.footprint.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
/** Is the object present at this date? Same rule as every other map layer. */
export const reconstructionMatch = (o: ReconstructionObject, at: HistoricalTime) => matchContext({ time: o.time ?? { start: { year: 100 }, end: { year: 100 } }, uncertaintyYears: o.uncertaintyYears } as ContextInfo, at);

/**
 * Share of the mapped object area inside the current view, by certainty, and how many objects (and how many of them are
 * buildings) of each certainty are in view. A few landmarks can be a sliver of the area, so the legend gives both. Pure.
 */
export function certaintyShare(spec: ReconstructionSpec, origin: Coordinate, bounds: { contains(point: [number, number]): boolean }, at: HistoricalTime, includeGuess = true) {
  const totals: Record<ReconstructionCertainty, number> = { documented: 0, 'evidence-based': 0, 'best-guess': 0 };
  const counts: Record<ReconstructionCertainty, number> = { documented: 0, 'evidence-based': 0, 'best-guess': 0 }, buildings = { ...counts };
  for (const o of spec.objects) {
    if (reconstructionMatch(o, at) === 'outside' || (!includeGuess && o.certainty === 'best-guess')) continue;
    const c = o.footprint.reduce((a, p) => [a[0] + p[0] / o.footprint.length, a[1] + p[1] / o.footprint.length], [0, 0]);
    if (bounds.contains(offsetCoordinate(origin, c as [number, number]) as [number, number])) {
      totals[o.certainty] += footprintArea(o); counts[o.certainty]++;
      if (BUILDING_KINDS.has(o.kind)) buildings[o.certainty]++;
    }
  }
  const sum = totals.documented + totals['evidence-based'] + totals['best-guess'];
  return { totals, counts, buildings, sum, share: (k: ReconstructionCertainty) => sum ? totals[k] / sum : 0 };
}

const TILES = ['#b06a45', '#b97848', '#a2603f', '#bd8458', '#9c6a52', '#c08a62'];
const DECK_BASE = 4.8, DECK_TOP = 6.4;

/**
 * Extruded massing for the regional view (zoom 13 to 17), drawn by the map itself, so Rome from above reads as a city before the 3D scene
 * streams in. It fades out as the lit 3D scene takes over. Buildings carry a stepped terracotta roof (the 3D scene's gable, in three
 * stacked slabs, same tile palette), the circus (stands round an empty track), the palace wings, and the bridges as a deck on piers.
 * The zoned fill (romeFillOverlay) carries the city on past the neighbourhood's edge, so its lots stand at full height. `ground` is the drawn terrain height
 * (display metres) at a map point, which bridges need to keep deck and piers together; without it the ground is taken as flat.
 */
export function massingFeatures(spec: ReconstructionSpec, origin: Coordinate, at: HistoricalTime, includeGuess: boolean, tint: boolean, ground?: (p: [number, number]) => number | null): FeatureCollection {
  const ll = (p: readonly number[]) => offsetCoordinate(origin, p as [number, number]) as [number, number];
  const ring = (points: readonly (readonly number[])[]) => [...points, points[0]].map(ll);
  const features: Feature[] = [];
  // `flat` marks the one piece of each object drawn as a flat footprint from afar (a lot's roof, the circus, a palace roof, a bridge deck).
  const add = (o: ReconstructionObject, rings: readonly (readonly (readonly number[])[])[], height: number, colour: string, base = 0, flat = false) => features.push({ type: 'Feature', properties: { id: o.id, height, base, flat, color: tint ? certaintyColour[o.certainty] : colour }, geometry: { type: 'Polygon', coordinates: rings.map(ring) } });
  const rect = (a: readonly number[], b: readonly number[], length: number, width: number, heading: number) => { const ux = Math.cos(heading), uz = Math.sin(heading); return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, t]) => [(a[0] + b[0]) / 2 + ux * length / 2 * s - uz * width / 2 * t, (a[1] + b[1]) / 2 + uz * length / 2 * s + ux * width / 2 * t]); };
  // A deck on pier blocks (abutments at both ends), stood on the 2D river. MapLibre lifts each extrusion by the terrain under its own
  // centroid, so one flat deck over a sloping DEM leaves some piers short of it and others through it. The deck is cut into spans and
  // every span and pier is offset onto a straight ramp between the ground at the two ends; `stations` run 0 (from) to 1 (to).
  const bridge = (o: ReconstructionObject, from: readonly number[], to: readonly number[], stations: number[], deckWidth: number, pier: number) => {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]), heading = Math.atan2(to[1] - from[1], to[0] - from[0]);
    const at = (t: number) => [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t], lift = (p: readonly number[]) => ground?.(ll(p)) ?? 0;
    const [start, end] = [lift(from), lift(to)], offset = (t: number) => start + (end - start) * t - lift(at(t));
    stations.forEach((t, i) => {
      const top = DECK_BASE + offset(t);
      if (top > 0) add(o, [rect(at(t), at(t), pier, deckWidth * 0.85, heading)], top, '#a79d89');
      if (i === 0) return;
      const s = stations[i - 1], rise = offset((s + t) / 2);
      if (DECK_TOP + rise > 0) add(o, [rect(at(s), at(t), (t - s) * length, deckWidth, heading)], DECK_TOP + rise, '#b9ae98', DECK_BASE + rise, true);
    });
  };
  spec.objects.forEach((o, index) => {
    if (reconstructionMatch(o, at) === 'outside' || (!includeGuess && o.certainty === 'best-guess')) return;
    const shape = o.shape;
    if (shape.type === 'building') {
      const [c0, c1, c2, c3] = o.footprint, lerp = (a: readonly number[], b: readonly number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const wall = shape.height, rise = Math.min(2.4, shape.size[1] * 0.17);
      const band = (from: number, to: number) => [lerp(c0, c3, from), lerp(c1, c2, from), lerp(c1, c2, to), lerp(c0, c3, to)];
      const roof = TILES[(shape.tone + index) % TILES.length];
      add(o, [o.footprint], wall, PLASTER[shape.tone % PLASTER.length]);
      add(o, [o.footprint], wall + rise * 0.45, roof, wall, true);
      add(o, [band(0.2, 0.8)], wall + rise * 0.8, roof, wall + rise * 0.45);
      add(o, [band(0.4, 0.6)], wall + rise, roof, wall + rise * 0.8);
    }
    else if (shape.type === 'circus') add(o, [o.footprint, shape.trackOutline], shape.outerHeight, '#d2c6a8', 0, true);
    else if (shape.type === 'palace') for (const v of shape.volumes as { c: number[]; size: number[]; heading: number; height: number; role: string }[]) {
      if (v.role === 'platform') continue;
      const ux = Math.cos(v.heading), uz = Math.sin(v.heading);
      const wing = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [v.c[0] + ux * v.size[0] / 2 * a - uz * v.size[1] / 2 * b, v.c[1] + uz * v.size[0] / 2 * a + ux * v.size[1] / 2 * b]);
      add(o, [wing], v.height, '#e0d4b8'); add(o, [wing], v.height + 1.2, '#a05f42', v.height, true);
    }
    else if (shape.type === 'bridge') {
      // A simplified Pons Aemilius, not a ring of arches.
      const piers = shape.piersE as number[], length = piers[0] - piers.at(-1)!;
      bridge(o, [piers[0], shape.axisS], [piers.at(-1)!, shape.axisS], piers.map(e => (piers[0] - e) / length), shape.deckWidth, 3.4);
    }
    else if (shape.type === 'skew-bridge') bridge(o, shape.from as number[], shape.to as number[], Array.from({ length: shape.spans + 1 }, (_, i) => i / shape.spans), shape.deckWidth, 3);
  });
  return { type: 'FeatureCollection', features };
}

/** Inspectable outlines for every placed object. Nearly invisible until tinted by certainty. */
export function reconstructionOverlay(map: Map, spec: ReconstructionSpec, origin: Coordinate, onInspect: (id: string) => void, pick?: (point: { x: number; y: number }) => string | undefined) {
  map.addSource(source, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  const before = map.getLayer('scenario-context-lines') ? 'scenario-context-lines' : undefined;
  map.addLayer({ id: fill, type: 'fill', source, minzoom: 15.5, paint: { 'fill-color': colourExpression, 'fill-opacity': 0.02 } }, before);
  map.addSource(massSource, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  // From afar, crisp flat footprints (as the zoned fill draws the rest of the city), handing over to the extrusions by zoom 13.8.
  map.addLayer({ id: flatLayer, type: 'fill', source: massSource, minzoom: 9, maxzoom: 14, filter: ['==', ['get', 'flat'], true], paint: { 'fill-color': ['get', 'color'], 'fill-antialias': false,
    'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0, 10, 0.9, 13.2, 0.9, 13.8, 0] as never } }, before);
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
  const ground = (p: [number, number]) => queryTerrainSample(map, p).displayMeters;
  // Bridges are fitted to the drawn terrain, which streams in after the first update and changes with the relief toggle:
  // redraw the massing once the map settles if the ground under any bridge has moved.
  const bridgeEnds = spec.objects.filter(o => o.kind === 'bridge').flatMap(o => o.footprint.map(p => offsetCoordinate(origin, p as [number, number]) as [number, number]));
  const groundKey = () => bridgeEnds.map(p => Math.round((ground(p) ?? 0) * 4)).join();
  let last: { at: HistoricalTime; includeGuess: boolean; tint: boolean } | undefined, fitted = '';
  const mass = () => { if (!last) return; fitted = groundKey(); (map.getSource(massSource) as GeoJSONSource | undefined)?.setData(massingFeatures(spec, origin, last.at, last.includeGuess, last.tint, ground)); };
  const settle = () => { if (groundKey() !== fitted) mass(); };
  map.on('idle', settle);
  const features = (at: HistoricalTime, includeGuess: boolean): FeatureCollection => ({ type: 'FeatureCollection', features: spec.objects
    .filter(o => reconstructionMatch(o, at) !== 'outside' && (includeGuess || o.certainty !== 'best-guess'))
    .map((o): Feature => ({ type: 'Feature', properties: { id: o.id, certainty: o.certainty, kind: o.kind }, geometry: { type: 'Polygon', coordinates: [[...o.footprint, o.footprint[0]].map(p => offsetCoordinate(origin, p as [number, number]) as [number, number])] } })) });
  return {
    update(at: HistoricalTime, includeGuess: boolean, tint: boolean, highlight?: string) {
      (map.getSource(source) as GeoJSONSource | undefined)?.setData(features(at, includeGuess));
      last = { at, includeGuess, tint }; mass();
      if (map.getLayer(fill)) map.setPaintProperty(fill, 'fill-opacity', tint ? 0.42 : 0.02);
      if (map.getLayer(selected)) map.setFilter(selected, ['==', ['get', 'id'], highlight ?? '']);
    },
    dispose() {
      map.off('click', click); map.off('mouseenter', fill, pointer); map.off('mouseleave', fill, reset); map.off('idle', settle);
      for (const id of [selected, fill, massLayer, flatLayer]) if (map.getLayer(id)) map.removeLayer(id);
      for (const id of [source, massSource]) if (map.getSource(id)) map.removeSource(id);
    },
  };
}
