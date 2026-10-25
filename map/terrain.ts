/**
 * Phase 2 elevation and neutral lighting; historical surface colours belong to
 * Phase 3. Terrarium drives physical displacement independently of the Natural
 * Earth land/ocean geometry. No elevation threshold defines a shoreline.
 *
 * Terrain and lighting use separate raster-dem source instances reading the
 * same unchanged tiles. This avoids MapLibre's shared-source rendering-quality
 * warning and keeps the native z4 pyramid and overzoom behaviour intact.
 * Natural Earth's ocean fill masks the lighting over water in mapStyle.ts.
 */

import type {
  ExpressionSpecification,
  LayerSpecification,
  RasterDEMSourceSpecification,
} from "maplibre-gl";

/** Source + layer ids for the terrain, kept alongside the geography ids. */
export const TERRAIN_IDS = {
  dem: "dem",
  shading: "dem-shading",
  relief: "relief",
  hillshade: "hillshade",
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
 * palette's cool-slate family: it lightens with height to
 * separate lowland / upland / mountain, but carries almost no hue so it reads as
 * relief tone, not as a biome.
 *
 * Below-sea-level land has the same tone as other lowlands. Natural Earth's
 * ocean polygon masks this lighting over water; elevation never masks land.
 */
const RELIEF_RAMP: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["elevation"],
  // One continuous lowland material, including inland depressions. Only the
  // Natural Earth ocean mask determines where this tone is visible.
  -12000,
  "rgba(44,58,70,0.12)",
  40,
  "rgba(44,58,70,0.12)",
  400,
  "rgba(54,70,82,0.30)",
  // uplands — the SAME cool blue-grey, lifting only in value so the
  // plains↔hills break reads as height, never as a change of material.
  1000,
  "rgba(72,90,104,0.45)",
  2000,
  "rgba(92,112,128,0.56)",
  // mountains — still the cool blue-grey hue, brightened but deliberately
  // muted: no warm stone, no hypsometric colour, just more light on the rock.
  3000,
  "rgba(110,130,146,0.64)",
  4200,
  "rgba(128,148,164,0.72)",
  // high peaks — a muted light slate, NOT snow-white. The lift stays gentle so
  // summits read as tall rather than as a glaring highlight (and leaves real
  // snow / biome colour to Phase 3).
  5400,
  "rgba(146,164,180,0.78)",
  6500,
  "rgba(160,178,192,0.82)",
];

/**
 * color-relief layer — the elevation tone. Drawn above the land fill and below
 * the hillshade so the sculptural light sits over the tonal base.
 */
export function reliefLayer(): LayerSpecification {
  return {
    id: TERRAIN_IDS.relief,
    type: "color-relief",
    source: TERRAIN_IDS.shading,
    paint: {
      "color-relief-color": RELIEF_RAMP,
      // Global strength of the tonal lift — kept gentle so the land reads as
      // one cohesive blue-grey surface rather than a loud hypsometric map.
      "color-relief-opacity": 0.78,
    },
  };
}

/**
 * hillshade layer — the sculptural relief light. A soft, single NEUTRAL key
 * from the north-west with a cool shadow, tuned to read as painterly form
 * rather than a harsh scientific hillshade.
 *
 * `igor` is the softest, flattest of MapLibre's methods (gentle, cartographic),
 * which is exactly the stylised, low-clutter look we want. The exaggeration is
 * kept modest and the highlight alpha low so mountains stay legible without the
 * blown-out, mottled speckle that a bright key light pulls out of the overzoomed
 * DEM. Shadow/highlight alpha (not a layer opacity, which hillshade lacks) sets
 * the overall strength and keeps flat areas — including the ocean floor beneath
 * the coast — quiet.
 */
export function hillshadeLayer(): LayerSpecification {
  return {
    id: TERRAIN_IDS.hillshade,
    type: "hillshade",
    source: TERRAIN_IDS.shading,
    paint: {
      "hillshade-method": "igor",
      // Softened a touch from 0.55: enough slope contrast to keep ridges and
      // valleys dimensional, little enough that the overzoomed DEM stops reading
      // as noisy, mottled speckle on the mountain flanks.
      "hillshade-exaggeration": 0.45,
      "hillshade-illumination-direction": 335,
      "hillshade-illumination-altitude": 45,
      // Cool, dim NEUTRAL key light (no warm cast); cool near-black shadow;
      // restrained accent. The low highlight alpha is what tames the harsh
      // mountain highlights while the land keeps its single blue-grey material.
      "hillshade-highlight-color": "rgba(198,210,222,0.26)",
      "hillshade-shadow-color": "rgba(8,16,26,0.42)",
      "hillshade-accent-color": "rgba(12,24,36,0.22)",
    },
  };
}
