/**
 * Static physical geography, palette, atmosphere and camera conversion.
 * Local Natural Earth data is independent of historical timeline state.
 * Mapterhorn DEM stays independent of the Natural Earth surface layers.
 */

import type { Feature, FeatureCollection, LineString, Position } from "geojson";
import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";
import type { GlobeView } from "@/state/explorationStore";

const GEOGRAPHY_ROOT = "/geo/natural-earth-v5.1.2";
export const TERRAIN_SOURCE = "physical-elevation";
export const DEFAULT_TERRAIN_EXAGGERATION = 1;
export const TERRAIN_EXAGGERATIONS = [1, 1.5, 2, 2.5] as const;
export const REGIONAL_LAND_SOURCE = "physical-land-regional";
export const COAST_DETAIL_STATE = "coast-detail";
const detail: ExpressionSpecification = ["coalesce", ["global-state", COAST_DETAIL_STATE], 0];

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
  coastline: "#587083",
  // Inland water reads as water, not as holes punched through the land: a muted
  // blue keyed to the navy ocean but lifted well clear of it and of the land.
  inlandWater: "#35596f",
  // Lighter than the lake body: a river thread has to stay legible as water
  // where a solid fill would, at one pixel wide, just read as a dark seam.
  river: "#5d879d",
  graticule: "#7e95a8",
  graticuleMajor: "#8da5b8",
  skyHigh: "#060b14",
  horizon: "#213a4f",
  fog: "#0a1622",
} as const;

/**
 * Build a fresh style without mutating shared state. MapLibre tiles/simplifies
 * the compact 1:50m base in its worker. Regional 1:10m vector tiles only load
 * from z4; land, ocean masks and outlines derive from the same land rings.
 */
export function createGlobeStyle(): StyleSpecification {
  return {
    version: 8,
    name: "mankind-historical-globe",
    projection: { type: "globe" },
    terrain: { source: TERRAIN_SOURCE, exaggeration: DEFAULT_TERRAIN_EXAGGERATION },
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
      // https://mapterhorn.com/data-access/ — Terrarium, NOT Mapbox Terrain RGB.
      [TERRAIN_SOURCE]: {
        type: "raster-dem",
        tiles: ["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"],
        encoding: "terrarium",
        tileSize: 512,
        // Global archive covers z0–12; higher native zooms have partial coverage.
        // MapLibre handles overzooming and terrain mesh detail itself.
        maxzoom: 12,
        attribution: '<a href="https://mapterhorn.com/attribution">© Mapterhorn</a>',
      },
      "physical-land": {
        type: "geojson",
        data: `${GEOGRAPHY_ROOT}/ne_50m_land.geojson`,
        attribution: GEO_ATTRIBUTION,
        maxzoom: 8,
      },
      [REGIONAL_LAND_SOURCE]: {
        type: "vector",
        tiles: [`${GEOGRAPHY_ROOT}/land-10m/{z}/{x}/{y}.pbf`],
        attribution: GEO_ATTRIBUTION,
        minzoom: 4,
        maxzoom: 4,
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
        id: "regional-land",
        type: "fill",
        source: REGIONAL_LAND_SOURCE,
        "source-layer": "land",
        minzoom: 4,
        paint: {
          "fill-color": palette.land,
          "fill-antialias": false,
          "fill-opacity": detail,
          "fill-opacity-transition": { duration: 300 },
        },
      },
      {
        id: "regional-ocean",
        type: "fill",
        source: REGIONAL_LAND_SOURCE,
        "source-layer": "ocean",
        minzoom: 4,
        paint: {
          "fill-color": palette.ocean,
          "fill-antialias": false,
          "fill-opacity": detail,
          "fill-opacity-transition": { duration: 300 },
        },
      },
      {
        id: "coastline",
        type: "line",
        source: "physical-land",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": palette.coastline,
          "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.8, 2, 1.1, 6, 1.4],
          "line-opacity": ["*", 0.8, ["-", 1, detail]],
          "line-opacity-transition": { duration: 300 },
        },
      },
      {
        id: "regional-coastline",
        type: "line",
        source: REGIONAL_LAND_SOURCE,
        "source-layer": "coastline",
        minzoom: 4,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": palette.coastline,
          "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.8, 2, 1.1, 6, 1.4],
          "line-opacity": ["*", 0.8, detail],
          "line-opacity-transition": { duration: 300 },
        },
      },
      {
        id: "rivers",
        type: "line",
        source: "physical-rivers",
        // Natural Earth's visibility ranks keep minor features out of global views.
        filter: ["<=", ["get", "min_zoom"], ["zoom"]],
        // Round joins and caps stop the simplified centrelines from reading as
        // the hard, mitred segments of a boundary line.
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": palette.river,
          // Thinner than the coastline at every zoom: rivers describe the land,
          // they never outline it. Sub-pixel widths are carried by opacity
          // rather than by blur, which erases a line this thin outright.
          "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.25, 4, 0.55, 8, 0.95],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.35, 4, 0.65, 8, 0.8],
        },
      },
      {
        id: "lakes",
        type: "fill",
        source: "physical-lakes",
        filter: ["<=", ["get", "min_zoom"], ["zoom"]],
        paint: {
          "fill-color": palette.inlandWater,
          // 1:50m rings are coarse, so globally the fill stays quiet and only
          // firms up once a lake is large enough on screen to be read as one.
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.55, 3, 0.75, 5, 0.9],
        },
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
