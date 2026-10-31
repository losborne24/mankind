import type { Map } from 'maplibre-gl';

export interface TravelTarget {
  center: [number, number];
  zoom: number;
  pitch?: number;
  bearing?: number;
  duration?: number;
}

let token = 0;
const rad = Math.PI / 180;
const metres = (a: { lng: number; lat: number }, b: [number, number]) => {
  const h = Math.sin((b[1] - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b[1] * rad) * Math.sin((b[0] - a.lng) * rad / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
};

/**
 * Move the camera to the target before zooming in. When the target is far, first zoom out far
 * enough that both ends fit on screen, then pan, then descend. Replaces map.flyTo, which
 * zooms and pans together. Any user gesture or later camera call cancels the sequence.
 */
export function travelTo(map: Map, target: TravelTarget): void {
  const start = map.getCenter(), cur = map.getZoom(), dist = metres(start, target.center);
  const view = Math.max(300, Math.min(map.getCanvas().clientWidth, map.getCanvas().clientHeight));
  const fit = Math.log2(view * 156543.03 * Math.cos(start.lat * rad) / Math.max(1, dist * 2.5));
  const mid = Math.max(0, Math.min(cur, target.zoom, fit));
  const total = target.duration ?? 2000, pitch = target.pitch ?? map.getPitch(), bearing = target.bearing ?? map.getBearing();
  const steps: Parameters<Map['easeTo']>[0][] = [];
  if (mid < cur - 0.05) steps.push({ zoom: mid, duration: total * 0.25 });
  if (dist > 1) steps.push({ center: target.center, zoom: mid, pitch: Math.min(pitch, map.getPitch()), bearing, duration: total * 0.45 });
  steps.push({ center: target.center, zoom: target.zoom, pitch, bearing, duration: total * 0.3 });
  map.stop();
  const id = ++token;
  const run = (i: number) => {
    if (i >= steps.length) return;
    map.once('moveend', (e: { originalEvent?: unknown; travel?: number }) => {
      // Only our own step finishing continues the sequence; gestures, map.stop() and other camera calls end it.
      if (!e.originalEvent && e.travel === id) run(i + 1);
    });
    map.easeTo(steps[i], { travel: id });
  };
  run(0);
}
