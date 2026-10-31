# Rome c. AD 100 · zoned fill (Stage 3)

`lib/scenarios/romeFill.ts` generates every building, tomb, aqueduct pier and field strip beyond the Forum Boarium
neighbourhood. `map/romeFillOverlay.ts` draws them, and `scripts/check-rome-fill.mjs` checks them. `scripts/context/rome/plot-fill.mjs`
writes the review plans in `docs/previews/rome-fill`.

**None of it is placed from a source.** The fill follows sourced layers:

* the zoning (`ZONING.md`);
* the suburban density field (Mapterhorn elevation for the floodplain and slopes);
* the consular roads and aqueduct lines from OpenStreetMap.

Everything it adds is a best guess. It hides with "Show best guesses" and shows only around AD 100 (±25 years, like the
neighbourhood's guessed lots).

## Rules

* **Deterministic.** Every choice is a hash of a position or index, not a running random sequence, so a change in one place does not
  reshuffle the rest. The check runs the generator in a second process and compares digests.
* **Kept clear.**
  * **Neighbourhood:** the fill stays out of the footprint of everything the Forum Boarium neighbourhood models, closed (grown by
    60 m, shrunk by 40 m) so its lanes and square are kept out with it.
  * **Monumental, open ground and rivers:** nothing is generated in any of them, and a 20 m margin is left round them.
  * **Roads and aqueducts:** lots keep 7 m off the sourced roads and 4 m off the aqueducts.
  * **Straight links to the gates:** the illustrative ones are not streets, so the lanes are not cut along them.
* **City blocks.**
  * **Grid:** columns and rows about 64 × 50 m, each line jittered (blocks vary from about 50 to 78 m), then the whole grid is bent by
    a three-octave smooth warp (up to about 70 m). Lanes curve, and no straight avenue runs across the city. A 4.5 m lane runs between
    blocks, with an 8 m street every fourth row and column.
  * **Quarters (v5.20.0):** each piece of a residential zone inside the city has its own grid, turned to the grain of the sourced lines
    about it: the Via Lata, the Tiber bank and the axes of the mapped monuments (`LANDMARKS.md`), each weighted by its length over
    (distance + 100 m)², averaged as directions modulo 90°. The Campus quarter runs with the Via Lata, the Subura with the Imperial Fora,
    the riverside quarters with the bank. A quarter's lots stay inside it, so quarters meet along a seam, as Rome's differently turned
    districts did. The port, the horti and the houses beyond the city share one grid turned 12°.
  * **Lots:** each block is lined with attached lots round a courtyard, 9–17 m wide and 12–13 m deep. Elite houses and horti get
    20–30 m lots; port blocks get warehouses of 26–48 m.
* **Which lots stand.**
  * **Inside the continuous city:** a draw against the zone's density (core 1, Trastevere and hills 0.6, roadside 0.45, elite 0.35),
    times a taper from 0.55 at the edge of the continuous city to 1 at 300 m inside it.
  * **Outside it:** 0.4 × the density field (smoothstep from 0.3 to 1, power 1.4), so building runs out along the roads and thins
    with distance. The check confirms there is no step at the edge.
  * **Horti:** villas at 0.1.
  * **Port:** warehouses at 0.75.
* **Heights.** Core insulae 3–5 storeys, hills and Trastevere 2–4, roadside and elite 1–2, lower towards the edge. At most 16.8 m, under
  the limit of about 17.75 m (60 Roman feet). Warehouses are 8–10 m; villas are 4.5–8 m.
* **Suburbium.**
  * **Villas:** one chance per 220 m cell, 0.6 × the field (smoothstep 0.12–0.7), and 0.55 in the zoned horti. Each is a 24–34 ×
    30–40 m main block with up to two outbuildings.
  * **Tombs:** both sides of every consular road beyond the continuous city, every 30 m with a chance of 0.1 + 0.6 × the field. In
    the Appia's tomb zone they come every 13 m at 0.85. The Vatican necropolis is packed on a 16 m grid.
  * **Tomb of Caecilia Metella:** a 24-sided drum, 29.5 m across and 11 m high, on its Pleiades point. Its size is from Wikipedia;
    its height is a guess.
* **Aqueducts: one kit piece.** A pier (2.4 m along the line, 3.2 m across) and the 6.6 m channel span it carries, repeated along the
  Aqua Claudia arches (documented), the hand-drawn route to Porta Maggiore (approximate) and the Arcus Neroniani (illustrative).
  Channel tops swell and sink between about 9 and 20 m (11 m for the Arcus Neroniani). Span, size and height are guesses.
* **Field strips.** Farm blocks of 360 m, turned per 1,080 m tract (±25°), split into 3–6 strips with 10 m tracks between them; a
  quarter are left as open pasture. They go only where the field is at most 0.32, off water, outside the continuous city and every
  named zone.

* **Landmarks (v5.20.0).** The monumental zones carry simple reconstructions of their monuments, placed from the mapped remains,
  Pleiades and published sizes: see `LANDMARKS.md`. Lots keep the same 20 m margin from them as from the zones. Each landmark is
  cleared whole, as the hull of its pieces (v5.21.0): a precinct's court counts as the monument's ground, and a portico thinner than
  the 20 m cell is not missed (one lot had stood in the Porticus Divorum's wall).

## On the map

* **Far:** the buildings are crisp flat footprints from zoom 9 to 13.8, not a glow. The neighbourhood's lots draw the same way, so
  the city reads by its lots thinning out.
* **Near:** from zoom 13 they stand as one extrusion each (roof-tile colours, vertical gradient). MapLibre batches them per tile,
  so draw calls stay a handful whatever the count.
* **Close (v5.20.0):** from zoom 15 the lots' walls turn to plaster and they take the neighbourhood's stepped gable: a slab over the
  whole lot, then two narrower bands along its length, the same rise as `massingFeatures`. Roofs on every lot would triple the data
  handed to the map (6.7 to 19.4 MB), so they are built only for the lots within 1.5 km of the view's centre, again once it has moved
  500 m, from a compact table of the lots (about 1 MB), and handed over as a blob URL like the rest. Beyond 1.5 km at zoom 15 a lot is
  a few pixels across. At 3 km the roof data cost about 23 MB more heap at the close-up (see below).
* **Ground layers:** field strips at 0.4–0.5 opacity, and the roads.
* **Handing over to the lit 3D scene:** the flat layers give way to its ground, roads only within its 720 m disc. The extrusions
  stay, because they are kept clear of what the scene draws.
* **Loading:** the fill is generated once, after the first frame (about 0.6 s), and handed to MapLibre as a blob URL, so the page
  never holds the collection and its JSON text at once. Correction (v5.20.0): MapLibre 6.15 sends data loaded from a URL back to the
  page as the source's copy, so one copy of the features does stay on the main thread; the blob URL saves the second.
* **Removed:** the terracotta heatmap (`reconstruction-city-roofscape`), the "orange haze", and the neighbourhood's edge feathering
  (lower, ground-tinted lots at its rim). The fill now carries the city on past that edge.

## Measured (docs/previews/rome-fill/performance.json)

Dev build, 2048×1536 canvas, frames forced and timed through `gl.finish()`, journey paused:

| View | Median frame | p95 | Draw calls | GPU buffers | JS heap (settled) |
| --- | --- | --- | --- | --- | --- |
| Overview z14.7 · before | 1.9 ms | 4.0 ms | 53 | 21.2 MB | 81.2 MB |
| Overview z14.7 · after | 1.8 ms | 3.5 ms | 67 | 30.0 MB | 98.1 MB |
| Regional z12.6 · before | 1.0 ms | 1.7 ms | 24 | 16.9 MB | – |
| Regional z12.6 · after | 1.1 ms | 2.8 ms | 16 | 33.3 MB | – |
| Close-up z18.3 · before | 3.6 ms | 4.7 ms | 68 | 38.4 MB | 117.7 MB |
| Close-up z18.3 · after | 4.0 ms | 4.8 ms | 78 | 51.3 MB | 140.7 MB |

### v5.20.0 (landmarks, quarters, close-in roofs), against v5.19.0 measured the same day in the same tree

| View | Median frame | p95 | Draw calls | GPU buffers | JS heap (settled) |
| --- | --- | --- | --- | --- | --- |
| Overview z14.7 · v5.19.0 | 2.4 ms | 4.4 ms | 67 | 30.0 MB | 99.6 MB |
| Overview z14.7 · v5.20.0 | 1.8 ms | 3.2 ms | 67 | 32.3 MB | 97.5 MB |
| Regional z12.6 · v5.19.0 | 1.2 ms | 2.2 ms | 16 | 33.3 MB | – |
| Regional z12.6 · v5.20.0 | 1.0 ms | 3.3 ms | 16 | 35.7 MB | – |
| Close-up z18.3 · v5.19.0 | 3.9 ms | 4.9 ms | 78 | 48.8 MB | 147.2 MB |
| Close-up z18.3 · v5.20.0 | 3.5 ms | 4.8 ms | 80 | 52.2 MB | 159.9 MB |

The close-up's extra heap is the roof data (22,413 slabs). Single runs: frame times vary by a few tenths of a millisecond between runs.

## Known gaps

* **Landmarks are kit shapes.** The monumental zones now carry simple reconstructions (v5.20.0), placeholders until assets are made;
  the Campus gaps are filled from traced plans (v5.21.0), and the northern Campus is left open, as it was (`LANDMARKS.md`).
* **The block grid is still generic.** Each quarter now runs with the grain of the sourced lines about it, but the lanes themselves
  are no reconstruction of the Severan plan's streets: inside the city the only sourced street is the Via Lata (the other road
  entries are straight illustrative links to the gates), so there is nothing more to follow without tracing a plan.
* **Roofs only close in.** Below zoom 15, and beyond 1.5 km of the view, lots keep their flat tops.
* **One river margin.** The field strips' crops, the tomb sizes and the villa layout are generic. Floodplain ground keeps strips
  where the field allows.
