"use client";

/**
 * MapLibre globe lifecycle.
 *
 * Owns the `maplibregl.Map` instance, entirely on
 * the client. It creates the map once on mount, reports status (loading / ready
 * / error) upward, keeps the shared view state in sync, and tears everything
 * down on unmount. The MapLibre `Map` and the Three.js layer are runtime
 * objects and are kept out of the serializable store by design.
 */

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// MapLibre's internal worker resolution uses a runtime-computed filename that
// Turbopack cannot statically analyze. Pointing at the worker with a static
// `new URL(..., import.meta.url)` specifier lets the bundler emit it as an
// asset and rewrite the URL at build time.
maplibregl.setWorkerUrl(
  new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString(),
);

import {
  createGlobeStyle, viewToCamera,
  TERRAIN_SOURCE,
  TEST_MARKER_LNGLAT,
} from "@/map/mapStyle";
import { ThreeTestLayer } from "@/map/threeTestLayer";
import { DebugPanel } from "@/components/DebugPanel";
import { MapReadout } from "@/components/MapReadout";
import { queryTerrainHeights } from "@/map/terrain";
import { attachCoastlineDetail } from "@/map/coastlineDetail";
import { useExplorationStore } from "@/state/explorationStore";
import { BIOME_SOURCE } from "@/map/biomes";

export type GlobeStatus = "loading" | "ready" | "error";

interface GlobeViewProps {
  onStatus: (status: GlobeStatus, message?: string) => void;
}

export default function GlobeView({ onStatus }: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [debugMap, setDebugMap] = useState<maplibregl.Map | null>(null);
  const [terrainWarning, setTerrainWarning] = useState(false);
  // Keep the latest callback without re-running the init effect.
  const onStatusRef = useRef(onStatus);
  useEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const initialView = useExplorationStore.getState().view;
    let disposed = false;
    let ready = false;

    const map = new maplibregl.Map({
      container,
      style: createGlobeStyle(),
      ...viewToCamera(initialView),
      attributionControl: { compact: true },
      canvasContextAttributes: { antialias: true },
      // MapLibre already observes container resize (trackResize default true).
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.dragRotate.enable();
    const detachCoastlineDetail = attachCoastlineDetail(map);

    map.on("load", () => {
      if (disposed) return;
      map.addLayer(new ThreeTestLayer({ lngLat: TEST_MARKER_LNGLAT }));
      setDebugMap(map);
      ready = true;
      onStatusRef.current("ready");

      // Dev-only debug handle (stripped from production bundles) so tooling can
      // inspect the live map, e.g. project coordinates during integration tests.
      if (process.env.NODE_ENV === "development") {
        (window as unknown as { __globe?: unknown }).__globe = {
          map, queryTerrainHeights: (location: maplibregl.LngLatLike) => queryTerrainHeights(map, location),
        };
      }
    });

    // Surface only fatal startup failures (e.g. a local geography resource
    // being unavailable). Transient errors after the map is ready are ignored.
    map.on("error", (e: maplibregl.ErrorEvent) => {
      if (disposed) return;
      if ("sourceId" in e && e.sourceId === BIOME_SOURCE) return;
      // DEM is optional for navigation. MapLibre keeps loaded parent DEMs or
      // falls back to zero elevation for missing tiles; geography stays usable.
      if ("sourceId" in e && e.sourceId === TERRAIN_SOURCE) {
        setTerrainWarning(true);
        return;
      }
      if (ready) return;
      onStatusRef.current(
        "error",
        e.error?.message ?? "A map resource failed to load.",
      );
    });

    // One-way camera sync: mirror the user's navigation into shared state so
    // other features can react, without feeding changes back into the map.
    const syncView = () => {
      if (disposed) return;
      const c = map.getCenter();
      useExplorationStore.getState().setView({
        center: [c.lng, c.lat],
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      });
    };
    map.on("moveend", syncView);

    return () => {
      disposed = true;
      detachCoastlineDetail();
      map.off("moveend", syncView);
      if (process.env.NODE_ENV === "development") {
        delete (window as unknown as { __globe?: unknown }).__globe;
      }
      map.remove();
    };
  }, []);

  // Size with h-full/w-full rather than absolute inset-0: MapLibre's stylesheet
  // sets `.maplibregl-map { position: relative }`, which would override an
  // `absolute` class and collapse the container's height to 0.
  return (
    <>
      <div ref={containerRef} className="h-full w-full" aria-hidden />
      <MapReadout map={debugMap} />
      <DebugPanel
        map={debugMap}
        terrainWarning={terrainWarning}
        onRetryTerrain={() => {
          setTerrainWarning(false);
          debugMap?.refreshTiles(TERRAIN_SOURCE);
        }}
      />
    </>
  );
}
