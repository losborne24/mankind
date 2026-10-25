/**
 * MapLibre style and map configuration for the historical globe.
 *
 * This module is the single place that defines the geographic look of the
 * world: the data source, the painterly dark palette, and the base camera.
 * Keeping it isolated means the art direction can evolve without touching the
 * map lifecycle or the Three.js renderer.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * DATA / TILE DEPENDENCY  —  MapLibre "demotiles"
 * ──────────────────────────────────────────────────────────────────────────
 * We render from MapLibre's public demo vector tiles:
 *   https://demotiles.maplibre.org/tiles/{z}/{x}/{y}.pbf
 *
 *   • Content:   low-detail world — country polygons (land/coastline/borders)
 *                and graticule lines. Max zoom 6. No cities, roads or terrain.
 *   • Cost/key:  free, no API key, no account.
 *   • Licensing: data © Natural Earth (public domain) via MapLibre; the tiles
 *                are served by MapLibre purely as a **demonstration** endpoint.
 *   • LIMITS:    MapLibre explicitly states demotiles are for demos/development
 *                only. There is NO uptime, rate-limit, or availability
 *                guarantee, and it is NOT suitable for production traffic.
 *
 * For production, swap `GEO_SOURCE` for self-hosted tiles or a commercial
 * provider (e.g. MapTiler, Protomaps/PMTiles, Stadia). Review each provider's
 * terms, rate limits, and pricing before shipping — do not assume any style or
 * tile endpoint is free or unrestricted.
 */

import type { StyleSpecification } from "maplibre-gl";
import type { GlobeView } from "@/state/explorationStore";

/** Demo vector tiles. See the module header for licensing/limits. */
const GEO_SOURCE = "https://demotiles.maplibre.org/tiles/tiles.json";

export const GEO_ATTRIBUTION =
  'Boundaries © <a href="https://www.naturalearthdata.com/">Natural Earth</a> · ' +
  'demo tiles © <a href="https://maplibre.org/">MapLibre</a> (development use only)';

/** Painterly, muted palette tuned to let the globe read as the focal object. */
const palette = {
  ocean: "#0a1622",
  land: "#223240",
  landHighlight: "#2d3f4d",
  coastline: "#4a6478",
  border: "#38506080",
  graticule: "#ffffff0d",
  skyHigh: "#060b14",
  horizon: "#213a4f",
  fog: "#0a1622",
} as const;

/**
 * Build the MapLibre style. It is a function (not a constant) so future phases
 * can parameterize the palette by era/time of day without mutating shared
 * state.
 */
export function createGlobeStyle(): StyleSpecification {
  return {
    version: 8,
    name: "mankind-historical-globe",
    // Glyphs are referenced by the (optional) country labels. MapLibre's demo
    // font stack; omit labels entirely and this is never fetched.
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    projection: { type: "globe" },
    sky: {
      "sky-color": palette.skyHigh,
      "horizon-color": palette.horizon,
      "fog-color": palette.fog,
      "sky-horizon-blend": 0.6,
      "horizon-fog-blend": 0.5,
      "fog-ground-blend": 0.2,
      // Subtle atmospheric halo around the globe rim.
      "atmosphere-blend": [
        "interpolate",
        ["linear"],
        ["zoom"],
        0,
        0.9,
        6,
        0.2,
      ],
    },
    sources: {
      geo: { type: "vector", url: GEO_SOURCE, attribution: GEO_ATTRIBUTION },
    },
    layers: [
      { id: "ocean", type: "background", paint: { "background-color": palette.ocean } },
      {
        id: "land",
        type: "fill",
        source: "geo",
        "source-layer": "countries",
        paint: { "fill-color": palette.land, "fill-opacity": 0.92 },
      },
      {
        id: "graticule",
        type: "line",
        source: "geo",
        "source-layer": "geolines",
        paint: { "line-color": palette.graticule, "line-width": 1 },
      },
      {
        id: "country-borders",
        type: "line",
        source: "geo",
        "source-layer": "countries",
        paint: {
          "line-color": palette.border,
          "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.4, 6, 1.2],
        },
      },
      {
        id: "coastline",
        type: "line",
        source: "geo",
        "source-layer": "countries",
        paint: {
          "line-color": palette.coastline,
          "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.5, 6, 1.6],
          "line-opacity": 0.85,
        },
      },
    ],
  };
}

/**
 * A fixed, well-known anchor for the Phase-1 Three.js test object: the Giza
 * plateau in Egypt (≈ 29.9792 °N, 31.1342 °E) — fitting for a world that opens
 * in 3000 BCE. Used to verify geographic anchoring of 3D geometry.
 */
export const TEST_MARKER_LNGLAT: readonly [number, number] = [31.1342, 29.9792];

/** Convert a {@link GlobeView} into MapLibre camera options. */
export function viewToCamera(view: GlobeView) {
  return {
    center: [view.center[0], view.center[1]] as [number, number],
    zoom: view.zoom,
    bearing: view.bearing,
    pitch: view.pitch,
  };
}
