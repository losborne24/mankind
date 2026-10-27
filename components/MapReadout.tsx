"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Map } from "maplibre-gl";
import { COAST_DETAIL_STATE } from "@/map/mapStyle";

/** Read the active coastline blend, including delays while detail tiles load. */
export function MapReadout({ map }: { map: Map | null }) {
  const subscribe = useCallback((onChange: () => void) => {
    if (!map) return () => {};
    map.on("render", onChange);
    return () => { map.off("render", onChange); };
  }, [map]);

  const getSnapshot = useCallback(() => {
    if (!map) return "";
    const detail = Number(map.getGlobalState()[COAST_DETAIL_STATE] ?? 0);
    const lod = detail <= 0 ? "Base" : detail >= 1 ? "Regional" : `Blend ${Math.round(detail * 100)}%`;
    return `Zoom ${map.getZoom().toFixed(2)} · Coast LOD ${lod}`;
  }, [map]);

  const readout = useSyncExternalStore(subscribe, getSnapshot, () => "");
  if (!readout) return null;

  return (
    <div className="pointer-events-none absolute bottom-44 left-3 z-10 rounded-md border border-panel-border bg-panel px-3 py-2 font-mono text-[11px] tabular-nums text-white/60 backdrop-blur-md sm:bottom-32 sm:left-6">
      {readout}
    </div>
  );
}
