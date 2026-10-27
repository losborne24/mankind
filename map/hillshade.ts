import type { Map, MapSourceDataEvent } from "maplibre-gl";
import { COAST_DETAIL_STATE, REGIONAL_LAND_SOURCE, TERRAIN_SOURCE, createGlobeStyle } from "./mapStyle";

const HILLSHADE_SOURCE = "elevation-diagnostic";
const HILLSHADE_LAYER = "terrain-diagnostic";
const MIN_ZOOM = 6;
// Match the geography paint transition before exposing the shaded surface.
const MASK_SETTLE_MS = 300;

/** Regional diagnostic shading, covered by the existing opaque ocean mask. */
export function attachDiagnosticHillshade(map: Map, intensity = 0.25): () => void {
  map.addSource(HILLSHADE_SOURCE, { ...createGlobeStyle().sources[TERRAIN_SOURCE] });
  map.addLayer({
    id: HILLSHADE_LAYER,
    type: "hillshade",
    source: HILLSHADE_SOURCE,
    minzoom: MIN_ZOOM,
    layout: { visibility: "none" },
    paint: {
      "hillshade-exaggeration": intensity,
      "hillshade-illumination-direction": 315,
      "hillshade-illumination-anchor": "map",
      "hillshade-shadow-color": "rgba(46, 49, 43, 0.65)",
      "hillshade-highlight-color": "rgba(239, 229, 207, 0.55)",
      "hillshade-accent-color": "rgba(71, 65, 53, 0.45)",
    },
  }, "regional-ocean");

  let timer: ReturnType<typeof setTimeout> | undefined;
  let visible = false;
  const setVisible = (next: boolean) => {
    if (visible === next) return;
    visible = next;
    map.setLayoutProperty(HILLSHADE_LAYER, "visibility", next ? "visible" : "none");
  };
  const maskReady = () => map.getZoom() >= MIN_ZOOM &&
    map.getGlobalState()[COAST_DETAIL_STATE] === 1 &&
    map.isSourceLoaded(REGIONAL_LAND_SOURCE);
  const update = () => {
    if (!maskReady()) {
      clearTimeout(timer);
      timer = undefined;
      setVisible(false);
    } else if (!visible && timer === undefined) {
      timer = setTimeout(() => {
        timer = undefined;
        setVisible(maskReady());
      }, MASK_SETTLE_MS);
    }
  };
  const onSource = (event: MapSourceDataEvent) => {
    if (event.sourceId === REGIONAL_LAND_SOURCE) update();
  };
  const onLoading = (event: MapSourceDataEvent) => {
    if (event.sourceId !== REGIONAL_LAND_SOURCE) return;
    clearTimeout(timer);
    timer = undefined;
    setVisible(false);
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
  };
}
