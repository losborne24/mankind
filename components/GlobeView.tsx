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

// MapLibre resolves its worker from a runtime-computed filename relative to its
// own module URL, which Turbopack cannot emit — so we serve the worker as a
// static asset (see scripts/sync-maplibre-worker.mjs) and point MapLibre at it.
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

import { createGlobeStyle, TEST_MARKER_LNGLAT, viewToCamera } from "@/map/mapStyle";
import { ThreeTestLayer } from "@/map/threeTestLayer";
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
        map.addLayer(new ThreeTestLayer({ lngLat: TEST_MARKER_LNGLAT }));
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
      map.off("moveend", syncView);
      map.remove();
    };
  }, []);

  // Size with h-full/w-full rather than absolute inset-0: MapLibre's stylesheet
  // sets `.maplibregl-map { position: relative }`, which would override an
  // `absolute` class and collapse the container's height to 0.
  return <div ref={containerRef} className="h-full w-full" aria-hidden />;
}
