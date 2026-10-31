# MANKIND — Scene Generation Pipeline

**Audience:** coding agents and developers implementing scene generation.
**Status:** Design guide for Phase 4 (historical data & reconstruction) and Phase 5 (AI scene planning). Not yet implemented.
**Read with:** the Master Project Vision, Architecture & Development Roadmap.

---

## 1. Purpose

This document defines how MANKIND turns a request for a place at a point in time into a rendered historical scene.

It describes the stages, the artefacts each stage produces, the module boundaries between them and the order in which to build them.

It applies to scenes requested in Explore Mode (user picks a place and date) and in Scenario Mode (the Scenario Director requests scenes for narrative beats).

---

## 2. Core principles

1. **The map is the primary artefact.** A scene is a dated 2D reconstruction plan draped on reconstructed geography. 3D is a rendering of that plan, never the source of truth.
2. **AI produces specifications, not geometry.** AI stages output structured, validated data (claims, plans, asset requests). Deterministic code turns those into geometry.
3. **Every feature carries its evidence tier.** Documented, inferred and illustrative content are distinguishable in data and in the UI.
4. **Sites are modelled once, queried by date.** Features carry existence intervals. A scene for a given date is a query against the site model, not a separately authored scene.
5. **Graceful fallback, never improvisation.** If a required asset or kit does not exist, use a lower-fidelity representation and queue the missing asset. Never substitute an asset from the wrong era or tradition.
6. **Determinism and reproducibility.** The same plan, seed and generator version always produce the same scene.
7. **Scenes are shared world state.** Scenarios request scenes; they do not own or modify them.

---

## 3. Pipeline overview

```
 1. Scene query            place, date, focus, detail level
 2. Sources & maps         evidence claims, georeferenced historical maps
 3. Geography              paleo-geography for the date
 4. MapLibre layer         detailed geography rendered on the globe
 5. 2D plan                footprints, roads, land use, main features   ← CHECKPOINT A
 6. Landmarks              catalog assets or placeholders + creation queue
 7. Modular fill           kit-based buildings for remaining features
 8. Validate & cache       budgets, consistency, review, versioned cache  ← CHECKPOINT B
```

Stages 1–5 produce data. Stages 6–7 resolve that data into renderable content. Stage 8 approves and stores it.

---

## 4. Stages

### Stage 1 — Scene query

**Input:** a request from Explore Mode or the Scenario Director.
**Output:** `SceneQuery`.

Defines:

- Geographic bounds (polygon or bbox).
- Target date, or a narrow date range.
- Focus features (e.g. a temple, a harbour), if any.
- Required detail level (marker, plan, massing, full 3D).

The Scenario Director requests scenes only through this interface.

### Stage 2 — Sources and historical maps

**Input:** `SceneQuery`.
**Output:** `EvidenceBundle` (claims + georeferenced map sources).

- Research produces **discrete claims**, not prose. Each claim states a feature, a location or footprint, an existence interval, a source and a confidence level.
- Historical maps and archaeological plans are georeferenced (warped onto real coordinates) and stored as sources with their own confidence. They are evidence, not truth: they may be distorted, idealised or schematic.
- Conflicting claims are kept, not resolved silently. The plan stage records which one it followed and why.
- Evidence is cached **per site and period**, not per request.

Phase 4 uses hand-curated claims. Phase 5 adds AI extraction, whose output must be checked against cited sources before entering the bundle.

### Stage 3 — Geography

**Input:** `EvidenceBundle`, modern terrain (raster DEM).
**Output:** `GeographyModel` for the date.

Reconstructs physical geography as it was:

- River courses and banks.
- Coastlines and sea level.
- Ground level changes (e.g. ancient Rome sits metres below the modern city).
- Marshes, lakes and drainage.
- Broad vegetation and land cover.

Each change from modern geography is a feature with an evidence tier and an existence interval. Where nothing is known, modern geography is used and marked as such.

### Stage 4 — MapLibre geography layer

**Input:** `GeographyModel`.
**Output:** MapLibre sources and layers for the scene area.

- MapLibre remains the geographic authority. Historical geography is expressed as vector and raster layers (water polygons, land cover, terrain adjustments) applied within the scene bounds.
- Terrain modifications must be readable by terrain-aware placement, so buildings sit on historical ground, not modern ground.
- Layers are scoped to the scene area and unloaded with it.

### Stage 5 — 2D reconstruction plan

**Input:** `EvidenceBundle`, `GeographyModel`.
**Output:** `ScenePlan`.

The central artefact. A dated plan containing:

- Building footprints with type, height class and roof type.
- Roads, paths and open spaces.
- Walls, quays, bridges and other structures.
- Land use zones.
- Main scenario features, marked as focus features.

Rules:

- **Documented anchors** come from sourced claims and are fixed. Generators may not move them.
- **Inferred features** are derived from typology rules (e.g. warehouses near a river port) and tagged as reconstructions with a reason.
- **Illustrative fill** areas define where procedural generation may add generic buildings, and at what density.
- A claim that cannot be placed spatially is flagged, never positioned arbitrarily.

In Phase 5, the AI Scene Planner's job is to produce this plan. Everything after this point is deterministic.

**→ Checkpoint A** (see section 7).

### Stage 6 — Landmarks

**Input:** `ScenePlan` features marked as landmarks.
**Output:** resolved landmark placements, plus `AssetRequest`s for anything missing.

For each landmark, walk the fallback ladder (section 5). If no bespoke asset exists:

1. Place a placeholder at the documented footprint and height (parametric massing).
2. Create an `AssetRequest` describing what is needed and the evidence for it.
3. The scene remains valid and upgrades automatically when the asset is approved into the catalog.

**Asset creation is never part of scene generation.** It is an offline workflow (section 6).

### Stage 7 — Modular fill

**Input:** `ScenePlan` non-landmark features and fill areas.
**Output:** kit-based building placements, props, vegetation and navigation graph.

- Uses the existing procedural settlement generator, extended to respect fixed anchors and plan footprints.
- Kit selection is constrained by era, region and building tradition from the catalog.
- If no suitable kit exists, fall back to massing or extruded footprints. Never borrow a kit from another tradition.
- Seeded and deterministic.

### Stage 8 — Validate, review and cache

**Input:** fully resolved scene.
**Output:** approved, versioned `SceneDefinition`.

**→ Checkpoint B** (see section 7), then cache.

---

## 5. Fallback ladder

Every feature resolves to the highest available rung:

| Rung | Representation | When |
|---|---|---|
| 1 | Bespoke landmark asset | Approved catalog asset exists for this specific structure |
| 2 | Kit archetype | Suitable kit exists for the era, region and tradition |
| 3 | Parametric massing | Footprint, height and roof type known; no asset or kit |
| 4 | Extruded footprint | Footprint known; little else |
| 5 | Marker or info card | Location known; no footprint |

The rung used is recorded on each feature so the UI and validation can see it.

---

## 6. Asset catalog and creation workflow

### Catalog entries

Every asset or kit in the catalog records:

- Identifier and version.
- Type: bespoke landmark or kit archetype.
- Era range, region and building tradition.
- Dimensions and footprint.
- Sources used for the design, and a confidence level.
- LOD variants available.
- Licence and provenance (generating script, author).

The planner and kit selector may only choose assets that exist in the catalog and whose metadata matches the scene.

### Creating a missing asset

1. An `AssetRequest` is raised by Stage 6 or 7, with the evidence that justifies it.
2. The asset is built offline through the reproducible Blender/Python pipeline.
3. It is reviewed against its sources (by a human in early phases).
4. It is added to the catalog with full metadata.
5. Cached scenes using a placeholder for that feature are invalidated and rebuilt.

Requests are deduplicated across scenes. Many scenes needing the same temple produce one request.

---

## 7. Validation checkpoints

### Checkpoint A — after the 2D plan

- Schema validity.
- Geography: no buildings in water, no roads up impossible slopes, footprints on buildable ground.
- Chronology: every feature's existence interval contains the scene date.
- Evidence: every feature marked documented has a source; every inferred feature has a stated reason.
- Focus features required by the scenario are present.

### Checkpoint B — after the 3D build

- Style consistency: kit families match era, region and tradition.
- Budgets: building count, triangle count, texture memory and draw calls within limits for the detail level.
- Placement: terrain-aware placement succeeded; no collisions between fixed anchors and fill.
- Visual review: a rendered reference screenshot, approved by a human in early phases. A vision-model critique may be added later.

A failed check either rejects the plan or downgrades the affected features down the fallback ladder. Never render a scene that failed validation.

---

## 8. Data contracts (sketch)

Illustrative TypeScript shapes. Refine during implementation.

```ts
type EvidenceTier = "documented" | "inferred" | "illustrative" | "modern-default";

interface ExistenceInterval {
  from: HistoricalDate;      // inclusive
  to: HistoricalDate | null; // null = still exists
  uncertainty?: { fromRange?: [HistoricalDate, HistoricalDate]; toRange?: [HistoricalDate, HistoricalDate] };
}

interface SourceRef {
  id: string;
  citation: string;
  url?: string;
  kind: "text" | "historical-map" | "archaeological-plan" | "excavation" | "dataset";
}

interface Claim {
  id: string;
  feature: string;                 // e.g. "Temple of Portunus"
  geometry?: GeoJSON.Geometry;     // absent = could not be placed
  existence: ExistenceInterval;
  attributes: Record<string, unknown>;
  sources: SourceRef[];
  confidence: "high" | "medium" | "low";
  conflictsWith?: string[];
}

interface SceneQuery {
  bounds: GeoJSON.Polygon;
  date: HistoricalDate;
  focusFeatureIds?: string[];
  detailLevel: "marker" | "plan" | "massing" | "full";
}

interface PlanFeature {
  id: string;
  kind: "building" | "road" | "open-space" | "wall" | "quay" | "bridge" | "landuse";
  geometry: GeoJSON.Geometry;
  existence: ExistenceInterval;
  tier: EvidenceTier;
  claimIds: string[];              // empty only for illustrative
  inferenceReason?: string;        // required when tier = "inferred"
  fixed: boolean;                  // documented anchors are fixed
  isLandmark: boolean;
  isFocus: boolean;
  attributes: { heightClass?: string; roofType?: string; function?: string; tradition?: string };
}

interface ScenePlan {
  siteId: string;
  query: SceneQuery;
  geographyVersion: string;
  features: PlanFeature[];
  fillAreas: { geometry: GeoJSON.Polygon; density: number; tradition: string }[];
  seed: number;
}

interface ResolvedFeature {
  planFeatureId: string;
  rung: 1 | 2 | 3 | 4 | 5;
  assetId?: string;
  assetRequestId?: string;
}

interface SceneDefinition {
  plan: ScenePlan;
  resolved: ResolvedFeature[];
  generatorVersion: string;
  catalogVersion: string;
  validation: { checkpointA: ValidationReport; checkpointB: ValidationReport };
  approvedBy?: string;
}
```

Cache key: `siteId + date bucket + geographyVersion + generatorVersion + catalogVersion + seed`.

---

## 9. Module boundaries

| Module | Owns | Must not contain |
|---|---|---|
| Evidence store | Claims, sources, georeferenced maps | Rendering, layout logic |
| Geography builder | `GeographyModel`, MapLibre layers | Building placement |
| Scene planner | `ScenePlan` (hand-authored now, AI later) | Geometry, renderer calls |
| Asset catalog | Asset metadata, requests | Scene-specific logic |
| Scene compiler | Fallback resolution, procedural fill | Research, AI prompts |
| Renderer (Three.js) | Drawing resolved scenes | Historical dates, evidence logic |
| Scenario Director/Player | Requesting scenes, narrative, camera | Modifying scenes |

---

## 10. Build order

1. **Define the schemas** in section 8 as real types with runtime validation.
2. **Hand-author the Portunus scene** (Forum Boarium and Tiber bank) as an `EvidenceBundle` and `ScenePlan`, not as bespoke code. This is the golden reference. If the schema cannot express the hand-built scene, fix the schema.
3. **Geography layer** for the Portunus area, including historical riverbank and ground level, applied through MapLibre and readable by terrain-aware placement.
4. **Scene compiler**: fallback ladder, anchor-respecting procedural fill, catalog lookup.
5. **Asset catalog** with metadata, seeded with the Roman kit and the Temple of Hercules Victor model.
6. **Validators** for both checkpoints.
7. **Plan rendering in 2D** (footprints and labels on terrain) as the rung-4/5 fallback and the review view for Checkpoint A.
8. **Date queries**: show the site changing as the timeline moves.
9. Only then, in Phase 5: **AI claim extraction**, compared against hand-curated Portunus claims; then **AI plan drafting**, measured against the golden `ScenePlan`.

---

## 11. Non-goals for now

- Runtime AI generation of geometry or assets.
- Worldwide coverage.
- Automatic asset creation without review.
- Scenario-specific scene modifications.

---

## 12. Open questions

- Date bucketing: how coarse can cached scenes be before visible changes are missed?
- How historical ground-level changes are represented against MapLibre's terrain (DEM patch, offset layer, or Three.js ground mesh).
- Evidence-tier presentation in the UI (ghosting, desaturation, inspection cards).
- Large sites: when to partition a site model into independently streamed tiles.
