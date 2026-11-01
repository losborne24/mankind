"use client";
import { ScenarioRequestBar } from "@/components/ScenarioRequestBar";

/**
 * Compact cinematic top bar: a provisional wordmark and the structured
 * journey request (place, date, spatial scope), planned before it plays.
 */
export function TopBar() {
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
      <div className="pointer-events-auto flex items-baseline gap-2 select-none">
        <span className="text-sm font-semibold tracking-[0.35em] text-white sm:text-base">
          MANKIND
        </span>
        <span className="hidden text-[10px] uppercase tracking-widest text-white/40 sm:inline">
          a living historical world
        </span>
      </div>

      <ScenarioRequestBar />
    </header>
  );
}
