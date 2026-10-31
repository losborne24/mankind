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

## On the map

* **Far:** the buildings are crisp flat footprints from zoom 9 to 13.8, not a glow. The neighbourhood's lots draw the same way, so
  the city reads by its lots thinning out.
* **Near:** from zoom 13 they stand as one extrusion each (roof-tile colours, vertical gradient). MapLibre batches them per tile,
  so draw calls stay a handful whatever the count.
* **Ground layers:** field strips at 0.4–0.5 opacity, and the roads.
* **Handing over to the lit 3D scene:** the flat layers give way to its ground, roads only within its 720 m disc. The extrusions
  stay, because they are kept clear of what the scene draws.
* **Loading:** the fill is generated once, after the first frame (about 0.4 s), and handed to MapLibre as a blob URL, so its worker
  holds the data and the page does not keep a second copy.
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

## Known gaps

* **Monumental zones are left open.** The Campus Martius, the Capitoline and the Fora read as open ground, which they were not.
  Landmark massing (porticoes, temples, the Theatre of Marcellus) would fill them, but it was not part of this stage.
* **The block grid is generic.** The warp keeps it from being a straight grid, but it is no reconstruction of the Severan plan's streets.
* **Simpler roofs.** Each fill lot is one extrusion with a flat top. The neighbourhood's lots have stepped roofs, and the difference
  shows close in (the river-crossing beat).
* **One river margin.** The field strips' crops, the tomb sizes and the villa layout are generic. Floodplain ground keeps strips
  where the field allows.
