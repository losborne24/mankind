import type { Map, RasterSourceSpecification } from "maplibre-gl";

export const BIOME_SOURCE = "natural-biomes";
export const BIOME_LAYER = "natural-biome-colours";
// The URL is inlined by Next.js at build time; raster requests happen at runtime.
// No default production service is assumed.
export const BIOME_BASE_URL = process.env.NEXT_PUBLIC_BIOME_TILE_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:8766/pnv-v4-global" : "");
export const BIOME_ATTRIBUTION = 'Contains <a href="https://doi.org/10.7910/DVN/QQHCIK">OpenLandMap PNV · Hengl et al. (2018)</a>, <a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL 1.0</a> · <a href="https://mapterhorn.com/attribution">© Mapterhorn</a>';

/** Small metadata fetch first. Offline service leaves the complete dark atlas usable. */
export async function attachBiomes(map: Map, signal: AbortSignal): Promise<() => void> {
  if (!BIOME_BASE_URL) throw new Error("Biome tile URL is not configured.");
  const base = BIOME_BASE_URL.replace(/\/$/, "");
  const response = await fetch(`${base}/tilejson.json`, { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) });
  if (!response.ok) throw new Error(`Biome metadata: HTTP ${response.status}`);
  const metadata = await response.json();
  if (signal.aborted) return () => {};
  if (!Array.isArray(metadata.bounds) || metadata.bounds.length !== 4 ||
      !metadata.bounds.every(Number.isFinite) || !Number.isInteger(metadata.maxzoom) ||
      metadata.maxzoom < 0 || metadata.maxzoom > 12) throw new Error("Invalid biome tile metadata.");
  // Regional prototypes publish PNG; the global pyramid publishes lossless WebP.
  // Only these two are accepted, so a malformed manifest cannot build a URL.
  const format = metadata.format === undefined ? "png" : metadata.format;
  if (format !== "png" && format !== "webp") throw new Error(`Unsupported biome tile format: ${String(format)}`);
  const source: RasterSourceSpecification = {
    type: "raster", tiles: [`${base}/{z}/{x}/{y}.${format}`], tileSize: 256,
    // Outside `bounds` and beyond `maxzoom` MapLibre reuses parents instead of
    // requesting tiles, so a sparse ocean-skipping pyramid stays quiet.
    minzoom: 0, maxzoom: metadata.maxzoom, bounds: metadata.bounds,
    attribution: `${BIOME_ATTRIBUTION} · <a href="${base}/NOTICE.txt">Data notice</a>`,
  };
  map.addSource(BIOME_SOURCE, source);
  // Above both land fills, below opaque ocean, coastlines, rivers and lakes.
  map.addLayer({ id: BIOME_LAYER, type: "raster", source: BIOME_SOURCE,
    paint: { "raster-opacity": 1, "raster-fade-duration": 250, "raster-resampling": "linear" },
  }, map.getLayer("terrain-diagnostic") ? "terrain-diagnostic" : "regional-ocean");
  return () => {
    if (map.getLayer(BIOME_LAYER)) map.removeLayer(BIOME_LAYER);
    if (map.getSource(BIOME_SOURCE)) map.removeSource(BIOME_SOURCE);
  };
}
