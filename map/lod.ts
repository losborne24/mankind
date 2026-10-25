/**
 * Level-of-detail policy.
 *
 * A single, configurable place that maps the live map zoom to a discrete detail
 * level, so the renderer never scatters hardcoded `zoom > N` comparisons. Each
 * anchored object builds all three levels once and simply toggles which subtree
 * is visible per frame based on {@link zoomToLod}.
 *
 *   far    — orbital / continental view: a simplified settlement *indicator*
 *            only. No individual buildings or trees; avoids clutter and cost.
 *   mid    — regional view: building clusters / footprints, roads, some
 *            vegetation; no per-object ambient animation.
 *   near   — close view: individual buildings and vegetation, full roads, and
 *            subtle ambient animation.
 *
 * Thresholds are tuned for MapLibre's globe (the globe→mercator transition sits
 * around zoom 5–6; settlement geometry only reads clearly once essentially
 * mercator). Adjust here, not in the renderer.
 */

export type LodLevel = "far" | "mid" | "near";

export interface LodThresholds {
  /** Minimum zoom for `mid`; below this is `far`. */
  readonly midMinZoom: number;
  /** Minimum zoom for `near`; below this (but ≥ midMinZoom) is `mid`. */
  readonly nearMinZoom: number;
}

export const DEFAULT_LOD: LodThresholds = {
  midMinZoom: 5.5,
  nearMinZoom: 10.5,
};

/** Map a zoom level to a detail level using the given thresholds. */
export function zoomToLod(
  zoom: number,
  thresholds: LodThresholds = DEFAULT_LOD,
): LodLevel {
  if (zoom >= thresholds.nearMinZoom) return "near";
  if (zoom >= thresholds.midMinZoom) return "mid";
  return "far";
}

/** Whether ambient animation should run at a given detail level. */
export function lodHasAnimation(level: LodLevel): boolean {
  return level === "near";
}
