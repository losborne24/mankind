import type { Map, MapSourceDataEvent } from "maplibre-gl";
import { COAST_DETAIL_STATE, REGIONAL_LAND_SOURCE, TERRAIN_SOURCE, createGlobeStyle } from "./mapStyle";

const HILLSHADE_SOURCE = "elevation-diagnostic";
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
  const maskReady = () => map.getGlobalState()[COAST_DETAIL_STATE] === 1 &&
    map.isSourceLoaded(REGIONAL_LAND_SOURCE);
  let coarseMaskVisible = true;
  const showSafeSurface = () => {
    if (coarseMaskVisible === detailedMaskReady) {
      coarseMaskVisible = !detailedMaskReady;
      map.setLayoutProperty(GLOBAL_OCEAN_LAYER, "visibility", coarseMaskVisible ? "visible" : "none");
    }
    setVisible(detailedMaskReady || map.isSourceLoaded(GLOBAL_OCEAN_SOURCE));
  };
  const update = () => {
    if (!maskReady()) {
      clearTimeout(timer);
      timer = undefined;
      detailedMaskReady = false;
    } else if (!detailedMaskReady && timer === undefined) {
      timer = setTimeout(() => {
        timer = undefined;
        detailedMaskReady = maskReady();
        showSafeSurface();
      }, MASK_SETTLE_MS);
    }
    showSafeSurface();
  };
  const onSource = (event: MapSourceDataEvent) => {
    if (event.sourceId === REGIONAL_LAND_SOURCE || event.sourceId === GLOBAL_OCEAN_SOURCE) update();
  };
  const onLoading = (event: MapSourceDataEvent) => {
    if (event.sourceId === GLOBAL_OCEAN_SOURCE) {
      if (!detailedMaskReady) setVisible(false);
      return;
    }
    if (event.sourceId !== REGIONAL_LAND_SOURCE) return;
    clearTimeout(timer);
    timer = undefined;
    detailedMaskReady = false;
    showSafeSurface();
  };
  map.on("zoom", update);
  map.on("sourcedata", onSource);
  map.on("sourcedataloading", onLoading);
  update();

  return () => {
    clearTimeout(timer);
    map.off("zoom", update);
    map.off("sourcedata", onSource);
    map.off("sourcedataloading", onLoading);
    if (map.getLayer(HILLSHADE_LAYER)) map.removeLayer(HILLSHADE_LAYER);
    if (map.getSource(HILLSHADE_SOURCE)) map.removeSource(HILLSHADE_SOURCE);
    if (map.getLayer(GLOBAL_OCEAN_LAYER)) map.removeLayer(GLOBAL_OCEAN_LAYER);
    if (map.getSource(GLOBAL_OCEAN_SOURCE)) map.removeSource(GLOBAL_OCEAN_SOURCE);
  };
}
