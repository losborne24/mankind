import type { Map as MapLibreMap } from "maplibre-gl";
import type { EnvironmentState, EnvironmentClass } from "./model";
import styles from "./styles.json";

export const FIRST_ENVIRONMENT_LAYER = "environment-forest";
const escapeText = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** Only environment sources change. Never setStyle/setTerrain or recreate the map. */
export class EnvironmentRenderer {
  private active?: EnvironmentState;
  private hidden = new Set<EnvironmentClass>();
  constructor(private map: MapLibreMap, private before: string) {}

  setState(state: EnvironmentState): void {
    // Timeline playback must not re-upload identical textures.
    if (state.id === this.active?.id) return;
    for (const previous of this.active?.layers ?? []) {
      if (this.map.getLayer(previous.id)) {
        this.map.removeLayer(previous.id);
        this.map.removeSource(previous.id);
      }
    }
    for (const layer of state.layers) {
      const geo = layer.geography;
      if (geo.kind !== "raster") continue; // Future vector adapter uses the same record.
      this.map.addSource(layer.id, {
        type: "raster", tiles: [geo.tileTemplate], tileSize: geo.tileSize,
        minzoom: geo.minzoom, maxzoom: geo.maxzoom,
        attribution: escapeText(`${layer.provenance.dataset} · ${layer.provenance.licence} · ${layer.provenance.temporalBasis}`),
      });
      this.map.addLayer({
        id: layer.id, type: "raster", source: layer.id,
        paint: { "raster-opacity": styles[layer.style].opacity, "raster-fade-duration": 200, "raster-resampling": "linear" },
        layout: { visibility: this.hidden.has(layer.classification) ? "none" : "visible" },
      }, this.before);
    }
    this.active = state;
  }

  setVisible(classification: EnvironmentClass, visible: boolean): void {
    if (visible) this.hidden.delete(classification); else this.hidden.add(classification);
    for (const layer of this.active?.layers ?? []) {
      if (layer.classification === classification && this.map.getLayer(layer.id))
        this.map.setLayoutProperty(layer.id, "visibility", visible ? "visible" : "none");
    }
  }
}
