import type { LngLatLike, Map } from "maplibre-gl";

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
