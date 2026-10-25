/**
 * Terrain debug control (TEMPORARY).
 *
 * A small, self-contained MapLibre control for tuning the Phase-2 3D terrain by
 * eye: a 2D/3D toggle and an exaggeration slider, applied live. It is a plain
 * `IControl` (no React plumbing) added by {@link ../components/GlobeView}, so it
 * can be removed in one line once the terrain look is locked.
 *
 * It does not own the terrain — GlobeView turns terrain on at load. The control
 * reads the current `map.getTerrain()` on add and writes back through the same
 * `map.setTerrain(...)` API, so removing the control leaves terrain exactly as
 * it was.
 */

import type { ControlPosition, IControl, Map as MaplibreMap } from "maplibre-gl";
import { TERRAIN_IDS } from "./terrain";

/** Slider bounds for the exaggeration control. */
const MIN_EXAGGERATION = 0;
const MAX_EXAGGERATION = 3;
const STEP = 0.1;

export class TerrainDebugControl implements IControl {
  private map?: MaplibreMap;
  private container?: HTMLDivElement;
  private enabled = true;
  private exaggeration = 1.5;

  getDefaultPosition(): ControlPosition {
    return "bottom-left";
  }

  onAdd(map: MaplibreMap): HTMLElement {
    this.map = map;

    // Adopt the terrain state GlobeView already applied, so the UI reflects
    // reality and we never fight it.
    const current = map.getTerrain();
    if (current) {
      this.enabled = true;
      this.exaggeration = current.exaggeration ?? this.exaggeration;
    } else {
      this.enabled = false;
    }

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
      "min-width:150px",
      "user-select:none",
    ].join(";");
    // Clicks on the panel must not fall through to map drag/zoom.
    el.addEventListener("mousedown", (e) => e.stopPropagation());
    el.addEventListener("dblclick", (e) => e.stopPropagation());

    const title = document.createElement("div");
    title.textContent = "TERRAIN (debug)";
    title.style.cssText =
      "font-size:9px;letter-spacing:0.14em;opacity:0.6;margin-bottom:6px";
    el.appendChild(title);

    // ── 2D / 3D toggle ──
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.style.cssText = [
      "width:100%",
      "padding:4px 6px",
      "margin-bottom:8px",
      "background:rgba(255,255,255,0.06)",
      "border:1px solid rgba(120,150,175,0.3)",
      "border-radius:5px",
      "color:#e7eef4",
      "cursor:pointer",
      "font:inherit",
    ].join(";");
    const renderToggle = () => {
      toggle.textContent = this.enabled ? "● 3D terrain — ON" : "○ 3D terrain — OFF";
    };
    toggle.addEventListener("click", () => {
      this.enabled = !this.enabled;
      renderToggle();
      this.apply();
    });
    renderToggle();
    el.appendChild(toggle);

    // ── exaggeration slider ──
    const row = document.createElement("label");
    row.style.cssText = "display:flex;align-items:center;gap:7px";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = String(MIN_EXAGGERATION);
    slider.max = String(MAX_EXAGGERATION);
    slider.step = String(STEP);
    slider.value = String(this.exaggeration);
    slider.style.cssText = "flex:1;min-width:0;accent-color:#e8b84b;cursor:pointer";

    const readout = document.createElement("span");
    readout.style.cssText = "width:30px;text-align:right;font-variant-numeric:tabular-nums";
    readout.textContent = this.exaggeration.toFixed(1) + "×";

    slider.addEventListener("input", () => {
      this.exaggeration = Number(slider.value);
      readout.textContent = this.exaggeration.toFixed(1) + "×";
      // Moving the slider implies you want to see terrain.
      if (!this.enabled) {
        this.enabled = true;
        renderToggle();
      }
      this.apply();
    });

    row.appendChild(slider);
    row.appendChild(readout);
    el.appendChild(row);

    this.container = el;
    return el;
  }

  onRemove(): void {
    this.container?.remove();
    this.container = undefined;
    this.map = undefined;
  }

  /** Push the current state into MapLibre (the single place that calls setTerrain). */
  private apply(): void {
    const map = this.map;
    if (!map) return;
    if (this.enabled) {
      map.setTerrain({ source: TERRAIN_IDS.dem, exaggeration: this.exaggeration });
    } else {
      map.setTerrain(null);
    }
  }
}
