/**
 * Static physical geography, palette, atmosphere and camera conversion.
 * Local Natural Earth data is independent of historical timeline state.
 * Future raster DEM/terrain can be added alongside these physical sources.
 */

import type { Feature, FeatureCollection, LineString, Position } from "geojson";
import type { StyleSpecification } from "maplibre-gl";
import type { GlobeView } from "@/state/explorationStore";

const GEOGRAPHY_ROOT = "/geo/natural-earth-v5.1.2";

export const GEO_ATTRIBUTION =
  'Made with <a href="https://www.naturalearthdata.com/">Natural Earth</a> (public domain)';

/** Independent coordinate overlay; intermediate vertices curve on the globe. */
const GRATICULE_STEP = 30;
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
  coastline: "#314655",
  inlandWater: "#0e1e2b",
  river: "#122330",
  graticule: "#7e95a8",
  graticuleMajor: "#8da5b8",
  skyHigh: "#060b14",
  horizon: "#213a4f",
  fog: "#0a1622",
} as const;

/**
 * Build a fresh style without mutating shared state. MapLibre tiles/simplifies
 * the compact 1:50m GeoJSON in its worker for each zoom (up to z8, then overzoom).
 * Reuse land rings for the subtle coast: no duplicate coastline/ocean dataset.
 */
export function createGlobeStyle(): StyleSpecification {
  return {
    version: 8,
    name: "mankind-historical-globe",
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
      // Reserved namespace for physical geography; later DEM sources are separate.
      "physical-land": {
        type: "geojson",
        data: `${GEOGRAPHY_ROOT}/ne_50m_land.geojson`,
        attribution: GEO_ATTRIBUTION,
        maxzoom: 8,
      },
      "physical-lakes": {
        type: "geojson",
        data: `${GEOGRAPHY_ROOT}/ne_50m_lakes.geojson`,
        attribution: GEO_ATTRIBUTION,
        maxzoom: 8,
      },
      "physical-rivers": {
        type: "geojson",
        data: `${GEOGRAPHY_ROOT}/ne_50m_rivers_lake_centerlines.geojson`,
        attribution: GEO_ATTRIBUTION,
        maxzoom: 8,
      },
      graticule: { type: "geojson", data: createGraticule() },
    },
    layers: [
      { id: "ocean", type: "background", paint: { "background-color": palette.ocean } },
      {
        id: "land",
        type: "fill",
        source: "physical-land",
        paint: { "fill-color": palette.land, "fill-opacity": 1 },
      },
      {
        id: "coastline",
        type: "line",
        source: "physical-land",
        paint: {
          "line-color": palette.coastline,
          "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.35, 6, 0.7],
          "line-opacity": 0.4,
        },
      },
      {
        id: "rivers",
        type: "line",
        source: "physical-rivers",
        // Natural Earth's visibility ranks keep minor features out of global views.
        filter: ["<=", ["get", "min_zoom"], ["zoom"]],
        paint: {
          "line-color": palette.river,
          "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.3, 4, 0.7, 8, 1.2],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.3, 4, 0.8],
        },
      },
      {
        id: "lakes",
        type: "fill",
        source: "physical-lakes",
        filter: ["<=", ["get", "min_zoom"], ["zoom"]],
        paint: { "fill-color": palette.inlandWater },
      },
      {
        id: "graticule",
        type: "line",
        source: "graticule",
        filter: ["!=", ["get", "degrees"], 0],
        maxzoom: 5,
        paint: {
          "line-color": palette.graticule,
          "line-width": 1,
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.07, 2.5, 0.07, 5, 0],
        },
      },
      {
        // Equator and prime meridian, picked out a touch brighter.
        id: "graticule-major",
        type: "line",
        source: "graticule",
        filter: ["==", ["get", "degrees"], 0],
        maxzoom: 5,
        paint: {
          "line-color": palette.graticuleMajor,
          "line-width": 1,
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.12, 2.5, 0.12, 5, 0],
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
