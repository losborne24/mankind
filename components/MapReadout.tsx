"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Map } from "maplibre-gl";
import { COAST_DETAIL_STATE, TERRAIN_SOURCE } from "@/map/mapStyle";
import { BIOME_SOURCE } from "@/map/biomes";
import { HILLSHADE_SOURCE } from "@/map/hillshade";

/** Native tile zoom MapLibre requests at screen centre; "↑" once it overzooms past maxzoom. */
function tileZoom(map: Map, id: string, forTerrain = false): string {
  const source = map.getSource(id);
  if (!source) return "–";
  // MapLibre's zoom scale assumes 512 px tiles; raster sources round. The terrain
  // mesh treats its source as double-size tiles and floors, so it runs coarser.
  const tileSize = forTerrain ? source.tileSize * 2 : source.tileSize;
  const round = !forTerrain && source.roundZoom ? Math.round : Math.floor;
  const ideal = round(map.getZoom() + Math.log2(512 / tileSize));
  return ideal > source.maxzoom ? `z${source.maxzoom}↑` : `z${Math.max(0, ideal)}`;
}

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
    return `Zoom ${map.getZoom().toFixed(2)} · Coast LOD ${lod} · Biome ${tileZoom(map, BIOME_SOURCE)} · Hillshade ${tileZoom(map, HILLSHADE_SOURCE)} · Mesh ${map.getTerrain() ? tileZoom(map, TERRAIN_SOURCE, true) : "off"}`;
  }, [map]);

  const readout = useSyncExternalStore(subscribe, getSnapshot, () => "");
  // Tile/LOD diagnostics are a development aid, not part of the product view.
  if (!readout || process.env.NODE_ENV !== "development") return null;

  return (
    <div className="pointer-events-none absolute bottom-44 left-3 z-10 rounded-md border border-panel-border bg-panel px-3 py-2 font-mono text-[11px] tabular-nums text-white/60 backdrop-blur-md sm:bottom-32 sm:left-6">
      {readout}
    </div>
  );
}
