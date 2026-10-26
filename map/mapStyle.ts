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
 *   • Content:   low-detail world — country polygons and a few named geo
 *                lines. Max zoom 6. No cities, roads or terrain.
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
 *
 * Two consequences of that source shape are worth knowing:
 *   • Its only polygon layer is per-country, so there is no land-only geometry
 *     to stroke. We draw no outlines at all — a coastline stroke would also
 *     trace every political border — and landmasses read as flat, opaque fills.
 *   • Its `geolines` layer has no meridians, so the graticule is generated
 *     locally instead. See {@link createGraticule}.
 */

import type { Feature, FeatureCollection, LineString, Position } from "geojson";
import type { StyleSpecification } from "maplibre-gl";
import type { GlobeView } from "@/state/explorationStore";

/** Demo vector tiles. See the module header for licensing/limits. */
const GEO_SOURCE = "https://demotiles.maplibre.org/tiles/tiles.json";

export const GEO_ATTRIBUTION =
  'Geometry © <a href="https://www.naturalearthdata.com/">Natural Earth</a> · ' +
  'demo tiles © <a href="https://maplibre.org/">MapLibre</a> (development use only)';

/**
 * Graticule geometry is generated locally rather than taken from the tiles:
 * the demo source's `geolines` layer has no meridians at all (only the five
 * named latitude rings and a malformed date line), and it stops at zoom 4.
 */
const GRATICULE_STEP = 15;
/** Web Mercator — and therefore the tile grid MapLibre projects from — ends here. */
const GRATICULE_LAT_LIMIT = 85;
/** Vertex spacing. Lines need intermediate points to curve on the globe. */
const GRATICULE_DENSIFY = 5;

function createGraticule(): FeatureCollection<LineString> {
  const features: Feature<LineString>[] = [];

  // Meridians. 180° is omitted: it is the same line as -180°.
  for (let lng = -180; lng < 180; lng += GRATICULE_STEP) {
    const coordinates: Position[] = [];
    for (
      let lat = -GRATICULE_LAT_LIMIT;
      lat <= GRATICULE_LAT_LIMIT;
      lat += GRATICULE_DENSIFY
    ) {
      coordinates.push([lng, lat]);
    }
    features.push({
      type: "Feature",
      properties: { kind: "meridian", degrees: lng },
      geometry: { type: "LineString", coordinates },
    });
  }

  // Parallels, as full rings around the globe.
  for (
    let lat = -GRATICULE_LAT_LIMIT + (GRATICULE_LAT_LIMIT % GRATICULE_STEP);
    lat <= GRATICULE_LAT_LIMIT;
    lat += GRATICULE_STEP
  ) {
    const coordinates: Position[] = [];
    for (let lng = -180; lng <= 180; lng += GRATICULE_DENSIFY) {
      coordinates.push([lng, lat]);
    }
    features.push({
      type: "Feature",
      properties: { kind: "parallel", degrees: lat },
      geometry: { type: "LineString", coordinates },
    });
  }

  return { type: "FeatureCollection", features };
}

/** Painterly, muted palette tuned to let the globe read as the focal object. */
const palette = {
  ocean: "#0a1622",
  land: "#223240",
  landHighlight: "#2d3f4d",
  graticule: "#ffffff0d",
  graticuleMajor: "#ffffff1a",
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
      graticule: { type: "geojson", data: createGraticule() },
    },
    layers: [
      { id: "ocean", type: "background", paint: { "background-color": palette.ocean } },
      {
        id: "land",
        type: "fill",
        source: "geo",
        "source-layer": "countries",
        // Fully opaque: the source only has per-country polygons, so any
        // translucency lets ocean bleed through shared edges and the political
        // borders reappear as hairlines.
        paint: { "fill-color": palette.land, "fill-opacity": 1 },
      },
      {
        id: "graticule",
        type: "line",
        source: "graticule",
        filter: ["!=", ["get", "degrees"], 0],
        paint: { "line-color": palette.graticule, "line-width": 1 },
      },
      {
        // Equator and prime meridian, picked out a touch brighter.
        id: "graticule-major",
        type: "line",
        source: "graticule",
        filter: ["==", ["get", "degrees"], 0],
        paint: { "line-color": palette.graticuleMajor, "line-width": 1 },
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
