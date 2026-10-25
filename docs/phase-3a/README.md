# Phase 3A — environmental reference renderer

Implemented a worldwide, explicitly **provisional** biome reference, independently switchable environmental surfaces, modern reference hydrography, provenance, uncertainty and a year-selection interface. This is a rendering/data foundation, **not an ancient vegetation reconstruction**. No civilisation or political data was added; nothing was committed.

## Data evaluation and selection

Sources checked 25 October 2026. Licences below distinguish the dataset from its accompanying paper. A map resolution is not an accuracy claim.

| Source | Spatial coverage / resolution | Temporal coverage | Licence / attribution | Decision and uncertainty |
| --- | --- | --- | --- | --- |
| [ESA WorldCover](https://worldcover2021.esa.int/data/docs/WorldCover_PUM_V2.0.pdf) | Global, 10m, 11 observed classes; COG tiles, roughly 117GB classification product | 2020 v100 / 2021 v200 | CC BY 4.0; ESA WorldCover project + modified Copernicus Sentinel attribution | Evaluated as a technical example of classified raster delivery. **Not used**: observed fields, cities, clearance and wetlands cannot be projected back to 3000 BCE. No satellite imagery is loaded. |
| [RESOLVE Ecoregions 2017](https://ecoregions.world/) / [schema and terms](https://developers.google.com/earth-engine/datasets/catalog/RESOLVE_ECOREGIONS_2017) | Global regional ecological polygons: 846 named ecoregions, 14 biomes; not a fixed-resolution land-cover raster | 2017 biogeographic classification, not historical snapshots | CC BY 4.0. Dinerstein et al. (2017), [doi:10.1093/biosci/bix014](https://doi.org/10.1093/biosci/bix014). MANKIND simplification, regrouping and rasterisation identified in UI/manifest | **Selected as provisional ecological proxy**, not actual forest cover or palaeo-climate reconstruction. ArcGIS export has 847 records including unclassified Rock and Ice. Boundaries simplified to 0.025°, then rasterised; effective ecological accuracy is much coarser. No remaining-habitat/protection attributes used. |
| [Natural Earth physical vectors](https://www.naturalearthdata.com/downloads/50m-physical-vectors/) / [terms](https://www.naturalearthdata.com/about/terms-of-use/) | Global, cartographic 1:50m; 10m alternative exists | Contemporary generalised geography; individual features need independent historical review | Public domain; courtesy attribution Natural Earth. Repository tag v5.1.2 pins the downloaded files, not each theme's original release date | **Selected** major river courses and `Lake` polygons; excludes `Reservoir` and lake centerlines. No claim about ancient river migration or lake levels. Current coastlines remain the requested NE foundation. Modern glaciation vectors rejected as evidence of ancient extent. |
| [HYDE 3.2](https://essd.copernicus.org/articles/9/927/2017/) / [archive DOI](https://doi.org/10.17026/dans-25g-gez3) | Global 5 arc-minute population/crop/grazing estimates | 10,000 BCE–2015 CE, sparse early dates and denser recent dates | Paper CC BY 4.0; archive terms must be checked for the exact release before ingest (do not infer data terms from paper) | Deferred. Useful human land-use fractions, **not a natural biome map**. Early land allocation is modelled, not a survey. Do not convert every non-crop cell to forest. HYDE 3.3 not silently substituted. |
| [BIOME 6000, Harrison 2017](https://researchdata.reading.ac.uk/99/) | Global distribution of individual pollen sites, geographically uneven; point evidence, no continuous global grid | 0, 6, 21ka time slices | Dataset CC BY 4.0; Harrison, doi:10.17864/1947.99 | Deferred ingestion. A 6ka slice is approximately 4050 BCE when referenced to 1950, **not 3000 BCE**. Pollen types, chronology, spatial representativeness and sampling gaps must be preserved. Cannot draw precise global polygons around sparse sites without another justified model. |
| [European REVEALS, Githumbi et al. 2022](https://essd.copernicus.org/articles/14/1581/2022/) / [Fyfe et al. data](https://doi.pangaea.de/10.1594/PANGAEA.937075) | Europe and parts of east Mediterranean–Black Sea–Caspian corridor; 1° grid, 1128 pollen records | Holocene 11.7ka to present, 25 time windows | Dataset and paper CC BY 4.0; credit Fyfe et al. and Githumbi et al. | Strong Phase 3B candidate: fractions and standard errors, not high-resolution woodland boundaries. Quality varies by site number/type. Does not cover global deserts/tropics. Select an actual window enclosing ~4949 BP for 3000 BCE, not a misleading 6ka snapshot. |
| [PMIP4 mid-Holocene protocol, Otto-Bliesner et al. 2017](https://gmd.copernicus.org/articles/10/3979/2017/) | Global climate model grids, model-dependent, commonly much coarser than regional maps | Mid-Holocene 6ka experiment, plus separate last-interglacial experiment | Protocol paper CC BY 4.0; model output licences vary by institution/experiment and must be retained | Evaluated published Holocene climate modelling. Climate fields are not vegetation observations; vegetation may be prescribed. Do not label a 6ka climate simulation a 3000 BCE land-cover reconstruction. A model-derived biome product would require a documented transfer model and validation. |
| [SAGE potential vegetation, Ramankutty & Foley 1999](https://sage.nelson.wisc.edu/data-and-models/datasets/global-potential-vegetation-dataset/) / [PNVmaps](https://github.com/Envirometrix/PNVmaps) | SAGE global 5′ and 0.5°; PNVmaps offers 250m/1km model products | Potential vegetation under reference climate; PNVmaps also future scenarios | SAGE page does not clearly specify a reusable data licence; PNVmaps 1km release states ODbL 1.0, release-specific terms apply | Evaluated alternatives; not used. Removing human land use does not reconstruct ancient climate. Avoid adopting a fine-looking prediction as ancient ground truth. |

The global fallback is deliberately provisional everywhere; it has **unknown historical validity**, not a fictitious start/end date. The visible warning persists when the selected year changes. The Sahara/African Humid Period transition, Mediterranean clearance, Mesopotamian marshes, lake levels, river migration and small islands have particularly large gaps. Tundra, unclassified areas and Rock and Ice retain neutral terrain. No global ice/snow reconstruction is claimed.

## Rendering and classification

- `classification.mjs` maps source biome codes to forest (1–6), grassland/savanna (7,8,10), flooded grassland/mangrove (9,14), Mediterranean woodland/scrub (12), and desert/xeric regions (13). Tundra (11), unknown codes and Rock and Ice are neutral. These are regional ecological groupings, not uniform land cover inside each region. Wetlands do **not** include every marsh. Xeric regions can contain local woodland; savannas can contain trees.
- Colours, opacity, labels and decorative texture are in `styles.json`, separate from geographic classification. Canopy dots, grass strokes, sand curves and marsh marks are deterministic decoration clipped to sourced polygons. No random biome placement, elevation classification or satellite-photo texture.
- Offline SVG rasterisation yields separate **512px transparent XYZ PNG** pyramids, z0–4. At z4 pixel spacing is about 4.9km at the equator, finer toward the poles; this is display sampling, not palaeoenvironmental accuracy. Lower zooms are independently rasterised. MapLibre linearly samples the image edges and overzooms after z4. Texture is coarse when very close; detailed regional assets are future work.
- Hydrography is sourced as vectors but **delivered as a separate raster overlay**. This consciously avoids the known terrain-draped MapLibre line geometry path. Rivers follow NE coordinates on the unchanged terrain surface, with cartographically exaggerated widths. Lakes use the same water colour. No new water geometry changes terrain height; steep/high-elevation water still inherits the terrain's approximation.
- Drawing order: existing land → independent environmental raster surfaces → **unchanged** relief and hillshade → existing NE ocean mask → graticule/coastline/Three.js. NE ocean masks all terrestrial styling. At regional zoom, the finer base is inserted below environment-forest. This is only a layer-order adjustment; the existing 50m/10m thresholds, atomic handoff, coastline meshes and DEM z0–4 are unchanged.
- This avoids loading any global environmental GeoJSON into the browser. A pure vector approach would require transmitting/tessellating complex ecological polygons. Raster delivery bounds geometry cost and avoids river draping streaks. A future hybrid may add tiled vector evidence/interactive features for wetlands and rivers; current vector-source inputs are retained offline.

## Historical interface

`getEnvironmentForYear(year)` returns `reference-v1`, `reconstructed: false`, requested year, warning and layer records. Each record holds a feature/tile identifier, classification, geometry or raster URL template, source/version/licence, temporal basis, optional validity, spatial/temporal uncertainty and style key. **Null validity means unknown.** A stable state ID denotes immutable content.

`EnvironmentRenderer.setState()` does nothing if the state ID has not changed. A different ID replaces only environment sources/layers, including native zoom metadata, respecting visibility choices. It never calls `setStyle`, `setTerrain`, camera APIs or the Three.js geometry pipeline. Phase 3B can return a period-specific catalogue with a new ID and actual validity/uncertainty, without rebuilding MapLibre or elevation. No interpolation or inferred snapshots are implemented. The feature record is a future adapter contract; the implemented rendering adapter is raster.

## Preparation, storage and deployment

```sh
pnpm environment:prepare
# Reproduce without network using cached source bytes:
pnpm environment:prepare --offline
pnpm environment:test
pnpm dev
```

Preparation uses existing Node/Sharp dependencies. Inputs are cached in `.cache/environment/` (about 21.3MiB); output is `public/geo/environment/reference-v1/`. Both are ignored by Git. Source SHA-256 values are checked before processing; ArcGIS is mutable, so a changed export fails closed and requires a reviewed version/checksum update. Archive the matching cache or prepared output for future reproduction. No downloads/preparation are attached to `pnpm build`.

The measured full pyramid contains **2,046 PNG tiles, 9,563,531 bytes (9.12MiB)**, plus a small manifest. A z0–2 proof of concept was prepared first: 126 tiles, 1,362,874 bytes. The checked-in manifest records source URLs, hashes, feature counts, licences and exact output sizes. Runtime does not need ArcGIS, Earth Engine, an API key, backend or R2 account.

For deployment, **supply the prepared assets**: copy this directory into the static deployment input, or upload the versioned directory to any static host and set `NEXT_PUBLIC_ENVIRONMENT_ASSET_BASE` to its parent (for example `https://assets.example.com/environment`) before building the frontend. R2 is optional. Configure CORS for cross-origin tiles and immutable caching for versioned URLs. A fresh Git checkout alone does not contain the ignored pyramid: a Git-connected Vercel deployment needs a separate asset retrieval/release step or an external static URL. Never run expensive geographic preparation implicitly during a frontend build. No external assets have been uploaded or deployed by this task.

Vercel Hobby/GitHub Free remain sufficient for the code and frontend. Bandwidth scales with visible tiles; six independent raster sources trade a few extra small requests/draws for independent layer control. Invisible layers stop requesting new tiles; no annual texture uploads or terrain rebuilds. Browser caching handles revisits. At world zoom a few tiles per class load, not the whole 9.12MiB pyramid. PMTiles is compatible with this XYZ raster contract via a future registered protocol/TileJSON adapter; it is **not implemented** or required now.

## Changed files

| Files | Purpose |
| --- | --- |
| `map/environment/{model.ts,catalog.ts}` | Typed records, source provenance/uncertainty, year baseline and configurable asset root |
| `map/environment/{classification.mjs,styles.json}` | Independent scientific class grouping and presentation |
| `map/environment/renderer.ts` | Independent tiled source/layer lifecycle; identical-year-state short circuit |
| `state/environmentStore.ts`, `components/EnvironmentPanel.tsx` | Independent toggles, persistent uncertainty notice, evidence/attribution and unavailable-tile notice |
| `components/{GlobeView,Explorer}.tsx` | Lifecycle, year/store subscriptions and panel placement |
| `map/regionalGeo.ts` | Insert regional base below environmental surfaces; no coastline/LOD changes |
| `scripts/{prepare-environment,test-environment}.mjs`, `package.json` | Offline reproducible tile generation and focused lifecycle tests |
| `.gitignore` | Exclude generated datasets/cache |
| `docs/phase-3a/` | Evaluation, asset manifest, verification and screenshots |

## Verification and remaining work

`pnpm environment:test` checks known/unknown classes, null validity, independent visibility, **5,024 successive timeline years with zero source mutations**, and a replacement catalogue/native zoom while retaining hidden-layer choices. Type checking and linting pass. Production build passes with `pnpm build --webpack`, emitting static routes. Default Turbopack build was attempted twice (including outside the sandbox) and failed at its existing CSS worker with `binding to a port: Operation not permitted`; no application configuration was changed to conceal that environment restriction.

Screenshots: [original world](before-world.png), [environment world](after-world.png). Same-camera Aegean comparison at zoom 5.4 / pitch 45°: [neutral environment off](before-aegean.png) and [environment on](after-aegean.png). [Africa](after-africa.png) shows grassland, forest, desert, wetlands and water in one view. The temporary QA camera was restored to the original default after capture. The fine coastline handoff, small islands and relief remained visible, with no new ocean wedges or river draping streaks seen in this view. World views show ecological variation, source-based rivers and lake colour, original relief/lighting, and a clean dark ocean. This is visual smoke testing, not a quantified cross-device FPS benchmark.

Phase 3B: ingest and validate period-specific reconstructions (REVEALS/BIOME 6000 plus carefully modelled gap filling), retain fractional cover and quality, incorporate HYDE human impacts, model Sahara change/clearance, historical rivers/lake levels/marshes, and publish scientifically supported ice/snow extents. Temporal interpolation, higher DEM resolution, new coastline LOD, PMTiles packaging, tree instancing and politics remain out of scope. Broad ecological zones cannot establish precise ancient forest edges, local marsh extent or small-channel geography.

Prepared deployment archive: `.cache/environment/mankind-environment-reference-v1.tar.gz` (7.3MiB, ignored). Extract under `public/geo/environment/`, or publish its `reference-v1` directory on a static host.
