/**
 * Declarative world-scene model.
 *
 * This module describes *what* should be visible in the world as plain,
 * serializable data — independent of Three.js, WebGL, or any rendering concern.
 * The same shapes could just as easily come from a database or API in a later
 * phase; the renderer ({@link ../map/worldLayer}) is the only thing that turns
 * them into geometry.
 *
 * Design rules honoured here:
 *  • A {@link SceneObject} is a **discriminated union** (`kind`), not a loose
 *    bag of optional fields.
 *  • Every object has a stable `id` and a geographic `position`.
 *  • No Three.js types leak in. No meshes, materials, vectors — only data.
 *  • Optional temporal visibility (`startYear`/`endYear`) lets the timeline
 *    show/hide objects without the renderer deciding historical truth.
 *
 * All coordinates are `[longitude, latitude]` in degrees.
 *
 * ⚠️  The accompanying demo scene ({@link ./demoScene}) is **synthetic,
 * explicitly fictional demonstration data**. It does not depict any real
 * settlement, structure, or historical event.
 */

/** A geographic coordinate: `[longitude, latitude]` in degrees. */
export type GeoCoord = readonly [number, number];

/**
 * Temporal visibility window in **astronomical years** (see
 * {@link ../lib/historicalDate}). Both bounds are inclusive and optional:
 * omitting `start` means "since the beginning of time", omitting `end` means
 * "until the present". An object with neither is always visible.
 */
export interface TimeSpan {
  readonly start?: number;
  readonly end?: number;
}

/** Fields shared by every scene object. */
interface SceneObjectBase {
  /** Stable, unique identifier — also used to seed deterministic generation. */
  readonly id: string;
  /** Anchor coordinate `[lng, lat]`. Local geometry is placed relative to it. */
  readonly position: GeoCoord;
  /** Optional temporal visibility; absent ⇒ always visible. */
  readonly when?: TimeSpan;
}

/** Coarse size/role hint, influencing procedural density and silhouette. */
export type SettlementVariant = "hamlet" | "village" | "town";

/**
 * A procedural settlement: a central cluster of buildings with surrounding
 * structures, internal paths, and vegetation. The renderer expands this into
 * concrete geometry deterministically from `seed`, so the data stays tiny.
 */
export interface Settlement extends SceneObjectBase {
  readonly kind: "settlement";
  readonly name: string;
  /** Seed string for deterministic layout. Defaults to `id` if omitted. */
  readonly seed?: string;
  readonly variant: SettlementVariant;
  /** Approximate radius of the built-up area, in metres. */
  readonly radiusMeters: number;
  /** Number of buildings to generate. */
  readonly buildingCount: number;
  /** Rotation of the whole settlement about its up-axis, in degrees. */
  readonly orientationDeg?: number;
}

/** A cluster of trees / vegetation. */
export interface Grove extends SceneObjectBase {
  readonly kind: "grove";
  readonly seed?: string;
  readonly radiusMeters: number;
  readonly treeCount: number;
}

/**
 * A road or path: an ordered list of geographic waypoints rendered as a ribbon
 * laid onto the surface. `position` is the anchor (first waypoint by
 * convention); `path` holds the full polyline.
 */
export interface Road extends SceneObjectBase {
  readonly kind: "road";
  readonly path: readonly GeoCoord[];
  /** Ribbon width in metres. */
  readonly widthMeters: number;
  readonly variant?: "path" | "road";
}

/**
 * An ambient ship that travels slowly and continuously along a looping route.
 * Movement is a deterministic function of simulation time (see the animation
 * system), never of unseeded randomness.
 */
export interface Ship extends SceneObjectBase {
  readonly kind: "ship";
  /** Looping route waypoints `[lng, lat]`; the ship cycles through them. */
  readonly route: readonly GeoCoord[];
  /** Hull length in metres (controls overall scale). */
  readonly lengthMeters: number;
  /** Time in seconds to traverse the whole loop once. */
  readonly loopSeconds: number;
}

/** A single notable freestanding structure (monument, tower, gate…). */
export interface Landmark extends SceneObjectBase {
  readonly kind: "landmark";
  readonly name: string;
  readonly heightMeters: number;
  readonly footprintMeters: number;
  readonly orientationDeg?: number;
}

/** Every renderable scene object. Discriminated by `kind`. */
export type SceneObject = Settlement | Grove | Road | Ship | Landmark;

export type SceneObjectKind = SceneObject["kind"];

/**
 * A complete, serializable world scene.
 *
 * `label` is intended to carry a human-visible provenance note; for the demo it
 * states plainly that the contents are fictional.
 */
export interface WorldScene {
  readonly id: string;
  /** Provenance / disclaimer, surfaced in docs and (optionally) the UI. */
  readonly label: string;
  /** Global seed, combined with per-object seeds for determinism. */
  readonly seed: string;
  readonly objects: readonly SceneObject[];
}

/**
 * Whether an object is visible at `year` given its optional {@link TimeSpan}.
 * Pure and total — the renderer calls this; it does not invent the rule.
 */
export function isVisibleAtYear(when: TimeSpan | undefined, year: number): boolean {
  if (!when) return true;
  if (when.start !== undefined && year < when.start) return false;
  if (when.end !== undefined && year > when.end) return false;
  return true;
}
