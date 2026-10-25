# Mankind — a living historical world (Phase 2)

A web-based historical exploration experience: a beautiful, stylized 3D globe
you can rotate, zoom, and move through time on, from **3000 BCE to the present**.
At close range the world becomes inhabited — stylized settlements, buildings,
vegetation, roads and ambient ships, rendered as a tactile, painterly miniature.

- **Phase 1** proved the hard foundation: an interactive MapLibre globe, a
  correct BCE/CE timeline, and Three.js geometry anchored to real coordinates
  inside MapLibre's own WebGL pipeline.
- **Phase 2** (this phase) turns that foundation into the first reusable
  **living-world renderer**: a declarative scene model, a procedural settlement
  renderer, zoom-dependent level of detail, deterministic ambient animation, and
  time-dependent visibility — all driven by plain, serializable scene data.

There is still **no backend, database, AI, or historical dataset**. The one demo
scene is **explicitly fictional** (see “The demonstration scene” below) and
exists only to exercise the renderer.

![A stylized demonstration settlement with smoking chimneys, a road to an outpost, and surrounding groves, anchored on the globe](docs/screenshot.png)

---

## Getting started

Requirements: **Node 20+** and **pnpm** (`packageManager` pins pnpm 11).

```bash
pnpm install        # install dependencies
pnpm dev            # start the dev server → http://localhost:3000
```

Other commands:

```bash
pnpm build          # production build
pnpm start          # serve the production build
pnpm typecheck      # tsc --noEmit (strict)
pnpm lint           # eslint
```

### Seeing the demonstration world

The globe opens on a continental view. To explore the demo settlement:

- **Zoom in** on the eastern Mediterranean / northern Egypt region (around
  **31.13 °E, 29.98 °N**). A glowing **beacon** marks the settlement from
  orbital/regional zoom.
- Keep zooming (past ~zoom 10–11) and the beacon is replaced by the full
  **miniature settlement**: individual buildings, groves, paths, drifting
  chimney smoke, and a slow ambient ship.
- **Scrub the timeline.** At **3000 BCE** only the main town exists. Move to
  **2000 BCE or later** and a second **outpost** plus the **road** linking it
  appear — a demonstration of time-dependent visibility.
- **Rotate and tilt** (right-drag / ctrl-drag) — everything stays locked to its
  geographic coordinate.

---

## Architecture

Rendering code is kept separate from interface components, and **runtime WebGL
objects are kept out of serializable state**. Scene *data* is fully decoupled
from scene *rendering*.

```
app/
  layout.tsx            Root layout, fonts, metadata (server component)
  page.tsx              Mounts the client Explorer shell
  globals.css           Tailwind v4 + dark theme tokens

components/             Interface (client)
  Explorer.tsx          Shell: layout, WebGL gate, status overlays, playback loop
  GlobeView.tsx         MapLibre lifecycle; mounts the WorldLayer, feeds it the year
  Timeline.tsx          Scrub / play-pause / step / speed
  TopBar.tsx            Wordmark + placeholder search
  Overlays.tsx          Loading / error / WebGL-unavailable states

scene/                  Declarative world model (pure data — no Three.js)
  types.ts              Discriminated-union scene model + time-visibility rule
  demoScene.ts          The synthetic, explicitly fictional demonstration scene
  rng.ts                Seeded, deterministic PRNG (hashSeed + mulberry32)

map/                    Rendering modules
  mapStyle.ts           Painterly dark style + data source + base camera
  worldLayer.ts         The living-world custom layer (lifecycle + orchestration)
  anchoring.ts          lng/lat → globe/mercator model matrices + horizon cull
  geometry.ts           Shared materials + procedural buildings/trees/roads/ship
  animation.ts          Deterministic ambient systems (smoke, ship, foliage sway)
  lod.ts                Zoom → level-of-detail policy (configurable thresholds)
  webglSupport.ts       WebGL 2 capability probe

lib/                    Pure utilities (no React/renderer deps)
  historicalDate.ts     Astronomical-year ↔ BCE/CE conversion & bounds
  geo.ts                Globe unit-sphere math, local frames, matrix lerp, offsets

state/
  explorationStore.ts   Zustand store: year, playback, speed, view (serializable)
```

### The scene model (`scene/`)

A scene is plain, serializable data that could just as easily come from a
database or API later:

```ts
interface WorldScene {
  id: string;
  label: string;        // provenance note (the demo states it is fictional)
  seed: string;
  objects: SceneObject[];
}

type SceneObject =       // discriminated by `kind`
  | Settlement           // procedural cluster: buildings + paths + groves + smoke
  | Grove                // a cluster of trees
  | Road                 // a polyline path/road laid on the surface
  | Ship                 // an ambient vessel looping a route
  | Landmark;            // a single notable structure
```

Every object has a stable `id`, a geographic `position` (`[lng, lat]`), and an
optional temporal window `when: { start?, end? }`. Settlements are described
compactly (a seed, a radius, a building count, a variant) and the renderer
expands them into concrete geometry deterministically — the data stays tiny.
**No Three.js types appear in this layer.**

Temporal visibility is a single pure function, `isVisibleAtYear(when, year)`;
the renderer calls it but never decides historical truth itself.

### The renderer (`map/worldLayer.ts`)

`WorldLayer` is a MapLibre **custom layer** that draws the whole scene into
**MapLibre's own WebGL2 context and canvas** — no second canvas, no independent
render loop. Each top-level scene object becomes an anchored **Region**: a group
of geometry authored in that object's **local metre-space**, plus a precomputed
anchor. Responsibilities are split across the modules listed above; `WorldLayer`
only owns the lifecycle and the per-frame orchestration (time → LOD → animation
→ draw).

React stays responsible for the UI and high-level state. It never touches
per-frame rendering: `GlobeView` creates the layer once, subscribes to the
store's `year`, and calls `layer.setYear(...)` — the layer decides what that
means for visibility. Three.js objects, materials and the renderer live only
inside the layer, never in Zustand or React state.

### Geographic anchoring (`map/anchoring.ts`)

This is the one well-defined bridge from a coordinate to the matrices that place
geometry, generalized from the Phase-1 proof so **every object anchors through
exactly one code path**.

Each frame MapLibre hands custom layers a globe `mainMatrix` (projects a **unit
sphere** to clip space), a mercator `fallbackMatrix`, and a
`projectionTransition ∈ [0,1]` used to cross-fade globe→mercator as you zoom in.
For each anchor we precompute **two** model matrices — one placing local
metre-space onto the unit sphere, one at the mercator coordinate — form the two
full MVP matrices, and interpolate them by the transition. Because matrix·vector
is linear, `lerp(A,B,t)·p ≡ lerp(A·p, B·p, t)`, so the result reproduces
MapLibre's per-vertex blend and is exact at both endpoints. Far-side geometry is
culled with MapLibre's globe clipping-plane data. All parts of one object share
a single anchor (compact local offsets via `localOffsetMeters`), so one blended
MVP places the whole group and it stays locked as the globe rotates, tilts and
zooms.

### Level of detail (`map/lod.ts`)

A single configurable policy maps the live zoom to a detail level — no scattered
`zoom > N` checks. Each region builds its content once and toggles slot
visibility:

| level  | zoom (default)      | shown                                             |
| ------ | ------------------- | ------------------------------------------------- |
| `far`  | `< 5.5`             | a **screen-stable beacon** marking the settlement |
| `mid`  | `5.5 – 10.5`        | beacon + ground-pad footprint + roads/paths       |
| `near` | `≥ 10.5`            | individual buildings, groves, ships + animation   |

Thresholds live in `DEFAULT_LOD` and can be overridden per layer. The far beacon
is rescaled each frame to a roughly constant on-screen size, so it reads as a
marker from orbit without ballooning as you approach.

### Deterministic ambient animation (`map/animation.ts`)

Three restrained systems — **chimney smoke** (instanced rising puffs), a **ship**
moving along a looping route, and subtle **foliage sway** — run **only at the
`near` level**. Each system is a **pure function of a single simulation time in
seconds**; placement randomness is baked once at construction from the seeded
PRNG. Re-rendering at the same time reproduces exactly the same state, so motion
is reproducible and there are no unseeded `Math.random()` calls per frame.

While an animated region is on screen the layer advances the clock and requests
the next frame via `map.triggerRepaint()`; when you zoom out it stops asking, so
**there is no perpetual render loop** (verified: ~60 fps at `near`, 0 idle frames
at `far`). Instancing keeps smoke and vegetation to a few draw calls, and
materials/geometries are shared and reused — never allocated per frame.

### Resource management & lifecycle

`MaterialLibrary` owns the small fixed set of shared materials and disposes them
once. On `onRemove`, the layer disposes every animation-owned geometry, traverses
the scene disposing all geometries, disposes the shared materials, and disposes
the `WebGLRenderer` — **without** `forceContextLoss`, so MapLibre's shared
context is never destroyed. `GlobeView` removes the map (and thus the layer) on
unmount and unsubscribes from the store. (Verified: removing the layer leaves the
globe intact with zero console errors.)

### The demonstration scene (`scene/demoScene.ts`)

> ⚠️ **The demo scene is entirely fictional.** Its settlements, buildings,
> roads, groves and ship are invented solely to demonstrate the renderer. They
> do **not** represent any real place, structure, culture or historical event,
> and the dates attached to them are illustrative only — not claims that anything
> existed at those coordinates in those years. The coordinates sit in a neutral
> area merely so the demo falls within the default camera framing.

It contains: a primary **town** (always visible), a **grove**, an internal
**path**, a time-gated **outpost** and **road** (visible from 2000 BCE onward),
and an ambient **ship**.

### Historical dates (`lib/historicalDate.ts`)

Unchanged from Phase 1: the single source of truth for years, using
**astronomical year numbering** (there is a year zero) so arithmetic across the
BCE/CE boundary is continuous and off-by-one-free (`-2999` → `3000 BCE`,
`0` → `1 BCE`, `1` → `1 CE`). JavaScript `Date` is deliberately **not** used.

---

## Map data / style dependency, licensing & cost

The globe renders from MapLibre's public **demo vector tiles**:

- **Endpoint:** `https://demotiles.maplibre.org/tiles/{z}/{x}/{y}.pbf`
- **Content:** low-detail world — country polygons (land, coastline, borders)
  and graticule lines. **Max zoom 6.** No cities, roads, labels, or terrain.
- **Cost / key:** free, no API key, no account.
- **Licensing:** boundary data © [Natural Earth](https://www.naturalearthdata.com/)
  (public domain); tiles served by MapLibre **as a demonstration endpoint**.
- **Limits (important):** MapLibre states demotiles are for **demos/development
  only** — no uptime, rate-limit, or availability guarantee, not suitable for
  production traffic.

**For production**, replace `GEO_SOURCE` in `map/mapStyle.ts` with self-hosted
tiles (e.g. Protomaps/PMTiles) or a commercial provider (MapTiler, Stadia, …).
The painterly styling lives entirely in `map/mapStyle.ts` and is independent of
the data source.

### The MapLibre worker

MapLibre resolves its web worker from a runtime-computed filename that Turbopack
cannot statically analyze. `components/GlobeView.tsx` points at it with a static
`new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url)` specifier
and `maplibregl.setWorkerUrl(...)`, letting the bundler emit the worker as an
asset and rewrite the URL at build time. No extra copy step is required.

---

## Checks run

- `pnpm typecheck` — TypeScript strict, **no errors**.
- `pnpm lint` — ESLint (Next core-web-vitals + TS), **clean**.
- `pnpm build` — production build succeeds; `/` prerenders as static.
- **Live browser verification** (Chrome, WebGL2) against the dev server:
  - Settlement renders at real coordinates and is **locked** through rotate /
    tilt / zoom and the globe→mercator transition (anchors projected to screen
    stay glued to the geometry across bearings 0–220°).
  - **LOD transitions** behave: a beacon at far zoom, footprint at mid,
    individual buildings/groves/ship at near.
  - **Time visibility** works: the outpost + road are hidden at 3000 BCE and
    appear at 2000 BCE onward.
  - **Ambient animation** runs smoothly (~60 fps at near) and the render loop
    **stops** when zoomed out (0 idle frames at far).
  - **Teardown** disposes the layer with **zero console errors**; MapLibre's
    shared context survives.

---

## Known limitations

- **Demo tiles only** (see above): low detail, max zoom 6, not production-grade.
  Below the built-up area the ground is a flat style colour, not real terrain.
- **Exaggerated miniature scale.** Buildings are tens-to-hundreds of metres so
  the settlement reads as a legible, tactile miniature at the zoom levels the
  demo globe supports, rather than as invisible real-scale structures. This is an
  art-direction choice, not final real-world scale.
- **Per-object (not per-vertex) projection blend.** The globe↔mercator MVP blend
  is applied per anchored object. It is exact at both endpoints and imperceptible
  for a compact settlement; a single object spanning the seam mid-transition
  could differ slightly from MapLibre's per-vertex blend. Detailed geometry is
  only shown once essentially past the transition, so this is not visible in
  practice. MapLibre's mercator space is left-handed, so building materials use
  `DoubleSide` to avoid back-face culling under the resulting model determinant;
  normals (hence lighting) are unaffected.
- **Local-tangent flattening.** Positions within one anchored region use an
  equirectangular local approximation, so per-anchor extents should stay modest
  (≲ a few km). Very long roads modelled as one region would bend slightly; the
  demo keeps extents small.
- **Lighting is in local space.** Objects are lit by a fixed key/fill rig in
  their own local frame (consistent tops-lit look) rather than by a globe-level
  sun; a day/night or era-driven sun is a later concern.
- **One-way camera sync.** User navigation is mirrored into shared state on
  `moveend`; state does not drive the camera back (avoids feedback loops).

---

## Next step (Phase 3)

The most valuable next step is a **time-aware scene data layer**: a schema and
loader that serve multiple `WorldScene`s keyed by geography and year (from local
fixtures first, an API later), so the renderer — already time- and
LOD-aware — can present many evidence-backed places that appear, grow and fade as
the timeline moves, instead of one inline demo. The anchoring, LOD, animation and
disposal proven here carry over unchanged; only the *source* of scene data grows.
