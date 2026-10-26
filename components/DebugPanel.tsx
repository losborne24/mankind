"use client";

import { useState } from "react";
import type { Map } from "maplibre-gl";
import {
  createGlobeStyle,
  DEFAULT_TERRAIN_EXAGGERATION,
  TERRAIN_EXAGGERATIONS,
  TERRAIN_SOURCE,
} from "@/map/mapStyle";

interface DebugPanelProps {
  map: Map | null;
  terrainWarning: boolean;
  onRetryTerrain: () => void;
}

/** Shared debug panel; add future map controls as separate fieldsets here. */
export function DebugPanel({ map, terrainWarning, onRetryTerrain }: DebugPanelProps) {
  const [exaggeration, setExaggeration] = useState(DEFAULT_TERRAIN_EXAGGERATION);
  const [diagnosticShading, setDiagnosticShading] = useState(false);

  return (
    <details open className="absolute top-16 left-4 z-20 w-56 rounded-lg border border-panel-border bg-panel p-3 text-xs text-white/70 backdrop-blur-md sm:left-6">
      <summary className="cursor-pointer tracking-wide">Debug tools</summary>
      <fieldset disabled={!map} className="disabled:opacity-50">
        <legend className="mt-3 text-white/40">Terrain</legend>
        <label className="mt-3 flex items-center justify-between gap-3">
          Elevation exaggeration
          <select
            aria-label="Elevation exaggeration"
            value={exaggeration}
            className="rounded border border-panel-border bg-background p-1 text-white"
            onChange={(event) => {
              const value = Number(event.target.value);
              map?.setTerrain({ source: TERRAIN_SOURCE, exaggeration: value });
              setExaggeration(value);
            }}
          >
            {TERRAIN_EXAGGERATIONS.map((value) => (
              <option key={value} value={value}>{value.toFixed(1)}×</option>
            ))}
          </select>
        </label>
        <p className="mt-2 text-white/40">Mapterhorn · physical elevation</p>
        <label className="mt-3 flex items-center gap-2">
          <input type="checkbox" checked={diagnosticShading} onChange={(event) => {
            if (!map?.getSource(TERRAIN_SOURCE)) return;
            const enabled = event.target.checked;
            // A separate, lazy DEM source preserves terrain sampling quality.
            if (enabled && !map.getLayer("terrain-diagnostic")) {
              map.addSource("elevation-diagnostic", {
                ...createGlobeStyle().sources[TERRAIN_SOURCE],
              });
              map.addLayer({
                id: "terrain-diagnostic", type: "hillshade", source: "elevation-diagnostic",
                paint: {
                  "hillshade-exaggeration": 0.25,
                  "hillshade-shadow-color": "#0a1622",
                  "hillshade-highlight-color": "#587083",
                  "hillshade-accent-color": "#122330",
                },
              }, "rivers");
            } else if (map.getLayer("terrain-diagnostic")) {
              map.setLayoutProperty("terrain-diagnostic", "visibility", enabled ? "visible" : "none");
            }
            setDiagnosticShading(enabled);
          }} />
          Hillshade
        </label>
      </fieldset>
      {terrainWarning && (
        <p role="status" className="mt-2 text-amber-200/80">
          Some elevation tiles could not load. Terrain may be incomplete.
          <button className="mt-2 block underline" onClick={onRetryTerrain}>Retry elevation tiles</button>
        </p>
      )}
    </details>
  );
}
