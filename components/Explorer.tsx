"use client";

/**
 * Client application shell.
 *
 * Responsibilities:
 *  • Lay out the full-screen exploration surface (globe + top bar + timeline).
 *  • Gate rendering on WebGL 2 availability and show loading / error states.
 *  • Load the WebGL globe client-side only (`ssr: false`) so no browser APIs run
 *    during server rendering and hydration stays clean.
 *  • Drive the play/pause animation loop that advances historical time.
 *
 * It holds no renderer objects itself — those live inside {@link GlobeView}.
 */

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { TopBar } from "@/components/TopBar";
import { ScenarioProvider } from "@/components/ScenarioContext";
import { Timeline } from "@/components/Timeline";
import {
  ErrorOverlay,
  LoadingOverlay,
  WebGLUnavailableOverlay,
} from "@/components/Overlays";
import type { GlobeStatus } from "@/components/GlobeView";
import { isWebGL2Available } from "@/map/webglSupport";
import { MAX_YEAR } from "@/lib/historicalDate";
import { useExplorationStore } from "@/state/explorationStore";

// The globe depends on `window`/WebGL, so never render it on the server.
const GlobeView = dynamic(() => import("@/components/GlobeView"), {
  ssr: false,
});

export function Explorer() {
  // `null` on the server / first paint, then true|false on the client — via
  // useSyncExternalStore so there is no hydration mismatch and no setState-in-
  // effect cascade.
  const webglSupported = useWebGLSupported();
  const [globeStatus, setGlobeStatus] = useState<GlobeStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  usePlaybackLoop();

  const handleStatus = (status: GlobeStatus, message?: string) => {
    setGlobeStatus(status);
    if (status === "error") setErrorMessage(message ?? "Unknown error.");
  };

  return (
    <ScenarioProvider><main className="relative h-full w-full overflow-hidden bg-background">
      {/* Globe layer */}
      {webglSupported === true && <GlobeView onStatus={handleStatus} />}

      {/* Interface */}
      <TopBar />
      <Timeline />

      {/* States (topmost) */}
      {webglSupported === null && <LoadingOverlay />}
      {webglSupported === false && <WebGLUnavailableOverlay />}
      {webglSupported === true && globeStatus === "loading" && <LoadingOverlay />}
      {webglSupported === true && globeStatus === "error" && (
        <ErrorOverlay message={errorMessage ?? "Unknown error."} />
      )}
    </main></ScenarioProvider>
  );
}

/**
 * WebGL 2 availability as an external, read-only value. We compute it once
 * (lazily, client-side) and never change it, so `subscribe` is a no-op. The
 * server snapshot is `null` so SSR renders the neutral loading state.
 */
let webglSupportCache: boolean | null = null;
function getWebGLSnapshot(): boolean {
  if (webglSupportCache === null) webglSupportCache = isWebGL2Available();
  return webglSupportCache;
}
function useWebGLSupported(): boolean | null {
  return useSyncExternalStore<boolean | null>(
    () => () => {},
    getWebGLSnapshot,
    () => null,
  );
}

/**
 * Advances the historical year while playback is active, using a single
 * `requestAnimationFrame` loop. The loop reads live speed from the store and
 * accumulates fractional years so playback is smooth and frame-rate
 * independent. It auto-stops at the end of the covered range.
 */
function usePlaybackLoop(): void {
  const isPlaying = useExplorationStore((s) => s.isPlaying);
  const yearAccumulator = useRef(0);

  useEffect(() => {
    if (!isPlaying) return;

    const store = useExplorationStore.getState;
    yearAccumulator.current = store().year;
    let last = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const dtSeconds = Math.min(0.1, (now - last) / 1000);
      last = now;

      const { speed, setYear, pause, isPlaying: stillPlaying } = store();
      if (!stillPlaying) return;
      yearAccumulator.current += speed * dtSeconds;

      if (yearAccumulator.current >= MAX_YEAR) {
        setYear(MAX_YEAR);
        pause();
        return;
      }
      setYear(Math.trunc(yearAccumulator.current));
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);
}
