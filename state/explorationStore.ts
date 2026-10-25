/**
 * Shared exploration state.
 *
 * This store holds only **plain, serializable** values describing *what* the
 * user is exploring — the current year, playback, and a geographic view. It
 * deliberately contains no MapLibre `Map`, Three.js scene/renderer, WebGL
 * handles, or animation-loop state. Those live inside the renderer modules and
 * are driven *from* this state, so the UI and the renderer stay decoupled: any
 * component can react to year/camera changes without touching WebGL objects.
 */

import { create } from "zustand";
import { clampYear, DEFAULT_YEAR } from "@/lib/historicalDate";

/** A serializable snapshot of the globe camera. Mirrors MapLibre's camera. */
export interface GlobeView {
  /** Geographic centre of the view, [longitude, latitude] in degrees. */
  readonly center: readonly [number, number];
  readonly zoom: number;
  /** Rotation in degrees; 0 = north up. */
  readonly bearing: number;
  /** Tilt in degrees; 0 = straight down. */
  readonly pitch: number;
}

/** Playback speeds offered by the timeline, in historical years per second. */
export const PLAYBACK_SPEEDS = [5, 25, 100, 500] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

export const DEFAULT_VIEW: GlobeView = {
  // A gentle three-quarter view over the eastern Mediterranean / Near East,
  // cradle of many of the earliest settlements the experience will cover.
  center: [30, 25],
  zoom: 2.1,
  bearing: 0,
  pitch: 0,
};

interface ExplorationState {
  /** Current historical year in astronomical numbering (see lib/historicalDate). */
  year: number;
  isPlaying: boolean;
  /** Playback rate in historical years per real second. */
  speed: PlaybackSpeed;
  /** Last known globe camera; kept in sync by the globe view, read by the UI. */
  view: GlobeView;
  /** Geographic point the user has selected/focused, if any. */
  selected: readonly [number, number] | null;

  setYear: (year: number) => void;
  /** Advance the year by a (possibly fractional) delta, clamped to range. */
  advanceYear: (deltaYears: number) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setSpeed: (speed: PlaybackSpeed) => void;
  setView: (view: GlobeView) => void;
  setSelected: (point: readonly [number, number] | null) => void;
}

export const useExplorationStore = create<ExplorationState>((set, get) => ({
  year: DEFAULT_YEAR,
  isPlaying: false,
  speed: 100,
  view: DEFAULT_VIEW,
  selected: null,

  setYear: (year) => set({ year: clampYear(year) }),
  advanceYear: (deltaYears) => {
    const next = clampYear(get().year + deltaYears);
    // Auto-pause when playback reaches the end of the covered range.
    if (next === get().year && get().isPlaying) {
      set({ year: next, isPlaying: false });
    } else {
      set({ year: next });
    }
  },
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
  setSpeed: (speed) => set({ speed }),
  setView: (view) => set({ view }),
  setSelected: (point) => set({ selected: point }),
}));
