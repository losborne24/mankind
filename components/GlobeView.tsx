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

import { createGlobeStyle, viewToCamera } from "@/map/mapStyle";
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

    map.on("load", () => {
      if (disposed) return;
      try {
        worldLayer = new WorldLayer({
          scene: DEMO_SCENE,
          year: useExplorationStore.getState().year,
        });
        map.addLayer(worldLayer);
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
