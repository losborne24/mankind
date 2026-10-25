/**
 * Debug control (TEMPORARY).
 *
 * A small, self-contained MapLibre control for inspecting the three rendering
 * systems that make up the world by toggling each one live, independently:
 *
 *   • three.js      — the living-world custom layer (settlements, groves, ship).
 *   • Natural Earth — the self-hosted vector land + ocean polygons.
 *   • Terrarium DEM — the stylised relief (color-relief + hillshade).
 *   • Elevation     — real 3D terrain fed by the same bundled DEM.
 *
 * Everything already coexists in one running map and one bundle; each toggle
 * just flips what is *drawn* (layer `visibility` / `setTerrain`), so you can
 * compare any combination instantly without a reload or a rebuild. The terrain
 * exaggeration is now locked at {@link TERRAIN_EXAGGERATION}, so there is no
 * live tuning slider — just the four on/off toggles.
 *
 * It is a plain `IControl` (no React plumbing) added by
 * {@link ../components/GlobeView}, so it can be removed in one line once the
 * look is locked. It does not own any of the three systems — GlobeView sets
 * them up at load; the control reads the live state on add and writes back
 * through the same public APIs, so removing it leaves the map exactly as it was.
 */

import type { ControlPosition, IControl, Map as MaplibreMap } from "maplibre-gl";
import { GEO_IDS } from "./mapStyle";
import { TERRAIN_IDS } from "./terrain";

/** Locked 3D terrain exaggeration, re-applied whenever elevation is toggled on. */
const TERRAIN_EXAGGERATION = 1.5;

/** Default id of the three.js custom layer (see {@link ../map/worldLayer}). */
const DEFAULT_WORLD_LAYER_ID = "world-layer";

/** Vector layers that make up the Natural Earth geography (both scales). */
const NATURAL_EARTH_LAYERS = [
  GEO_IDS.landFill50,
  GEO_IDS.landFill10,
  GEO_IDS.coast50,
  GEO_IDS.coast10,
  GEO_IDS.oceanFill50,
  GEO_IDS.oceanFill10,
];

/** Draped stylising layers fed by the DEM (the terrain's 2D half). */
const DEM_LAYERS = [TERRAIN_IDS.relief, TERRAIN_IDS.hillshade];

export interface DebugControlOptions {
  /** Id the WorldLayer was added with. Defaults to `"world-layer"`. */
  worldLayerId?: string;
}

export class DebugControl implements IControl {
  private map?: MaplibreMap;
  private container?: HTMLDivElement;

  private readonly worldLayerId: string;

  private threeOn = true;
  private naturalEarthOn = true;
  private demOn = true;
  private elevationOn = true;

  constructor(options: DebugControlOptions = {}) {
    this.worldLayerId = options.worldLayerId ?? DEFAULT_WORLD_LAYER_ID;
  }

  getDefaultPosition(): ControlPosition {
    return "bottom-left";
  }

  onAdd(map: MaplibreMap): HTMLElement {
    this.map = map;

    // Adopt the live state GlobeView already applied, so the UI reflects
    // reality and we never fight it.
    this.threeOn = this.isLayerVisible(this.worldLayerId);
    this.naturalEarthOn = NATURAL_EARTH_LAYERS.some((id) => this.isLayerVisible(id));
    this.demOn = DEM_LAYERS.some((id) => this.isLayerVisible(id));
    this.elevationOn = !!map.getTerrain();

    const el = document.createElement("div");
    el.className = "maplibregl-ctrl maplibregl-ctrl-group";
    // Lift clear of the bottom-left compass badge and the timeline.
    el.style.cssText = [
      "margin-bottom:96px",
      "padding:8px 10px",
      "background:rgba(10,18,28,0.82)",
      "backdrop-filter:blur(6px)",
      "border:1px solid rgba(120,150,175,0.25)",
      "border-radius:8px",
      "color:#cdd8e2",
      "font:11px/1.4 ui-sans-serif,system-ui,sans-serif",
      "letter-spacing:0.02em",
      "min-width:160px",
      "user-select:none",
    ].join(";");
    // Clicks on the panel must not fall through to map drag/zoom.
    el.addEventListener("mousedown", (e) => e.stopPropagation());
    el.addEventListener("dblclick", (e) => e.stopPropagation());

    const title = document.createElement("div");
    title.textContent = "LAYERS (debug)";
    title.style.cssText =
      "font-size:9px;letter-spacing:0.14em;opacity:0.6;margin-bottom:6px";
    el.appendChild(title);

    // ── three.js ──
    el.appendChild(
      this.buildToggle("three.js", () => this.threeOn, (next) => {
        this.threeOn = next;
        this.applyThree();
      }),
    );

    // ── Natural Earth ──
    el.appendChild(
      this.buildToggle("Natural Earth", () => this.naturalEarthOn, (next) => {
        this.naturalEarthOn = next;
        this.applyNaturalEarth();
      }),
    );

    // ── Terrarium DEM (relief + hillshade) ──
    el.appendChild(
      this.buildToggle("Terrarium DEM", () => this.demOn, (next) => {
        this.demOn = next;
        this.applyDem();
      }),
    );

    // ── Elevation (3D terrain) ──
    el.appendChild(
      this.buildToggle("Elevation", () => this.elevationOn, (next) => {
        this.elevationOn = next;
        this.applyElevation();
      }),
    );

    this.container = el;
    return el;
  }

  onRemove(): void {
    this.container?.remove();
    this.container = undefined;
    this.map = undefined;
  }

  /** Build one on/off toggle button wired to a getter/setter. */
  private buildToggle(
    label: string,
    get: () => boolean,
    set: (next: boolean) => void,
  ): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.style.cssText = [
      "width:100%",
      "padding:4px 6px",
      "margin-bottom:6px",
      "display:flex",
      "justify-content:space-between",
      "gap:8px",
      "background:rgba(255,255,255,0.06)",
      "border:1px solid rgba(120,150,175,0.3)",
      "border-radius:5px",
      "color:#e7eef4",
      "cursor:pointer",
      "font:inherit",
      "text-align:left",
    ].join(";");
    const render = () => {
      const on = get();
      btn.setAttribute("aria-pressed", String(on));
      btn.innerHTML = "";
      const name = document.createElement("span");
      name.textContent = label;
      const state = document.createElement("span");
      state.textContent = on ? "● ON" : "○ OFF";
      state.style.opacity = on ? "1" : "0.55";
      btn.appendChild(name);
      btn.appendChild(state);
    };
    btn.addEventListener("click", () => {
      set(!get());
      render();
    });
    render();
    return btn;
  }

  // ── apply helpers: the only places that touch MapLibre ──────────────────────

  private isLayerVisible(id: string): boolean {
    const map = this.map;
    if (!map || !map.getLayer(id)) return false;
    // `visibility` defaults to "visible" when unset.
    return map.getLayoutProperty(id, "visibility") !== "none";
  }

  private setLayerVisible(id: string, visible: boolean): void {
    const map = this.map;
    if (!map || !map.getLayer(id)) return;
    map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  }

  /** three.js — toggle the custom layer. MapLibre skips `render()` when hidden. */
  private applyThree(): void {
    this.setLayerVisible(this.worldLayerId, this.threeOn);
  }

  /** Natural Earth — toggle every vector land/ocean fill that currently exists. */
  private applyNaturalEarth(): void {
    for (const id of NATURAL_EARTH_LAYERS) this.setLayerVisible(id, this.naturalEarthOn);
  }

  /** Terrarium DEM — toggle the draped relief layers independently of height. */
  private applyDem(): void {
    for (const id of DEM_LAYERS) this.setLayerVisible(id, this.demOn);
  }

  /** Elevation — toggle real 3D terrain independently of the draped relief. */
  private applyElevation(): void {
    const map = this.map;
    if (!map) return;
    if (this.elevationOn) {
      map.setTerrain({ source: TERRAIN_IDS.dem, exaggeration: TERRAIN_EXAGGERATION });
    } else {
      map.setTerrain(null);
    }
  }
}
