/**
 * Stylised terrain (Phase 2) — the relief foundation of the world map.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS
 * ─────────────────────────────────────────────────────────────────────────────
 * A *stylised* elevation render that turns the flat land polygon into a sculpted,
 * strategy-game terrain base — readable landforms, soft dimensional relief, and
 * a clear separation of lowlands / uplands / mountains — without tipping into
 * satellite realism, noisy scientific hillshade, or biome colour (forests,
 * deserts, grasslands belong to Phase 3, which is time- and biome-dependent).
 *
 * The physical input is real elevation (a bundled, self-hosted Terrarium DEM —
 * see scripts/fetch-dem.mjs and public/geo/dem/PROVENANCE.md). Two MapLibre
 * layers turn it into the look:
 *
 *   • color-relief — a near-grayscale *value* ramp keyed to elevation. It does
 *     not paint biomes; it only lifts the land's tone with height so lowlands,
 *     uplands and mountains read apart at a glance. It is TRANSPARENT at and
 *     below sea level and soft-fades in just above the shoreline, so it never
 *     paints the ocean and never draws a hard tide line that could disagree with
 *     the coastline.
 *   • hillshade — the sculptural light. A soft, single warm key light gives the
 *     land its dimensional, painterly form. Deliberately gentle (low
 *     exaggeration, soft method) to stay illustrative rather than harsh.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT STAYS GEOGRAPHICALLY CLEAN (no seams, no fill/coast mismatch)
 * ─────────────────────────────────────────────────────────────────────────────
 * The relief is composited ADDITIVELY ON TOP of the opaque Natural Earth land
 * fill, and the Natural Earth coastline is stroked ABOVE the relief. So the
 * authoritative land shape and its crisp coast come entirely from the vector
 * data; the DEM only shades what is already land. The DEM's own coarse 0 m
 * contour never has to agree with the vector coastline — where color-relief
 * fades to transparent near the shore, the opaque land base simply shows
 * through. This is what lets a coarse DEM and a fine coastline coexist without
 * wedges, cracks, or a doubled tide line.
 *
 * The DEM is a single raster-dem source tiled by MapLibre itself, so it is
 * viewport-driven for free (only visible tiles load) and continuous across the
 * 1:50 m ↔ 1:10 m vector handoff — the relief does not care which land polygon
 * resolution is active beneath it. Past {@link DEM_MAXZOOM} MapLibre overzooms
 * the coarse DEM, which is exactly what gives the close-up relief its smooth,
 * non-noisy, painterly character instead of harsh micro-detail.
 */

import type {
  ExpressionSpecification,
  LayerSpecification,
  RasterDEMSourceSpecification,
} from "maplibre-gl";

/** Source + layer ids for the terrain, kept alongside the geography ids. */
export const TERRAIN_IDS = {
  dem: "dem",
  relief: "relief",
  hillshade: "hillshade",
  seaCover: "sea-cover",
} as const;

/**
 * Root-relative tile template for the bundled Terrarium DEM pyramid. Served as
 * static assets from our own origin — no runtime dependency on any tile service.
 */
export const DEM_TILES = "/geo/dem/{z}/{x}/{y}.png";

/**
 * Deepest NATIVE DEM zoom we bundle (see scripts/fetch-dem.mjs). MapLibre
 * overzooms past this; we WANT that — the coarse source smoothed by overzoom is
 * the stylisation, not a limitation.
 */
export const DEM_MAXZOOM = 4;

/**
 * The composited public-domain elevation sources behind the Terrarium tiles.
 * Credited by courtesy (same stance as the Natural Earth geography).
 */
export const DEM_ATTRIBUTION =
  'Elevation: <a href="https://registry.opendata.aws/terrain-tiles/">Terrain Tiles</a> (SRTM/GMTED/ETOPO, public domain)';

/** The raster-dem source feeding both relief layers. */
export function demSource(): RasterDEMSourceSpecification {
  return {
    type: "raster-dem",
    tiles: [DEM_TILES],
    // Terrarium encoding: height(m) = (R*256 + G + B/256) - 32768.
    encoding: "terrarium",
    tileSize: 256,
    // Cap the native zoom at what we bundle; MapLibre overzooms beyond it.
    maxzoom: DEM_MAXZOOM,
    attribution: DEM_ATTRIBUTION,
  };
}

/**
 * Elevation → colour ramp. Intentionally a near-grayscale VALUE ramp in the
 * palette's cool-slate family: it lightens (and warms a touch) with height to
 * separate lowland / upland / mountain, but carries almost no hue so it reads as
 * relief tone, not as a biome.
 *
 * Alpha is zero at and below sea level and fades in over the first few dozen
 * metres, so the tint never bleeds onto the ocean and never draws a hard
 * shoreline that could disagree with the vector coast.
 */
const RELIEF_RAMP: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["elevation"],
  // sea & below — fully transparent (ocean shows the flat land base / ocean).
  -12000,
  "rgba(0,0,0,0)",
  0,
  "rgba(0,0,0,0)",
  // soft fade-in just above the shoreline (no hard tide line). Lowlands stay
  // very close to the dark land base so the map keeps its focal, dark mood.
  40,
  "rgba(38,52,62,0.12)",
  400,
  "rgba(48,60,66,0.34)",
  // uplands — cool slate, lifting gently so the plains↔hills break reads.
  1000,
  "rgba(66,76,76,0.52)",
  2000,
  "rgba(100,104,94,0.68)",
  // mountains — warm desaturated stone; this is where the land clearly brightens.
  3000,
  "rgba(142,140,122,0.80)",
  4200,
  "rgba(182,178,159,0.89)",
  // high peaks — pale highland, snow-touched but muted (not pure white).
  5400,
  "rgba(210,206,191,0.93)",
  6500,
  "rgba(228,226,215,0.95)",
];

/**
 * color-relief layer — the elevation tone. Drawn above the land fill and below
 * the hillshade so the sculptural light sits over the tonal base.
 */
export function reliefLayer(): LayerSpecification {
  return {
    id: TERRAIN_IDS.relief,
    type: "color-relief",
    source: TERRAIN_IDS.dem,
    paint: {
      "color-relief-color": RELIEF_RAMP,
      // Global strength of the tonal lift — kept moderate so the land reads as
      // one cohesive surface rather than a loud hypsometric map.
      "color-relief-opacity": 0.82,
    },
  };
}

/**
 * hillshade layer — the sculptural relief light. Soft, single warm key from the
 * north-west with a cool shadow, tuned to read as painterly form rather than a
 * harsh scientific hillshade.
 *
 * `igor` is the softest, flattest of MapLibre's methods (gentle, cartographic),
 * which is exactly the stylised, low-clutter look we want; a modest exaggeration
 * keeps mountains legible without becoming dramatic 3D terrain. Shadow/highlight
 * alpha (not a layer opacity, which hillshade lacks) sets the overall strength
 * and keeps flat areas — including the ocean floor beneath the coast — quiet.
 */
export function hillshadeLayer(): LayerSpecification {
  return {
    id: TERRAIN_IDS.hillshade,
    type: "hillshade",
    source: TERRAIN_IDS.dem,
    paint: {
      "hillshade-method": "igor",
      "hillshade-exaggeration": 0.55,
      "hillshade-illumination-direction": 335,
      "hillshade-illumination-altitude": 45,
      // Warm pale key light; cool near-black shadow; neutral accent. Alphas are
      // deliberately below 1 so the relief whispers over flat land and ocean.
      "hillshade-highlight-color": "rgba(228,216,189,0.45)",
      "hillshade-shadow-color": "rgba(6,13,22,0.5)",
      "hillshade-accent-color": "rgba(10,22,34,0.3)",
    },
  };
}

/**
 * Sea cover — the clean-ocean mask, and the reason the relief never muddies the
 * water.
 *
 * MapLibre cannot clip a raster to a vector polygon, so instead of drawing the
 * ocean's inverse geometry we re-use the DEM itself: a second color-relief layer
 * with the OPPOSITE alpha ramp — opaque ocean colour at and below sea level,
 * transparent above it. Drawn ABOVE the hillshade, it repaints clean ocean over
 * every scrap of submarine (bathymetry) relief the hillshade would otherwise
 * show, while staying fully transparent over land so the land relief reads
 * through untouched.
 *
 * The fade sits right at the waterline (0 → ~30 m), so it barely touches land;
 * the handful of pixels where the coarse DEM's 0 m contour and the fine vector
 * coast disagree are hidden under the crisp coastline stroke drawn on top. The
 * colour matches the ocean background exactly, so the cover is seamless.
 */
export function seaCoverLayer(oceanColor: string): LayerSpecification {
  const opaque = `${oceanColor}ff`;
  const clear = `${oceanColor}00`;
  const ramp: ExpressionSpecification = [
    "interpolate",
    ["linear"],
    ["elevation"],
    -12000,
    opaque,
    0,
    opaque,
    // Fade out just above the waterline so land relief is left untouched.
    30,
    clear,
  ];
  return {
    id: TERRAIN_IDS.seaCover,
    type: "color-relief",
    source: TERRAIN_IDS.dem,
    paint: {
      "color-relief-color": ramp,
      "color-relief-opacity": 1,
    },
  };
}
