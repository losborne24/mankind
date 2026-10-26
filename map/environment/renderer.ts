import type { Map as MapLibreMap } from "maplibre-gl";
import type { EnvironmentState, EnvironmentClass } from "./model";
import styles from "./styles.json";
import { GroundMaterialLayer, PBR_LAYER_ID } from "../surface/groundLayer";
import { naturalSurfaceProvider, resolveSurfaceProvider, type NaturalSurfaceProvider, type SurfaceMode } from "../surface/provider";

export const FIRST_ENVIRONMENT_LAYER = "environment-forest";
const escapeText = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/**
 * Native raster fallback plus an optional cached PBR terrain-tile pass.
 * With setTerrain active, MapLibre's RenderToTexture composites them with the
 * land/relief/hillshade and draws that texture on the existing DEM terrain mesh.
 * Keep them below relief (the `before` slot) and the Natural Earth ocean masks:
 * materials and illumination change without replacing terrain geometry.
 * Only environment sources change. Never setStyle/setTerrain or recreate the map.
 */
export class EnvironmentRenderer {
  private active?: EnvironmentState;
  private reference?: EnvironmentState;
  private ground?: GroundMaterialLayer;
  private pbrEnabled = true;
  private materialAssetsUnavailable = false;
  private hidden = new Set<EnvironmentClass>();
  private resolveSurfaceVisible = true;
  constructor(private map: MapLibreMap, private before: string, private provider: NaturalSurfaceProvider = resolveSurfaceProvider, private usePbr = false) {}

  isPbrEnabled(): boolean { return this.pbrEnabled; }
  setPbrEnabled(enabled: boolean): void { this.pbrEnabled = enabled; this.ground?.setEnabled(enabled); }
  getMaterialStats() { return this.ground?.stats; }

  getSurfaceMode(): SurfaceMode { return this.provider.mode; }

  /** Missing optional material assets must keep the working reference renderer. */
  handleSourceError(sourceId: string): boolean {
    if (!this.active?.layers.some(layer => layer.surface && layer.id === sourceId && layer.classification !== 'water')) return false;
    this.materialAssetsUnavailable = true;
    this.provider = resolveSurfaceProvider;
    if (this.reference) this.setState(this.reference);
    return true;
  }

  setSurfaceMode(mode: SurfaceMode): void {
    if (mode === this.provider.mode) return;
    this.provider = mode === 'natural' ? naturalSurfaceProvider : resolveSurfaceProvider;
    this.materialAssetsUnavailable = false;
    if (this.reference) this.setState(this.reference);
  }

  setState(reference: EnvironmentState): void {
    this.reference = reference;
    // In the live PBR renderer both debug modes share one material surface.
    // RESOLVE remains ecological input, not a second palette that flashes on load.
    const adapter = this.usePbr && !this.materialAssetsUnavailable ? naturalSurfaceProvider : this.provider;
    const state = adapter.adapt(reference);
    // Timeline playback must not re-upload identical textures.
    if (state.id === this.active?.id) return;
    if (this.ground && this.map.getLayer(PBR_LAYER_ID)) this.map.removeLayer(PBR_LAYER_ID);
    this.ground = undefined;
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
        type: "raster", tiles: [this.usePbr ? layer.surface?.fallbackTileTemplate ?? geo.tileTemplate : geo.tileTemplate], tileSize: geo.tileSize,
        minzoom: geo.minzoom, maxzoom: geo.maxzoom,
        attribution: escapeText(`${layer.provenance.dataset} · ${layer.provenance.licence} · ${layer.provenance.temporalBasis}`),
      });
      this.map.addLayer({
        id: layer.id, type: "raster", source: layer.id,
        paint: { "raster-opacity": !!layer.surface && layer.classification !== "water" ? 1 : styles[layer.style].opacity, "raster-fade-duration": 200, "raster-resampling": "linear" },
        layout: { visibility: this.isVisible(layer.classification) ? "visible" : "none" },
      }, this.before);
    }
    this.active = state;
    if (this.usePbr && state.layers.some(layer => layer.surface)) {
      const inputs = state.layers.flatMap(layer => {
        if (!layer.surface || layer.geography.kind !== 'raster') return [];
        return [{ ...layer.surface, classification: layer.classification, template: layer.geography.tileTemplate, maxzoom: layer.geography.maxzoom }];
      });
      this.ground = new GroundMaterialLayer(inputs, (message) => console.warn(message));
      this.ground.setEnabled(this.pbrEnabled);
      for (const input of inputs) this.ground.setVisible(input.classification, this.isVisible(input.classification));
      this.map.addLayer(this.ground, state.layers.find(layer => layer.classification === 'water')?.id ?? this.before);
    }
  }

  setVisible(classification: EnvironmentClass, visible: boolean): void {
    if (visible) this.hidden.delete(classification); else this.hidden.add(classification);
    this.ground?.setVisible(classification, this.isVisible(classification));
    for (const layer of this.active?.layers ?? []) {
      if (layer.classification === classification && this.map.getLayer(layer.id))
        this.map.setLayoutProperty(layer.id, "visibility", this.isVisible(classification) ? "visible" : "none");
    }
  }

  isResolveSurfaceVisible(): boolean {
    return this.resolveSurfaceVisible;
  }

  /** Toggle the biome surface while preserving individual choices and hydrography. */
  setResolveSurfaceVisible(visible: boolean): void {
    this.resolveSurfaceVisible = visible;
    for (const layer of this.active?.layers ?? []) this.ground?.setVisible(layer.classification, this.isVisible(layer.classification));
    for (const layer of this.active?.layers ?? []) {
      if (layer.classification !== "water" && this.map.getLayer(layer.id))
        this.map.setLayoutProperty(layer.id, "visibility", this.isVisible(layer.classification) ? "visible" : "none");
    }
  }

  private isVisible(classification: EnvironmentClass): boolean {
    return !this.hidden.has(classification) && (classification === "water" || this.resolveSurfaceVisible);
  }
}
