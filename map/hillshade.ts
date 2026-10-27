import type { Map, MapSourceDataEvent } from "maplibre-gl";
import { COAST_DETAIL_STATE, REGIONAL_LAND_SOURCE, TERRAIN_SOURCE, createGlobeStyle } from "./mapStyle";

export const HILLSHADE_SOURCE = "elevation-diagnostic";
const HILLSHADE_LAYER = "terrain-diagnostic";
export const GLOBAL_HILLSHADE_STRENGTH = "global-hillshade-strength";
export const LOCAL_HILLSHADE_STRENGTH = "local-hillshade-strength";
export const DEFAULT_GLOBAL_HILLSHADE_STRENGTH = 0.55;
const GLOBAL_OCEAN_SOURCE = "hillshade-ocean";
const GLOBAL_OCEAN_LAYER = "hillshade-ocean-mask";
// Match the geography paint transition before exposing the shaded surface.
const MASK_SETTLE_MS = 300;

/** One native DEM shading pass, with independent cartographic contrast at low zoom.
 * Physical elevation stays 1×. Coarse ocean stays opaque until the detailed
 * mask has loaded AND finished fading; never crossfade two translucent masks.
 */
export function attachDiagnosticHillshade(map: Map): () => void {
  map.addSource(GLOBAL_OCEAN_SOURCE, {
    type: "vector", tiles: ["/geo/natural-earth-v5.1.2/ocean-50m/{z}/{x}/{y}.pbf"],
    minzoom: 0, maxzoom: 3,
  });
  map.addLayer({
    id: GLOBAL_OCEAN_LAYER, type: "fill", source: GLOBAL_OCEAN_SOURCE,
    "source-layer": "ocean",
    paint: { "fill-color": "#0a1622", "fill-antialias": false },
  }, "regional-ocean");
  map.addSource(HILLSHADE_SOURCE, { ...createGlobeStyle().sources[TERRAIN_SOURCE] });
  map.addLayer({
    id: HILLSHADE_LAYER,
    type: "hillshade",
    source: HILLSHADE_SOURCE,
    layout: { visibility: "none" },
    paint: {
      "hillshade-exaggeration": [
        "interpolate", ["cubic-bezier", 0.42, 0, 0.58, 1], ["zoom"],
        0, ["coalesce", ["global-state", GLOBAL_HILLSHADE_STRENGTH], DEFAULT_GLOBAL_HILLSHADE_STRENGTH],
        4, ["coalesce", ["global-state", GLOBAL_HILLSHADE_STRENGTH], DEFAULT_GLOBAL_HILLSHADE_STRENGTH],
        6, ["coalesce", ["global-state", LOCAL_HILLSHADE_STRENGTH], 0.25],
      ],
      "hillshade-illumination-direction": 315,
      "hillshade-illumination-anchor": "map",
      "hillshade-shadow-color": "rgba(46, 49, 43, 0.65)",
      "hillshade-highlight-color": "rgba(239, 229, 207, 0.55)",
      "hillshade-accent-color": "rgba(71, 65, 53, 0.45)",
    },
  }, GLOBAL_OCEAN_LAYER);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let visible = false;
  const setVisible = (next: boolean) => {
    if (visible === next) return;
    visible = next;
    map.setLayoutProperty(HILLSHADE_LAYER, "visibility", next ? "visible" : "none");
  };
  let detailedMaskReady = false;
  // The regional masks are only opaque — and so only safe on their own — once
  // the coast-detail blend has reached 1.
  const detailBlended = () => map.getGlobalState()[COAST_DETAIL_STATE] === 1;
  const maskReady = () => detailBlended() && map.isSourceLoaded(REGIONAL_LAND_SOURCE);
  let coarseMaskVisible = true;
  // `isSourceLoaded` reports the whole source, so it flaps false on every tile
  // the camera brings into view. Gating a whole layer on it strobes the relief
  // during movement. Opaque coverage is therefore latched once: the coarse mask
  // keeps its already-rendered tiles (and their parents) while new ones stream,
  // so once any opaque mask has covered the ocean, shading stays exposed and
  // only the mask handover below moves.
  let maskCovered = false;
  const showSafeSurface = () => {
    if (coarseMaskVisible === detailedMaskReady) {
      coarseMaskVisible = !detailedMaskReady;
      map.setLayoutProperty(GLOBAL_OCEAN_LAYER, "visibility", coarseMaskVisible ? "visible" : "none");
    }
    maskCovered ||= detailedMaskReady || map.isSourceLoaded(GLOBAL_OCEAN_SOURCE);
    setVisible(maskCovered);
  };
  /** Hand the mask over only once a changed condition has held for the fade.
   * Debounced in both directions: a regional tile the camera brings into view
   * clears `isSourceLoaded` for a few frames, and reacting to that immediately
   * pops the coarse 50 m coastline back over the settled 10 m one. A genuinely
   * slow regional fetch still outlasts the delay and gets covered.
   */
  const settleTo = (next: boolean) => {
    if (detailedMaskReady === next) {
      clearTimeout(timer);
      timer = undefined;
      return;
    }
    if (timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      detailedMaskReady = maskReady();
      showSafeSurface();
    }, MASK_SETTLE_MS);
  };
  const update = () => {
    // Translucent regional masks are never the sole barrier: cover immediately.
    if (!detailBlended()) {
      clearTimeout(timer);
      timer = undefined;
      detailedMaskReady = false;
    } else settleTo(maskReady());
    showSafeSurface();
  };
  const onSource = (event: MapSourceDataEvent) => {
    if (event.sourceId === REGIONAL_LAND_SOURCE || event.sourceId === GLOBAL_OCEAN_SOURCE) update();
  };
  map.on("zoom", update);
  map.on("sourcedata", onSource);
  // Streaming tiles never withdraw coverage, so `sourcedataloading` only feeds
  // the same debounced handover; it must not gate a layer on its own.
  map.on("sourcedataloading", onSource);
  update();

  return () => {
    clearTimeout(timer);
    map.off("zoom", update);
    map.off("sourcedata", onSource);
    map.off("sourcedataloading", onSource);
    if (map.getLayer(HILLSHADE_LAYER)) map.removeLayer(HILLSHADE_LAYER);
    if (map.getSource(HILLSHADE_SOURCE)) map.removeSource(HILLSHADE_SOURCE);
    if (map.getLayer(GLOBAL_OCEAN_LAYER)) map.removeLayer(GLOBAL_OCEAN_LAYER);
    if (map.getSource(GLOBAL_OCEAN_SOURCE)) map.removeSource(GLOBAL_OCEAN_SOURCE);
  };
}
