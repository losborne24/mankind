/**
 * WorldLayer — the living-world renderer.
 *
 * A single MapLibre **custom layer** that draws an entire {@link WorldScene} of
 * stylized settlements, vegetation, roads and ambient ships into MapLibre's own
 * WebGL2 context — no second canvas, no independent render loop. It generalizes
 * the Phase-1 single-marker proof into a reusable, data-driven system:
 *
 *   scene data  →  per-object anchored "regions"  →  LOD + time + animation
 *
 * Responsibilities kept deliberately separate across modules:
 *   • {@link ../scene/types}      — what exists (serializable data)
 *   • {@link ./anchoring}         — geographic placement matrices
 *   • {@link ./geometry}          — procedural meshes + shared materials
 *   • {@link ./animation}         — deterministic ambient motion
 *   • {@link ./lod}               — zoom → detail-level policy
 *   • this file                   — lifecycle, per-frame orchestration, cleanup
 *
 * ── Rendering model ─────────────────────────────────────────────────────────
 * Each top-level scene object becomes a {@link Region}: a Three.js group of
 * geometry authored in that object's **local metre-space**, plus a precomputed
 * {@link Anchor}. Because every part of one object shares a single anchor, one
 * blended globe↔mercator MVP (see {@link resolveProjection}) places the whole
 * group correctly and stays locked to its coordinate as the globe moves.
 *
 * Regions are drawn one at a time: we make only the current region visible, set
 * the camera's projection matrix to that region's MVP, and render. The scene's
 * lights are shared. This keeps multi-anchor placement exact while reusing one
 * renderer, one scene, and one shared material set.
 *
 * ── Animation & repaint ─────────────────────────────────────────────────────
 * Ambient animation runs only at the `near` detail level. While any animated
 * region is on screen we advance the systems by a simulation clock and request
 * the next frame via `map.triggerRepaint()`; when zoomed out we stop asking, so
 * there is no perpetual render loop. The clock is derived from elapsed real time
 * but every system is a pure function of it, so the motion is deterministic.
 */

import * as THREE from "three";
import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
  Map as MapLibreMap,
} from "maplibre-gl";
import { localOffsetMeters } from "@/lib/geo";
import {
  isVisibleAtYear,
  type GeoCoord,
  type Settlement,
  type SceneObject,
  type TimeSpan,
  type WorldScene,
} from "@/scene/types";
import { makeRng, type Rng } from "@/scene/rng";
import { Anchor, ProjectionScratch, resolveProjection } from "./anchoring";
import {
  buildBuilding,
  buildFarMassing,
  buildGroundPad,
  buildRoad,
  buildShip,
  buildTrees,
  disposeObject3D,
  MaterialLibrary,
  type MassingBlock,
  type TreeScatter,
} from "./geometry";
import {
  ShipSystem,
  SmokeSystem,
  SwaySystem,
  type AnimationSystem,
  type SmokeSource,
} from "./animation";
import { DEFAULT_LOD, lodHasAnimation, zoomToLod, type LodThresholds, type LodLevel } from "./lod";

/**
 * One anchored scene object. Holds up to four LOD slots. There are **no
 * beacons** — a settlement's presence is conveyed entirely by physical
 * geometry, which gains detail as the camera approaches:
 *   far        — a cheap instanced massing silhouette of the built-up area
 *   footprint  — organic ground pad + roads/paths: visible at `mid` + `near`
 *   structures — individual buildings: visible at `mid` + `near`
 *   detail     — vegetation, ships + ambient animation: visible at `near`
 *
 * The far→mid step swaps the merged massing for individual buildings at the
 * same positions (imperceptible while the settlement is a distant speck); the
 * mid→near step is purely additive (vegetation and life fade in over the same,
 * unchanged buildings), so the world reveals detail rather than being replaced.
 */
class Region {
  readonly anchor: Anchor;
  readonly group = new THREE.Group();
  readonly when?: TimeSpan;
  readonly animations: AnimationSystem[] = [];
  readonly latDeg: number;

  private far?: THREE.Object3D;
  private footprint?: THREE.Object3D;
  private structures?: THREE.Object3D;
  private detail?: THREE.Object3D;

  constructor(lngLat: GeoCoord, when?: TimeSpan) {
    this.anchor = new Anchor(lngLat[0], lngLat[1]);
    this.latDeg = lngLat[1];
    this.when = when;
    this.group.matrixAutoUpdate = true;
  }

  setFar(o: THREE.Object3D) {
    this.far = o;
    this.group.add(o);
  }
  setFootprint(o: THREE.Object3D) {
    this.footprint = o;
    this.group.add(o);
  }
  setStructures(o: THREE.Object3D) {
    this.structures = o;
    this.group.add(o);
  }
  setDetail(o: THREE.Object3D) {
    this.detail = o;
    this.group.add(o);
  }
  rotateY(deg?: number) {
    if (deg) this.group.rotation.y = (deg * Math.PI) / 180;
  }

  /** Apply a detail level by toggling slot visibility. */
  applyLod(level: LodLevel): void {
    if (this.far) this.far.visible = level === "far";
    if (this.footprint) this.footprint.visible = level !== "far";
    if (this.structures) this.structures.visible = level !== "far";
    if (this.detail) this.detail.visible = level === "near";
  }
}

export interface WorldLayerOptions {
  id?: string;
  scene: WorldScene;
  /** Current historical year (astronomical). Drives time visibility. */
  year: number;
  lod?: LodThresholds;
}

export class WorldLayer implements CustomLayerInterface {
  readonly id: string;
  readonly type = "custom" as const;
  readonly renderingMode = "3d" as const;

  private readonly scene: WorldScene;
  private readonly lod: LodThresholds;
  private year: number;

  private map: MapLibreMap | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private threeScene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;
  private materials: MaterialLibrary | null = null;
  private regions: Region[] = [];

  private readonly scratch = new ProjectionScratch();

  /** Simulation clock for ambient animation, in seconds. */
  private clockSeconds = 0;
  private lastFrameMs: number | null = null;

  constructor(options: WorldLayerOptions) {
    this.id = options.id ?? "world-layer";
    this.scene = options.scene;
    this.year = options.year;
    this.lod = options.lod ?? DEFAULT_LOD;
  }

  /** Update the historical year and request a redraw (visibility may change). */
  setYear(year: number): void {
    if (year === this.year) return;
    this.year = year;
    this.map?.triggerRepaint();
  }

  onAdd(map: MapLibreMap, gl: WebGL2RenderingContext): void {
    this.map = map;

    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true,
    });
    this.renderer.autoClear = false;

    this.threeScene = new THREE.Scene();

    // Camera stays at the origin with identity view; per-frame we write the full
    // MVP (projection·model) into its projectionMatrix. Disabling auto-update
    // keeps the view matrix identity so geometry is lit in a consistent local
    // frame regardless of globe orientation.
    this.camera = new THREE.Camera();
    this.camera.matrixAutoUpdate = false;

    this.buildLights(this.threeScene);

    this.materials = new MaterialLibrary();
    for (const obj of this.scene.objects) {
      const region = this.buildRegion(obj, this.materials);
      if (region) {
        this.regions.push(region);
        this.threeScene.add(region.group);
      }
    }
  }

  onRemove(): void {
    // Dispose animation-owned geometry, then all scene geometry, then shared
    // materials and the renderer. The renderer is disposed WITHOUT touching
    // MapLibre's shared context (no forceContextLoss).
    for (const region of this.regions) {
      for (const anim of region.animations) anim.dispose();
    }
    if (this.threeScene) disposeObject3D(this.threeScene);
    this.materials?.dispose();
    this.renderer?.dispose();

    this.regions = [];
    this.materials = null;
    this.renderer = null;
    this.threeScene = null;
    this.camera = null;
    this.map = null;
  }

  render(_gl: WebGL2RenderingContext, args: CustomRenderMethodInput): void {
    const { renderer, threeScene, camera, map } = this;
    if (!renderer || !threeScene || !camera || !map) return;

    const isGlobe = map.getProjection().type === "globe";
    const zoom = map.getZoom();
    const level = zoomToLod(zoom, this.lod);
    const animate = lodHasAnimation(level);

    // Advance the deterministic simulation clock only while animating.
    if (animate) {
      const now = performance.now();
      if (this.lastFrameMs !== null) {
        this.clockSeconds += Math.min(0.05, (now - this.lastFrameMs) / 1000);
      }
      this.lastFrameMs = now;
    } else {
      this.lastFrameMs = null;
    }

    renderer.resetState();
    renderer.clearDepth();

    let anyAnimatedVisible = false;

    for (const region of this.regions) {
      // Start hidden; only the region being drawn is made visible.
      region.group.visible = false;
    }

    for (const region of this.regions) {
      if (!isVisibleAtYear(region.when, this.year)) continue;

      // Place this region; skip if it is beyond the globe's horizon.
      if (!resolveProjection(region.anchor, isGlobe, args, this.scratch, camera)) {
        continue;
      }

      region.applyLod(level);
      if (animate && region.animations.length > 0) {
        for (const anim of region.animations) anim.update(this.clockSeconds);
        anyAnimatedVisible = true;
      }

      region.group.visible = true;
      renderer.render(threeScene, camera);
      region.group.visible = false;
    }

    // Keep the animation going only while something animated is on screen.
    if (animate && anyAnimatedVisible) map.triggerRepaint();
  }

  // ── construction ──────────────────────────────────────────────────────────

  private buildLights(scene: THREE.Scene): void {
    scene.add(new THREE.AmbientLight(0xb9cfe0, 1.15));
    const key = new THREE.DirectionalLight(0xfff1d6, 2.1);
    key.position.set(0.45, 1.0, 0.7);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x6d86a8, 0.5);
    fill.position.set(-0.6, 0.4, -0.5);
    scene.add(fill);
  }

  private buildRegion(obj: SceneObject, mats: MaterialLibrary): Region | null {
    const seedBase = `${this.scene.seed}:${obj.id}`;
    switch (obj.kind) {
      case "settlement":
        return this.buildSettlement(obj, mats, makeRng(obj.seed ?? seedBase));
      case "grove":
        return this.buildGrove(obj, mats, makeRng(obj.seed ?? seedBase));
      case "road":
        return this.buildRoadRegion(obj, mats);
      case "ship":
        return this.buildShipRegion(obj, mats);
      case "landmark":
        return this.buildLandmark(obj, mats);
    }
  }

  private buildSettlement(
    s: Settlement,
    mats: MaterialLibrary,
    rng: Rng,
  ): Region {
    const region = new Region(s.position, s.when);
    region.rotateY(s.orientationDeg);

    const unit = s.variant === "town" ? 1 : s.variant === "village" ? 0.8 : 0.62;

    // ── footprint: organic ground pad + internal paths (mid + near) ──
    const footprint = new THREE.Group();
    footprint.add(buildGroundPad(mats, rng, s.radiusMeters * 1.08));

    // Deterministic building layout, shared by the far massing (one instanced
    // silhouette) and the mid/near individual buildings, so the shape stays
    // continuous across LOD levels.
    const structures = new THREE.Group();
    const placed: Array<{ x: number; z: number; top: number; scale: number }> = [];
    const massing: MassingBlock[] = [];
    const roofs = ["flat", "hipped", "gabled"] as const;
    let attempts = 0;
    while (placed.length < s.buildingCount && attempts < s.buildingCount * 20) {
      attempts++;
      // Denser toward the centre (sqrt radial distribution).
      const r = s.radiusMeters * 0.92 * Math.sqrt(rng.next());
      const a = rng.range(0, Math.PI * 2);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const w = rng.range(90, 175) * unit;
      const d = rng.range(90, 165) * unit;
      const minGap = Math.max(w, d) * 0.62;
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < minGap)) continue;

      const h = rng.range(110, 360) * unit * (rng.chance(0.18) ? 1.5 : 1);
      const building = buildBuilding(mats, rng, { width: w, depth: d, height: h, roof: rng.pick(roofs) });
      building.position.set(x, 0, z);
      building.rotation.y = rng.range(-0.25, 0.25);
      structures.add(building);
      placed.push({ x, z, top: h, scale: unit });
      massing.push({ x, z, w, d, h });
    }

    // One or two internal paths from an edge building toward the centre.
    const pathCount = s.variant === "hamlet" ? 0 : rng.int(1, 2);
    for (let i = 0; i < pathCount && placed.length > 0; i++) {
      const p = rng.pick(placed);
      footprint.add(
        buildRoad(
          mats,
          [
            [p.x, p.z],
            [p.x * 0.4, p.z * 0.4],
            [rng.range(-80, 80), rng.range(-80, 80)],
          ],
          55 * unit,
          "path",
        ),
      );
    }
    region.setFootprint(footprint);
    region.setStructures(structures);

    // ── detail: perimeter trees + chimney smoke + sway (near) ──
    const detail = new THREE.Group();

    const treeScatter = this.ringScatter(rng, s.radiusMeters * 0.75, s.radiusMeters * 1.25, Math.round(14 * unit) + 8, unit);
    const trees = buildTrees(mats, rng, treeScatter);
    detail.add(trees);
    region.animations.push(new SwaySystem(trees, rng, 0.015));

    // Smoke from a subset of buildings.
    const sources: SmokeSource[] = placed
      .filter(() => rng.chance(0.45))
      .slice(0, 8)
      .map((p) => ({ position: [p.x, p.z] as const, baseY: p.top * 1.02, scale: p.scale }));
    if (sources.length > 0) {
      const smoke = new SmokeSystem(mats, rng, sources, 5);
      detail.add(smoke.object);
      region.animations.push(smoke);
    }
    region.setDetail(detail);

    // ── far: a cheap instanced massing silhouette (no beacon) ──
    region.setFar(buildFarMassing(mats, massing));

    this.initVisibility(region);
    return region;
  }

  private buildGrove(g: Extract<SceneObject, { kind: "grove" }>, mats: MaterialLibrary, rng: Rng): Region {
    const region = new Region(g.position, g.when);
    const scatter = this.discScatter(rng, g.radiusMeters, g.treeCount, 1);
    const trees = buildTrees(mats, rng, scatter);
    const detail = new THREE.Group();
    detail.add(trees);
    region.setDetail(detail);
    region.animations.push(new SwaySystem(trees, rng, 0.02));
    // Groves are close-range detail only — they appear at near zoom.
    this.initVisibility(region);
    return region;
  }

  private buildRoadRegion(r: Extract<SceneObject, { kind: "road" }>, mats: MaterialLibrary): Region {
    const region = new Region(r.position, r.when);
    const local = r.path.map((pt) => localOffsetMeters(r.position, pt));
    const footprint = new THREE.Group();
    footprint.add(buildRoad(mats, local, r.widthMeters, r.variant ?? "road"));
    region.setFootprint(footprint);
    this.initVisibility(region);
    return region;
  }

  private buildShipRegion(sh: Extract<SceneObject, { kind: "ship" }>, mats: MaterialLibrary): Region {
    const region = new Region(sh.position, sh.when);
    const ship = buildShip(mats, sh.lengthMeters);
    const detail = new THREE.Group();
    detail.add(ship);
    region.setDetail(detail);
    const localRoute = sh.route.map((pt) => localOffsetMeters(sh.position, pt));
    region.animations.push(new ShipSystem(ship, localRoute, sh.loopSeconds));
    this.initVisibility(region);
    return region;
  }

  private buildLandmark(l: Extract<SceneObject, { kind: "landmark" }>, mats: MaterialLibrary): Region {
    const region = new Region(l.position, l.when);
    region.rotateY(l.orientationDeg);
    const rng = makeRng(`${this.scene.seed}:${l.id}`);
    const footprint = new THREE.Group();
    footprint.add(buildGroundPad(mats, rng, l.footprintMeters * 1.4));
    region.setFootprint(footprint);
    const structures = new THREE.Group();
    structures.add(
      buildBuilding(mats, rng, {
        width: l.footprintMeters,
        depth: l.footprintMeters,
        height: l.heightMeters,
        roof: "hipped",
      }),
    );
    region.setStructures(structures);
    // Far: a single massing block at the landmark's footprint (no beacon).
    region.setFar(
      buildFarMassing(mats, [
        { x: 0, z: 0, w: l.footprintMeters, d: l.footprintMeters, h: l.heightMeters },
      ]),
    );
    this.initVisibility(region);
    return region;
  }

  /** Hide every slot initially; the first render's applyLod sets the truth. */
  private initVisibility(region: Region): void {
    region.applyLod("far");
    region.group.visible = false;
  }

  // ── scatter helpers (deterministic) ─────────────────────────────────────────

  private discScatter(rng: Rng, radius: number, count: number, unit: number): TreeScatter {
    const positions: Array<readonly [number, number]> = [];
    const scales: number[] = [];
    for (let i = 0; i < count; i++) {
      const r = radius * Math.sqrt(rng.next());
      const a = rng.range(0, Math.PI * 2);
      positions.push([Math.cos(a) * r, Math.sin(a) * r]);
      scales.push(rng.range(0.7, 1.4) * unit * 5);
    }
    return { positions, scales };
  }

  private ringScatter(rng: Rng, rMin: number, rMax: number, count: number, unit: number): TreeScatter {
    const positions: Array<readonly [number, number]> = [];
    const scales: number[] = [];
    for (let i = 0; i < count; i++) {
      const r = rng.range(rMin, rMax);
      const a = rng.range(0, Math.PI * 2);
      positions.push([Math.cos(a) * r, Math.sin(a) * r]);
      scales.push(rng.range(0.7, 1.3) * unit * 5);
    }
    return { positions, scales };
  }
}
