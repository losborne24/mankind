import type { Map } from "maplibre-gl";
import { COAST_DETAIL_STATE, REGIONAL_LAND_SOURCE } from "./mapStyle";

/** Prefetch at z4, blend through z4.5–5.5 once visible detail tiles are ready. */
export function attachCoastlineDetail(map: Map): () => void {
  let opacity = 0;
  const update = () => {
    if (!map.getSource(REGIONAL_LAND_SOURCE)) return;
    const target = Math.max(0, Math.min(1, map.getZoom() - 4.5));
    if (target === opacity) return;
    // Keep the coarse base during a slow first fetch.
    // Zooming out never waits for regional data. Paint transitions also cover
    // direct camera jumps/restored regional views, independently of zoom speed.
    if (target > opacity && !map.isSourceLoaded(REGIONAL_LAND_SOURCE)) return;
    opacity = target;
    map.setGlobalStateProperty(COAST_DETAIL_STATE, target);
  };
  map.on("zoom", update);
  map.on("sourcedata", update);
  map.on("style.load", update);
  return () => {
    map.off("zoom", update);
    map.off("sourcedata", update);
    map.off("style.load", update);
  };
}
