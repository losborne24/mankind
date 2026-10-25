/**
 * MapLibre style and map configuration for the historical globe.
 *
 * This module is the single place that defines the geographic look of the
 * world: the data sources, the painterly dark palette, and the base camera.
 * Keeping it isolated means the art direction can evolve without touching the
 * map lifecycle or the Three.js renderer.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * GEOGRAPHIC DATA  —  self-hosted Natural Earth (physical)
 * ──────────────────────────────────────────────────────────────────────────
 * Landmasses, coastlines and islands come from Natural Earth's PHYSICAL `land`
 * theme, bundled as GeoJSON under `public/geo/` and served as static assets
 * from our own origin. See `public/geo/PROVENANCE.md` for data provenance,
 * license (public domain), attribution and the cost/bandwidth analysis.
 *
 *   • Content:   real land polygons (incl. major islands); the coastline is the
 *                outline of the land fill. NO political boundaries — a
 *                historical globe must not show modern borders as a default.
 *   • Scales:    1:50 m for the global view (loads at startup, ~573 KB gz);
 *                1:10 m for regional zoom, fetched lazily by `map/regionalGeo.ts`.
 *   • Cost/key:  none. Static assets on our own origin — no API key, no rate
 *                limit, no third-party endpoint that can throttle or disappear.
 *
 * This replaces the previous `demotiles.maplibre.org` dependency, which
 * MapLibre documents as development-only with no availability guarantee.
 */

import type { StyleSpecification } from "maplibre-gl";
import type { GlobeView } from "@/state/explorationStore";
import { createGraticule } from "@/map/graticule";
import {
  demSource,
  hillshadeLayer,
  reliefLayer,
  TERRAIN_IDS,
} from "@/map/terrain";

/** Natural Earth is public domain; we credit it by courtesy only. */
export const GEO_ATTRIBUTION =
  'Geography © <a href="https://www.naturalearthdata.com/">Natural Earth</a> (public domain)';

/**
 * Zoom at which the globe hands off from the 1:50 m (global) data to the
 * 1:10 m (regional) data. Both the 1:50 m land fill and its coastline stroke
 * stop here and their finer 1:10 m counterparts take over — the ranges meet but
 * never overlap, so the coarser simplified geometry can never poke out from
 * under the finer fill. Shared with {@link map/regionalGeo}.
 *
 * The 1:50 m handoff is NOT applied in the base style: it is installed by
 * `map/regionalGeo.ts` only once the 1:10 m data is actually ready to render,
 * so land never goes blank while the finer data is still downloading.
 */
export const REGIONAL_ZOOM = 5.0;

/** Source and layer ids, shared with the lazy regional loader. */
export const GEO_IDS = {
  land50: "land-50m",
  land10: "land-10m",
  ocean50: "ocean-50m",
  ocean10: "ocean-10m",
  graticule: "graticule",
  landFill50: "land-fill-50m",
  coast50: "coastline-50m",
  landFill10: "land-fill-10m",
  coast10: "coastline-10m",
  oceanFill50: "ocean-fill-50m",
  oceanFill10: "ocean-fill-10m",
} as const;

/** Static asset URLs for the bundled Natural Earth data. */
export const GEO_DATA = {
  land50: "/geo/ne_50m_land.json",
  land10: "/geo/ne_10m_land.json",
  ocean50: "/geo/ne_50m_ocean.json",
  ocean10: "/geo/ne_10m_ocean.json",
} as const;

/**
 * Painterly, muted palette tuned to let the globe read as the focal object.
 * Exported so the lazily added regional layers match exactly.
 */
export const palette = {
  ocean: "#0a1622",
  land: "#223240",
  coastline: "#4a6478",
  graticule: "#ffffff0d",
  skyHigh: "#060b14",
  horizon: "#213a4f",
  fog: "#0a1622",
} as const;

/**
 * Build the MapLibre style. It is a function (not a constant) so future phases
 * can parameterize the palette by era/time of day without mutating shared
 * state.
 *
 * Only the global (1:50 m) data and the graticule are in the base style; the
 * regional (1:10 m) data is added lazily (see `map/regionalGeo.ts`) so a user
 * who stays at a continental view never downloads it.
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
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.9, 6, 0.2],
    },
    sources: {
      [GEO_IDS.land50]: {
        type: "geojson",
        data: GEO_DATA.land50,
        attribution: GEO_ATTRIBUTION,
      },
      // Ocean polygon — the geographically-correct mask that repaints clean
      // water over the terrain relief (see the ocean fill layer below). Fetched
      // at the same scale as the land so their coastlines agree exactly.
      [GEO_IDS.ocean50]: {
        type: "geojson",
        data: GEO_DATA.ocean50,
        attribution: GEO_ATTRIBUTION,
      },
      [GEO_IDS.graticule]: {
        type: "geojson",
        // Generated in-process (no download). See map/graticule.ts.
        data: createGraticule(30),
      },
      // Elevation for physical displacement. Only visible tiles load, and
      // terrain remains continuous across the 1:50 m ↔
      // 1:10 m vector handoff. See map/terrain.ts.
      [TERRAIN_IDS.dem]: demSource(),
      // Independent tile processing for lighting and displacement. Both read
      // the same unchanged, browser-cached Terrarium tile URLs.
      [TERRAIN_IDS.shading]: demSource(),
    },
    layers: [
      {
        id: "ocean",
        type: "background",
        paint: { "background-color": palette.ocean },
      },
      {
        // Global land fill — the default geometry, visible from zoom 0.
        //
        // It is intentionally left UNCAPPED here: if it were capped at
        // REGIONAL_ZOOM in the base style, land would go blank at zoom ≥5 during
        // the window before the lazily-fetched 1:10 m data arrives. Instead
        // `map/regionalGeo.ts` installs a camera-zoom opacity gate once the 1:10 m data
        // is actually ready to render, handing the two scales off atomically.
        //
        // After that handoff the cap matters: the 1:50 m polygon is
        // Douglas-Peucker simplified, which displaces vertices OUTWARD as well
        // as inward, so it does not nest inside the 1:10 m polygon. Wherever a
        // coarser edge bows seaward of the true coast it would poke out from
        // under the finer fill as a straight-edged land wedge past the 1:10 m
        // coastline (badly visible around Greece, the Aegean, Crete and SW
        // Anatolia). Capping at handoff removes that overlap entirely.
        id: GEO_IDS.landFill50,
        type: "fill",
        source: GEO_IDS.land50,
        // Outlines are drawn by CoastlineLayer outside the terrain drape.
        paint: { "fill-color": palette.land, "fill-opacity": 1, "fill-antialias": false },
      },
      // ── Stylised terrain (Phase 2) ───────────────────────────────────────────
      // Composited ADDITIVELY over the opaque land fill and BELOW the graticule
      // and coastline, so the authoritative Natural Earth land shape and its
      // crisp coast always win and the DEM only shades what is already land.
      // The relief tone sits under the sculptural hillshade light. The lazily
      // added 1:10 m land fill is inserted *below* these layers (see
      // map/regionalGeo.ts) so the relief covers both vector resolutions.
      reliefLayer(),
      hillshadeLayer(),
      // Ocean mask — repaint clean, opaque water over the terrain relief using
      // Natural Earth's physical ocean polygon (NOT the DEM elevation, which
      // would also mask inland below-sea-level land — Qattara, the Jordan Rift —
      // as sea). Drawn above the hillshade so it hides every scrap of submarine
      // relief, and below the graticule + coastline so those stay crisp on top.
      // Capped at REGIONAL_ZOOM by map/regionalGeo.ts in the same handoff as the
      // land, where the finer 1:10 m ocean takes over.
      {
        id: GEO_IDS.oceanFill50,
        type: "fill",
        source: GEO_IDS.ocean50,
        paint: { "fill-color": palette.ocean, "fill-opacity": 1, "fill-antialias": false },
      },
      {
        id: GEO_IDS.graticule,
        type: "line",
        source: GEO_IDS.graticule,
        paint: { "line-color": palette.graticule, "line-width": 1 },
      },
    ],
  };
}

/** Convert a {@link GlobeView} into MapLibre camera options. */
export function viewToCamera(view: GlobeView) {
  return {
    center: [view.center[0], view.center[1]] as [number, number],
    zoom: view.zoom,
    bearing: view.bearing,
    pitch: view.pitch,
  };
}
