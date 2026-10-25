"use client";

/**
 * MapLibre globe lifecycle.
 *
 * Owns the `maplibregl.Map` instance and the Three.js custom layer, entirely on
 * the client. It creates the map once on mount, reports status (loading / ready
 * / error) upward, keeps the shared view state in sync, and tears everything
 * down on unmount. The MapLibre `Map` and the Three.js layer are runtime
 * objects and are kept out of the serializable store by design.
 */

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// MapLibre's internal worker resolution uses a runtime-computed filename that
// Turbopack cannot statically analyze. Pointing at the worker with a static
// `new URL(..., import.meta.url)` specifier lets the bundler emit it as an
// asset and rewrite the URL at build time.
maplibregl.setWorkerUrl(
  new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString(),
);

import { createGlobeStyle, viewToCamera, GEO_IDS, palette } from "@/map/mapStyle";
import { CoastlineLayer } from "@/map/coastlineLayer";
import { watchRegionalGeo } from "@/map/regionalGeo";
import { TERRAIN_IDS } from "@/map/terrain";
import { DebugControl } from "@/map/debugControl";
import { WorldLayer } from "@/map/worldLayer";
import { DEMO_SCENE } from "@/scene/demoScene";
import { useExplorationStore } from "@/state/explorationStore";

export type GlobeStatus = "loading" | "ready" | "error";

interface GlobeViewProps {
  onStatus: (status: GlobeStatus, message?: string) => void;
}

export default function GlobeView({ onStatus }: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
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
    let worldLayer: WorldLayer | null = null;
    let unsubscribeYear: (() => void) | null = null;
    let stopRegionalGeo: (() => void) | null = null;

    const map = new maplibregl.Map({
      container,
      style: createGlobeStyle(),
      ...viewToCamera(initialView),
      attributionControl: { compact: true },
      canvasContextAttributes: { antialias: true },
      // Allow a steep near-horizon tilt so the 3D terrain reads as raised
      // landforms. Kept below MapLibre's 85° ceiling for rendering stability
      // (very low grazing angles stress the terrain mesh and depth buffer).
      maxPitch: 70,
      // MapLibre already observes container resize (trackResize default true).
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.dragRotate.enable();

    map.on("load", () => {
      if (disposed) return;
      // Lazily fetch the finer (1:10 m) land once the camera zooms into a
      // regional view; a continental-only session never downloads it.
      map.addLayer(new CoastlineLayer(GEO_IDS.coast50, GEO_IDS.land50, palette.coastline));
      stopRegionalGeo = watchRegionalGeo(map);

      // Raise the land into real 3D using the same self-hosted DEM that already
      // drives the colour-relief and hillshade. The DEM's ocean is clamped to a
      // flat sea level (see scripts/fetch-dem.mjs), so water stays flat and the
      // coast has no bathymetry cliff.
      map.setTerrain({ source: TERRAIN_IDS.dem, exaggeration: 1.5 });

      try {
        worldLayer = new WorldLayer({
          scene: DEMO_SCENE,
          year: useExplorationStore.getState().year,
        });
        map.addLayer(worldLayer);
        // Temporary debug control: toggle three.js, Natural Earth, Terrarium
        // DEM shading, and 3D elevation independently. Added after the world
        // layer so it reads three.js as on.
        // It reads the live state on add and is removable in one line.
        map.addControl(new DebugControl({ worldLayerId: worldLayer.id }), "bottom-left");
        // Feed historical-year changes into the renderer (it decides visibility,
        // not the store). Subscribing to a single slice avoids extra work.
        unsubscribeYear = useExplorationStore.subscribe((state, prev) => {
          if (state.year !== prev.year) worldLayer?.setYear(state.year);
        });
      } catch (err) {
        onStatusRef.current(
          "error",
          err instanceof Error ? err.message : "Failed to initialize 3D layer.",
        );
        return;
      }
      ready = true;
      onStatusRef.current("ready");

      // Dev-only debug handle (stripped from production bundles) so tooling can
      // inspect the live map, e.g. project coordinates during integration tests.
      if (process.env.NODE_ENV === "development") {
        (window as unknown as { __globe?: { map: maplibregl.Map } }).__globe = {
          map,
        };
      }
    });

    // Surface only fatal startup failures (e.g. the demo style/tiles endpoint
    // being unreachable). Transient errors after the map is ready are ignored.
    map.on("error", (e: maplibregl.ErrorEvent) => {
      if (disposed || ready) return;
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
      unsubscribeYear?.();
      stopRegionalGeo?.();
      map.off("moveend", syncView);
      // map.remove() triggers the layer's onRemove(), disposing Three resources.
      map.remove();
    };
  }, []);

  // Size with h-full/w-full rather than absolute inset-0: MapLibre's stylesheet
  // sets `.maplibregl-map { position: relative }`, which would override an
  // `absolute` class and collapse the container's height to 0.
  return <div ref={containerRef} className="h-full w-full" aria-hidden />;
}
