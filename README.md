# Mankind — a living historical world (Phase 1)

A web-based historical exploration experience: a beautiful, stylized 3D globe
you can rotate, zoom, and move through time on, from **3000 BCE to the present**.

This repository currently contains **Phase 1 only** — the frontend rendering
foundation. The goal of this phase is to prove that the three hard pieces work
together cleanly:

1. An interactive **MapLibre globe** with real geographic context.
2. A **historical timeline** using a correct BCE/CE calendar model.
3. **Three.js geometry anchored to real coordinates**, rendered inside
   MapLibre's own WebGL pipeline and staying aligned as the globe moves.

There is no backend, database, AI, or historical dataset yet — those are later
phases. The timeline changes application state only.

![The globe with a geo-anchored 3D marker at Giza](docs/screenshot.png)

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
pnpm sync-worker    # (re)copy MapLibre's worker into public/ (also runs on predev/prebuild)
```

> **Note on the MapLibre worker.** `pnpm dev`/`pnpm build` first run
> `scripts/sync-maplibre-worker.mjs`, which copies MapLibre's web worker into
> `public/maplibre/`. This is required because MapLibre resolves its worker from
> a runtime-computed filename that Turbopack cannot bundle; we serve it as a
> static same-origin asset instead. See "Known limitations" below. The copied
> file is git-ignored and regenerated from the installed package version.

---

## What you can do in Phase 1

- **Rotate, pan, and zoom** the globe (drag to rotate, right-drag/ctrl-drag to
  tilt & spin, scroll to zoom; nav control top-right).
- **Scrub through time** with the bottom timeline, **play/pause** automatic
  progression, step ±100 years, and choose a **playback speed** (5–500 yrs/sec).
- See a **stylized 3D marker** (a beacon on a tapered tower) anchored at the
  Giza plateau (≈31.13 °E, 29.98 °N). It stays locked to that coordinate as you
  rotate and zoom, and is correctly **hidden when it rotates to the far side**
  of the globe.

---

## Architecture

Rendering code is kept separate from interface components, and runtime WebGL
objects are kept out of serializable state.

```
app/
  layout.tsx            Root layout, fonts, metadata (server component)
  page.tsx              Mounts the client Explorer shell
  globals.css           Tailwind v4 + dark theme tokens

components/             Interface (client)
  Explorer.tsx          Shell: layout, WebGL gate, status overlays, playback loop
  GlobeView.tsx         MapLibre lifecycle; mounts the Three.js layer (ssr:false)
  Timeline.tsx          Scrub / play-pause / step / speed
  TopBar.tsx            Wordmark + placeholder search
  Overlays.tsx          Loading / error / WebGL-unavailable states

map/                    Rendering modules
  mapStyle.ts           Painterly dark style + data source + base camera
  threeTestLayer.ts     Three.js ⇄ MapLibre custom layer (the integration)
  webglSupport.ts       WebGL 2 capability probe

lib/                    Pure utilities (no React/renderer deps)
  historicalDate.ts     Astronomical-year ↔ BCE/CE conversion & bounds
  geo.ts                Globe unit-sphere math, local frames, matrix lerp

state/
  explorationStore.ts   Zustand store: year, playback, speed, view (serializable)

scripts/
  sync-maplibre-worker.mjs   Copies MapLibre's worker into public/
```

### Historical dates

`lib/historicalDate.ts` is the single source of truth for years and uses
**astronomical year numbering** (there is a year zero), so arithmetic across the
BCE/CE boundary is continuous and off-by-one-free:

| astronomical | label      |
| -----------: | ---------- |
|       `-2999`| `3000 BCE` |
|          `-1`| `2 BCE`    |
|           `0`| `1 BCE`    |
|           `1`| `1 CE`     |
|        `2025`| `2025 CE`  |

JavaScript `Date` is deliberately **not** used for historical years — it can't
represent the pre-1 CE calendar we need.

### The Three.js ⇄ MapLibre integration (the important part)

`map/threeTestLayer.ts` is a MapLibre **custom layer** that renders Three.js
geometry into **MapLibre's own WebGL2 context and canvas** — no second canvas,
no independent animation loop. MapLibre calls its `render()` each frame while
the map moves; we do not call `triggerRepaint()` for the static marker, so there
is no perpetual render loop.

Anchoring respects MapLibre's globe projection exactly. Each frame MapLibre
provides a globe `mainMatrix` (projects a **unit sphere** to clip space), a
mercator `fallbackMatrix`, and a `projectionTransition` ∈ [0,1] that it uses to
cross-fade globe→mercator as you zoom in. We mirror that: we precompute a model
matrix for the marker on the unit sphere and at its mercator coordinate, form
the two full MVP matrices, and interpolate them by the transition. Because
matrix·vector is linear, `lerp(A,B,t)·p ≡ lerp(A·p, B·p, t)`, so the
interpolated matrix reproduces MapLibre's per-vertex blend and is exact at both
endpoints. Far-side geometry is culled using MapLibre's globe clipping-plane
data. The unit-sphere convention and `GLOBE_RADIUS` are taken directly from
MapLibre's globe vertex shader.

Lifecycle is handled safely: the layer creates one `THREE.WebGLRenderer` over
the shared context in `onAdd`, resets GL state each frame (`resetState()` +
`clearDepth()`), and disposes all geometries/materials and the renderer in
`onRemove`. `GlobeView` removes the map on unmount.

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
  only**. There is **no uptime, rate-limit, or availability guarantee**, and it
  is **not suitable for production traffic**.

**For production**, replace `GEO_SOURCE` in `map/mapStyle.ts` with self-hosted
tiles (e.g. Protomaps/PMTiles) or a commercial provider (MapTiler, Stadia, …).
Review each provider's terms, rate limits, and pricing before shipping — do not
assume any style or tile endpoint is free or unrestricted. The painterly styling
lives entirely in `map/mapStyle.ts` and is independent of the data source.

The MapLibre globe atmosphere/sky is configured in the style; no external
assets are fetched for it.

---

## Checks run

All run on this codebase and passing:

- `pnpm typecheck` — TypeScript strict, **no errors**.
- `pnpm lint` — ESLint (Next core-web-vitals + TS), **clean**.
- `pnpm build` — production build succeeds; `/` prerenders as static.
- **Headless browser integration test** (real Chrome, WebGL2 via SwiftShader),
  against both dev and the production build, verifying:
  globe loads with a full-viewport WebGL2 canvas; the Three.js beacon renders at
  the correct projected location of Giza; the beacon is culled on the far side
  of the globe; the marker stays anchored through rotate/zoom/tilt and the
  globe→mercator transition (up to zoom 11); and **zero console/page errors**
  across all interactions. The dev-only debug handle is confirmed stripped from
  the production bundle.

---

## Known limitations

- **Demo tiles only** (see above): low detail, max zoom 6, not production-grade.
- **Exaggerated marker scale.** The test marker is ~150 km tall — deliberately
  oversized so it reads as a beacon from orbital zoom. It is a geometry/anchoring
  proof, not final art; at street-level zoom it dominates the view. Real objects
  in later phases will use realistic, zoom-aware scales.
- **Projection blend is per-object, not per-vertex.** The globe↔mercator MVP
  blend is applied to the whole marker. For a compact object this is
  imperceptible and exact at both endpoints; a large object spanning the seam
  during the transition could differ slightly from MapLibre's per-vertex blend.
  A fully per-vertex-correct path would render through MapLibre's injected
  `projectTile` shader prelude (raw GLSL) instead of Three.js materials.
- **MapLibre worker is copied into `public/`.** MapLibre computes its worker URL
  from a runtime filename Turbopack can't bundle; the `predev`/`prebuild` copy
  step and `setWorkerUrl` work around this. If you change the maplibre-gl
  version, the copy refreshes automatically on the next build.
- **One-way camera sync.** User navigation is mirrored into shared state on
  `moveend`; state does not drive the camera back (avoids feedback loops). Full
  two-way sync is a later concern.

---

## Next step (Phase 2)

With the rendering foundation proven, Phase 2 should introduce the **historical
data layer**: a schema for time-bounded places/events, a small API + caching
layer, and wiring the timeline's year changes to fetch and display
evidence-backed features (settlements, then borders/trade routes) — reusing the
geo-anchoring proven here to place them on the globe.
