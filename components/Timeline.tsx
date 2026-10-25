"use client";

/**
 * Bottom timeline: scrub, play/pause, step, and playback speed. It only mutates
 * shared exploration state — it loads no historical data in this phase. The
 * play/pause animation loop lives in {@link Explorer}, not here.
 */

import { useId } from "react";
import {
  formatHistoricalYear,
  MAX_YEAR,
  MIN_YEAR,
} from "@/lib/historicalDate";
import {
  PLAYBACK_SPEEDS,
  useExplorationStore,
  type PlaybackSpeed,
} from "@/state/explorationStore";

const STEP_YEARS = 100;

export function Timeline() {
  const sliderId = useId();
  const year = useExplorationStore((s) => s.year);
  const isPlaying = useExplorationStore((s) => s.isPlaying);
  const speed = useExplorationStore((s) => s.speed);
  const setYear = useExplorationStore((s) => s.setYear);
  const advanceYear = useExplorationStore((s) => s.advanceYear);
  const togglePlay = useExplorationStore((s) => s.togglePlay);
  const setSpeed = useExplorationStore((s) => s.setSpeed);

  return (
    <section
      aria-label="Historical timeline"
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 px-3 pb-3 sm:px-6 sm:pb-5"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 rounded-2xl border border-panel-border bg-panel px-4 py-3 backdrop-blur-md sm:px-6 sm:py-4">
        {/* Top row: transport controls, year readout, speed. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <TransportButton
              label="Back 100 years"
              onClick={() => advanceYear(-STEP_YEARS)}
            >
              «
            </TransportButton>
            <TransportButton
              label={isPlaying ? "Pause" : "Play"}
              onClick={togglePlay}
              primary
            >
              {isPlaying ? "❚❚" : "►"}
            </TransportButton>
            <TransportButton
              label="Forward 100 years"
              onClick={() => advanceYear(STEP_YEARS)}
            >
              »
            </TransportButton>
          </div>

          <div className="flex flex-col items-center leading-none">
            <span
              className="font-mono text-xl font-semibold tabular-nums tracking-tight text-white sm:text-2xl"
              aria-live="polite"
            >
              {formatHistoricalYear(year)}
            </span>
            <span className="mt-1 text-[10px] uppercase tracking-widest text-white/40">
              selected year
            </span>
          </div>

          <div className="flex items-center gap-1" aria-label="Playback speed">
            {PLAYBACK_SPEEDS.map((s) => (
              <SpeedButton
                key={s}
                value={s}
                active={s === speed}
                onSelect={setSpeed}
              />
            ))}
          </div>
        </div>

        {/* Scrubber. */}
        <div className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-right font-mono text-[11px] text-white/40">
            {formatHistoricalYear(MIN_YEAR)}
          </span>
          <label htmlFor={sliderId} className="sr-only">
            Jump to year
          </label>
          <input
            id={sliderId}
            type="range"
            min={MIN_YEAR}
            max={MAX_YEAR}
            step={1}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-accent"
          />
          <span className="w-16 shrink-0 font-mono text-[11px] text-white/40">
            {formatHistoricalYear(MAX_YEAR)}
          </span>
        </div>
      </div>
    </section>
  );
}

function TransportButton({
  children,
  label,
  onClick,
  primary = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={
        "flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors " +
        (primary
          ? "bg-accent text-black hover:bg-accent/85"
          : "bg-white/8 text-white/80 hover:bg-white/15")
      }
    >
      {children}
    </button>
  );
}

function SpeedButton({
  value,
  active,
  onSelect,
}: {
  value: PlaybackSpeed;
  active: boolean;
  onSelect: (s: PlaybackSpeed) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={active}
      title={`${value} years per second`}
      className={
        "rounded-md px-2 py-1 font-mono text-[11px] transition-colors " +
        (active
          ? "bg-white/15 text-white"
          : "text-white/45 hover:bg-white/8 hover:text-white/80")
      }
    >
      {value}×
    </button>
  );
}
