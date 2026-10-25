/**
 * Synthetic demonstration scene.
 *
 * ⚠️  EVERYTHING HERE IS FICTIONAL. These settlements, buildings, roads, groves,
 * and ships are invented for the sole purpose of demonstrating the Phase-2
 * rendering system. They do not represent any real place, structure, culture,
 * or historical event, and the dates below are illustrative only — not claims
 * that anything existed at those coordinates in those years.
 *
 * Coordinates sit in a neutral stretch of the eastern Mediterranean region
 * purely so the demo falls within the application's default camera framing.
 */

import type { WorldScene } from "./types";

/**
 * Central anchor for the demonstration. A real deployment would stream many
 * such scenes keyed by geography and time; here we ship exactly one, inline.
 */
export const DEMO_ANCHOR = { lng: 31.1342, lat: 29.9792 } as const;

export const DEMO_SCENE: WorldScene = {
  id: "demo-1",
  label: "SYNTHETIC DEMONSTRATION DATA — fictional, not historical",
  seed: "mankind-phase2-demo",
  objects: [
    // ── Primary settlement: always visible across the whole timeline. ──────
    {
      kind: "settlement",
      id: "riverbend",
      name: "Riverbend (demonstration)",
      position: [31.1342, 29.9792],
      variant: "town",
      radiusMeters: 1700,
      buildingCount: 26,
      orientationDeg: 18,
    },

    // ── A grove of trees just south-west of the town. ──────────────────────
    {
      kind: "grove",
      id: "riverbend-grove",
      position: [31.1205, 29.9724],
      radiusMeters: 650,
      treeCount: 40,
    },

    // ── An outpost that only "exists" from 2000 BCE onward. Demonstrates ───
    //    time-dependent visibility; the date is illustrative, not factual.
    {
      kind: "settlement",
      id: "ridge-outpost",
      name: "Ridge outpost (demonstration)",
      position: [31.1612, 29.9901],
      variant: "hamlet",
      radiusMeters: 650,
      buildingCount: 7,
      orientationDeg: -24,
      when: { start: -2000 },
    },

    // ── A road linking the town to the outpost (appears with the outpost). ─
    {
      kind: "road",
      id: "ridge-road",
      position: [31.1342, 29.9792],
      path: [
        [31.1342, 29.9792],
        [31.1455, 29.9838],
        [31.1540, 29.9872],
        [31.1612, 29.9901],
      ],
      widthMeters: 70,
      variant: "road",
      when: { start: -2000 },
    },

    // ── A short internal path within the town, always visible. ─────────────
    {
      kind: "road",
      id: "riverbend-lane",
      position: [31.1300, 29.9772],
      path: [
        [31.1300, 29.9772],
        [31.1342, 29.9792],
        [31.1378, 29.9808],
      ],
      widthMeters: 45,
      variant: "path",
    },

    // ── An ambient ship cycling a looping route on the adjacent water. ─────
    {
      kind: "ship",
      id: "trade-ship",
      position: [31.1210, 29.9830],
      route: [
        [31.1120, 29.9760],
        [31.1180, 29.9880],
        [31.1300, 29.9930],
        [31.1410, 29.9880],
        [31.1360, 29.9740],
        [31.1230, 29.9700],
      ],
      lengthMeters: 240,
      loopSeconds: 90,
    },
  ],
};
