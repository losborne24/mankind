import { LngLat, type LngLatLike, type Map } from "maplibre-gl";

/**
 * Sample the loaded terrain for future geographic object placement. MapLibre 6
 * returns exaggerated metres; keep physical and displayed height explicit.
 * This is a view-dependent DEM sample, not a survey altitude. MapLibre returns
 * zero where tiles have not loaded, so consumers should resample on sourcedata.
 */
export function queryTerrainHeights(map: Map, location: LngLatLike) {
  const terrain = map.getTerrain();
  const displayMeters = map.queryTerrainElevation(location);
  if (!terrain || displayMeters === null) return null;
  const exaggeration = terrain.exaggeration ?? 1;
  if (typeof exaggeration !== "number" || exaggeration <= 0) return null;
  return { elevationMeters: displayMeters / exaggeration, displayMeters };
}

export interface TerrainSample {
  displayMeters: number | null;
  readiness: "confirmed" | "uncertain" | "unavailable";
}

/**
 * MapLibre 6.15 exposes drawn DEM coverage on its terrain object. Keep this
 * version-specific capability here, with an explicit uncertain fallback.
 * Loaded parent DEM counts as available: this is rendered height, not a survey.
 */
export function queryTerrainSample(map: Map, location: LngLatLike): TerrainSample {
  if (!map.getTerrain()) return { displayMeters: null, readiness: "unavailable" };
  const drawn = map.terrain?.getDrawnElevationForLngLat?.(LngLat.convert(location));
  if (drawn !== undefined && Number.isFinite(drawn)) return { displayMeters: drawn, readiness: "confirmed" };
  const height = map.queryTerrainElevation(location);
  if (height === null || !Number.isFinite(height)) return { displayMeters: null, readiness: "unavailable" };
  return { displayMeters: height, readiness: height === 0 ? "uncertain" : "confirmed" };
}
