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
import { ThreeTestLayer, type StreamingStatus, type RomanTestStatus } from "@/map/threeTestLayer";
import type { SettlementStatus } from "@/map/settlements/SettlementScene";
import type { GenerationResult } from "@/map/settlements/proceduralSettlement";
import { ROMAN_SETTLEMENT } from "@/map/settlements/romanSettlement";
import { HistoricalWorldSession } from "@/components/HistoricalDatasetControls";
import { ScenarioPanel } from "@/components/ScenarioPanel";
import { DebugPanel } from "@/components/DebugPanel";
import { MapReadout } from "@/components/MapReadout";
import { queryTerrainHeights } from "@/map/terrain";
import { attachTerrainTexturePrecision } from "@/map/terrainTexturePrecision";
import { attachCoastlineDetail } from "@/map/coastlineDetail";
import { useExplorationStore } from "@/state/explorationStore";
import { BIOME_SOURCE } from "@/map/biomes";

export type GlobeStatus = "loading" | "ready" | "error";

interface GlobeViewProps {
  onStatus: (status: GlobeStatus, message?: string) => void;
}

export default function GlobeView({ onStatus }: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scenarioLayer, setScenarioLayer] = useState<ThreeTestLayer | null>(null);
  const [debugMap, setDebugMap] = useState<maplibregl.Map | null>(null);
  const [terrainWarning, setTerrainWarning] = useState(false);
  const threeLayerRef = useRef<ThreeTestLayer | null>(null);
  const [romanStatus, setRomanStatus] = useState<RomanTestStatus>({ state: "waiting", loaded: 0, errors: [] });
  const [streamingStatus, setStreamingStatus] = useState<StreamingStatus>();
  const [proceduralStatus, setProceduralStatus] = useState<GenerationResult | null>(null);
  const [settlementStatus, setSettlementStatus] = useState<SettlementStatus>({
    state: "unloaded", origin: ROMAN_SETTLEMENT.origin, loaded: 0,
    total: ROMAN_SETTLEMENT.buildings.length, terrainPending: 0, terrainRetained: 0, steepSites: 0, errors: [], sceneryLoaded: 0, scenerySteep: 0, sceneryTotal: ROMAN_SETTLEMENT.scenery?.length ?? 0,
  });
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

    const detachTerrainTexturePrecision = attachTerrainTexturePrecision(map);
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.dragRotate.enable();
    const detachCoastlineDetail = attachCoastlineDetail(map);

    map.on("load", () => {
      if (disposed) return;
      const layer = new ThreeTestLayer({ lngLat: TEST_MARKER_LNGLAT, onStreamingStatus: setStreamingStatus, onRomanStatus: setRomanStatus, onSettlementStatus: setSettlementStatus, onProceduralStatus: setProceduralStatus });
      threeLayerRef.current = layer;
      setScenarioLayer(layer);
      map.addLayer(layer);
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
      detachTerrainTexturePrecision();
      map.off("moveend", syncView);
      if (process.env.NODE_ENV === "development") {
        delete (window as unknown as { __globe?: unknown }).__globe;
      }
      map.remove();
      threeLayerRef.current = null;
    };
  }, []);

  // Size with h-full/w-full rather than absolute inset-0: MapLibre's stylesheet
  // sets `.maplibregl-map { position: relative }`, which would override an
  // `absolute` class and collapse the container's height to 0.
  return (
    <>
      <div ref={containerRef} className="h-full w-full" aria-hidden />
      <MapReadout map={debugMap} />
      {debugMap && scenarioLayer && <HistoricalWorldSession map={debugMap} layer={scenarioLayer} />}
      {debugMap && <ScenarioPanel map={debugMap} layer={scenarioLayer} streamingStatus={streamingStatus} settlementStatus={settlementStatus} />}
      <DebugPanel
        historicalLayer={scenarioLayer}
        streamingStatus={streamingStatus}
        onStreamingFixtures={() => threeLayerRef.current?.useDevelopmentSettlements()}
        onStreamingVisit={id => threeLayerRef.current?.visitStreamingSettlement(id)}
        onLODOverride={lod => threeLayerRef.current?.setSettlementLOD(lod)}
        map={debugMap}
        terrainWarning={terrainWarning}
        settlementStatus={settlementStatus}
        onAmbientLife={(options) => threeLayerRef.current?.configureAmbientLife(options)}
        proceduralStatus={proceduralStatus}
        onVisitProcedural={(seed, origin, profile) => threeLayerRef.current?.visitProceduralSettlement(seed, origin, {profile})}
        onSettlementEnabled={(enabled) => threeLayerRef.current?.setSettlementEnabled(enabled)}
        onVisitSettlement={(origin) => threeLayerRef.current?.visitSettlement(origin)}
        romanStatus={romanStatus}
        onRomanTestEnabled={(enabled) => threeLayerRef.current?.setRomanTestEnabled(enabled)}
        onRetryTerrain={() => {
          setTerrainWarning(false);
          debugMap?.refreshTiles(TERRAIN_SOURCE);
        }}
      />
    </>
  );
}
