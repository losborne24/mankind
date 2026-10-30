import type { GeoJSONSource, Map, MapLayerMouseEvent } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import { offsetCoordinate, type Coordinate } from '@/map/settlements/romanSettlement';
import type { ReconstructionCertainty, ReconstructionObject, ReconstructionSpec } from '@/map/settlements/reconstructionSpec';
import { matchContext } from '@/lib/scenarios/contextLayers';
import type { ContextInfo, HistoricalTime } from '@/lib/scenarios/schema';

const source = 'reconstruction-objects', fill = 'reconstruction-fill', selected = 'reconstruction-selected', massSource = 'reconstruction-massing', massLayer = 'reconstruction-massing-3d';
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

/**
 * Extruded massing for the regional view (zoom 13 to 17), drawn by the map itself, so Rome from above reads as a city before the 3D scene
 * streams in. It fades out as the lit 3D scene takes over. Buildings, the circus (stands round an empty track) and the palace wings.
 */
export function massingFeatures(spec: ReconstructionSpec, origin: Coordinate, at: HistoricalTime, includeGuess: boolean, tint: boolean): FeatureCollection {
  const ll = (p: readonly number[]) => offsetCoordinate(origin, p as [number, number]) as [number, number];
  const ring = (points: readonly (readonly number[])[]) => [...points, points[0]].map(ll);
  const features: Feature[] = [];
  const add = (o: ReconstructionObject, rings: readonly (readonly (readonly number[])[])[], height: number, colour: string) => features.push({ type: 'Feature', properties: { id: o.id, height, color: tint ? certaintyColour[o.certainty] : colour }, geometry: { type: 'Polygon', coordinates: rings.map(ring) } });
  for (const o of spec.objects) {
    if (reconstructionMatch(o, at) === 'outside' || (!includeGuess && o.certainty === 'best-guess')) continue;
    const shape = o.shape;
    if (shape.type === 'building') add(o, [o.footprint], shape.height + 1.2, PLASTER[shape.tone % PLASTER.length]);
    else if (shape.type === 'circus') add(o, [o.footprint, shape.trackOutline], shape.outerHeight, '#d2c6a8');
    else if (shape.type === 'palace') for (const v of shape.volumes as { c: number[]; size: number[]; heading: number; height: number; role: string }[]) {
      if (v.role === 'platform') continue;
      const ux = Math.cos(v.heading), uz = Math.sin(v.heading);
      add(o, [[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [v.c[0] + ux * v.size[0] / 2 * a - uz * v.size[1] / 2 * b, v.c[1] + uz * v.size[0] / 2 * a + ux * v.size[1] / 2 * b])], v.height + 1, '#e0d4b8');
    }
  }
  return { type: 'FeatureCollection', features };
}

/** Inspectable outlines for every placed object. Nearly invisible until tinted by certainty. */
export function reconstructionOverlay(map: Map, spec: ReconstructionSpec, origin: Coordinate, onInspect: (id: string) => void, pick?: (point: { x: number; y: number }) => string | undefined) {
  map.addSource(source, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  const before = map.getLayer('scenario-context-lines') ? 'scenario-context-lines' : undefined;
  map.addLayer({ id: fill, type: 'fill', source, minzoom: 15.5, paint: { 'fill-color': colourExpression, 'fill-opacity': 0.02 } }, before);
  map.addSource(massSource, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  // Hands over to the lit 3D scene (the same 'local-ground' state that retires the flat ground) so the two never double up.
  map.addLayer({ id: massLayer, type: 'fill-extrusion', source: massSource, minzoom: 13, paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-base': 0,
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
  const features = (at: HistoricalTime, includeGuess: boolean): FeatureCollection => ({ type: 'FeatureCollection', features: spec.objects
    .filter(o => reconstructionMatch(o, at) !== 'outside' && (includeGuess || o.certainty !== 'best-guess'))
    .map((o): Feature => ({ type: 'Feature', properties: { id: o.id, certainty: o.certainty, kind: o.kind }, geometry: { type: 'Polygon', coordinates: [[...o.footprint, o.footprint[0]].map(p => offsetCoordinate(origin, p as [number, number]) as [number, number])] } })) });
  return {
    update(at: HistoricalTime, includeGuess: boolean, tint: boolean, highlight?: string) {
      (map.getSource(source) as GeoJSONSource | undefined)?.setData(features(at, includeGuess));
      (map.getSource(massSource) as GeoJSONSource | undefined)?.setData(massingFeatures(spec, origin, at, includeGuess, tint));
      if (map.getLayer(fill)) map.setPaintProperty(fill, 'fill-opacity', tint ? 0.42 : 0.02);
      if (map.getLayer(selected)) map.setFilter(selected, ['==', ['get', 'id'], highlight ?? '']);
    },
    dispose() {
      map.off('click', click); map.off('mouseenter', fill, pointer); map.off('mouseleave', fill, reset);
      for (const id of [selected, fill, massLayer]) if (map.getLayer(id)) map.removeLayer(id);
      for (const id of [source, massSource]) if (map.getSource(id)) map.removeSource(id);
    },
  };
}
