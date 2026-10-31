# Forum Boarium · best-guess neighbourhood (Rome, c. AD 100)

Research notes and rules behind `build-reconstruction.mjs`, which writes
`lib/scenarios/fixtures/forum-boarium-reconstruction.json` (seed 100, byte-for-byte reproducible).
Checked by `node scripts/check-reconstruction.mjs`.

The aim, from the demo spec: show what the place **probably** looked like in AD 100, with every object marked
**documented**, **evidence-based** or **best guess**, a one-line note saying what it rests on, and sources.
Nothing here is a survey. The scene is an editorial AD 100 preview.

## 1. Sources, licences and what was actually used

| Source | Licence / terms (checked 30 Oct 2026) | Used for geometry? | Used for |
| --- | --- | --- | --- |
| OpenStreetMap, Pleiades, Wikidata snapshots already in `data/history/forum-boarium/source` | ODbL · CC BY 3.0 · CC0 | Yes (modern outlines, labelled as such) | Tiber bank, Forum Boarium site outline, temple footprints, Ponte Rotto arch, Cloaca outlet, Ara Maxima and Portus Tiberinus points |
| Platner & Ashby, *A Topographical Dictionary of Ancient Rome* (1929), Forum Boarium entry, via LacusCurtius | Public domain (published 1929) | No (text only) | Extent of the market; the road from the bridge towards the Velabrum; Vicus Iugarius and Vicus Tuscus as routes into it; temples and altar listed; porticoed streets |
| Wikipedia: Forum Boarium, Pons Aemilius, Great Altar of Hercules, Insula, Horrea; it.Wikipedia Porto tiberino | CC BY-SA 4.0 | No (text only, short facts) | Bridge dates (179/151 BC) and seven spans (not kept: see Part 5); altar tentatively under Santa Maria in Cosmedin; harbour 6th century BC to at least the Flavian period; typical shops, flats and warehouses; height limits of 70 then 60 Roman feet |
| Lanciani, *Forma Urbis Romae* (1893–1901), **plate 28** (Isola Tiberina) | Public domain (published 1901; author died 1929). Scan: Wikimedia Commons `Rodolfo_Lanciani_-_Forma_Urbis_Romae_-_Tavola_28.jpg`, tagged public domain (David Rumsey / Edizioni Quasar facsimile) | **Yes, since Pass D**: positions read off by hand (see below); the scan is not shipped | Ancient east bank, Pons Aemilius piers, Cloaca Maxima and Cloaca Circi Maximi lines, the basalt-paved street, the Statio Annonae site |
| Stanford Digital Forma Urbis Romae Project (Severan Marble Plan fragments) | Site notice: text and images may be copied "only for research and personal use"; the Comune di Roma owns the 1960 photographs; a licence is needed for the 3D archive | **No** | Not usable: those terms do not allow redistributing derived geometry in a shipped app. Reference only |
| *Mapping Augustan Rome* (Haselberger, Romano 2002, JRA Supplement 50) | Copyrighted printed book; no open data licence found | **No** | Reference only: the project did not use its map or gazetteer geometry |

Result (updated in Pass D): **the only third-party geometry is the OpenStreetMap/Pleiades/Wikidata snapshots and positions I read by hand off Lanciani's public-domain plate 28.** Every other position is derived by rules in the generator. The Severan plan and *Mapping Augustan Rome* are the right
next references for a scholar's review (see §5) but could not be adopted here without a licence that allows it.

## 2. What is documented, evidence-based, best guess

| Class | Objects | Basis |
| --- | --- | --- |
| **Documented** (2) | Temple of Portunus, Temple of Hercules Victor | Standing buildings; footprints are modern outlines; models carry their own evidence cards |
| **Evidence-based** (3) | Pons Aemilius · Ara Maxima · road from the bridge | Bridge: position from the surviving Ponte Rotto arch (two piers fixed), stone from Wikipedia, deck, arches and other piers guessed; the west spans and abutment are a best guess (Part 5). Altar: placed at Pleiades' derived point, tentative platform under Santa Maria in Cosmedin; size and steps guessed. Road: Platner records a road from the bridge to the Velabrum; its line is bent around Portunus by guess |
| **Best guess** (172) | River quays (2) · landing stages (8) · barges (6) · open square · cattle pens (2) · stalls (16) · streets (4) · shops (94) · blocks of flats (35) · warehouses (4) | Plausible for a Roman river market district; each note says what it is based on and what is invented |

The best-guess share is shown live in the legend (area-weighted over the mapped objects in view), with a switch that
hides every best-guess object in the 3D scene and on the map, and a colour-by-certainty option.

## 3. Rules the generator follows

* **Frame.** Metres east and south of the temple-pair layout origin, as in the scene definition.
* **River.** East bank = today's Tiber outline (OpenStreetMap), smoothed. It is an approximation of the ancient bank, not its course (the embankments date from 1876).
* **Bridge.** Axis through the Ponte Rotto fragment; piers at its two surviving pier positions, the rest spread to meet the banks (superseded by Pass D and Part 5).
* **Quays and stages.** Stone river wall along the east bank with a riverside road behind; eight timber landing stages upstream of the bridge where the Portus Tiberinus point lies (about 1 km precision), spaced 24 m. Barges moored beside stages.
* **Square.** The present site outline widened by 8 m; kept free of buildings, with stalls and two pens inside.
* **Streets.** Four routes named by Platner (bridge road, Vicus Iugarius, Vicus Tuscus, road to the Circus Maximus valley) plus the quay road; lines guessed.
* **Frontage.** Shops (5.2–7.2 m wide, two storeys) near the square, blocks of flats (10–19 m wide, 3–4 storeys, at most 14 m, under the Roman limit of about 17.75 m) further out, warehouses (two storeys, thick-walled) behind the north quay. Attached side by side along both sides of each street, with a back row; a 2 m occupancy grid and a rectangle-overlap test keep them off water, streets, temples, the square, the altar and the church site.
* **Kept empty.** The footprint of Santa Maria in Cosmedin and the Arch of Janus site: both post-date AD 100, and what stood under them is not guessed.
* **Date.** Every guessed object is dated to AD 100 only (±25 years); sourced objects carry their own ranges. The date filter still leaves out the Arch of Janus (from AD 300) and Santa Maria in Cosmedin (from AD 501); `check-context-layers.mjs` asserts it.
* **Seed.** 100. Same inputs, same output.

## 4. Why not the Roman kit and procedural settlement generator

The Phase 3 generator and kit make detached, single-storey, one-per-plot buildings, each with its own foundation, and
cannot express attached two-to-four-storey frontage, quays, bridges or barges. Rather than force them, the neighbourhood
uses the same ideas (seeded layout, terrain-conforming bases, instanced meshes, the kit's plaster and tile palette, the
2 m support grid) in `map/settlements/UrbanScene.ts`, kept to two instanced draws for buildings and a few merged meshes for
everything else. The kit's detached houses were deliberately not used: they would also have bypassed the best-guess switch.
Procedural walls and roofs are generic; they are not Roman building types reconstructed from a plan.

## 5. Known gaps and what a specialist should review

* Nothing here knows the real street plan; the Severan Marble Plan and Lanciani's sheets, once licensed or re-traced by hand from public-domain scans, are the best correction.
* The modern bank may differ from the ancient one by tens of metres; every quay, stage and barge inherits that.
* The 1809–10 lowering of the ground around the temples (Wikipedia, Temple of Hercules Victor) means the ancient ground level near them may have been different; this scene uses today's terrain.
* Heights, storeys and facade patterns are typical, not recorded.
* The Cloaca Maxima outlet, Portus Tiberinus and Ara Maxima remain markers of limited accuracy.


# Pass C · city, landmarks and streets (v5.8.0)

Pass B read as a village: detached-looking two-storey shops along a few roads, with fields between. Pass C changes the character, not the
certainty rules. Data: `lib/scenarios/fixtures/forum-boarium-reconstruction.json` (now compact: `lots`, `lanes`, `courts` rows expanded by
`lib/history/reconstructionHydrate.ts`). Sources fetched by `fetch-landmark-sources.mjs` into `data/history/forum-boarium/source/{osm,pleiades}-landmarks.json`.

## Landmarks (evidence-based massing)

| Object | Position and size from | Massing (guessed) |
| --- | --- | --- |
| Circus Maximus | OpenStreetMap relation 11384819 (site outline): axis and centre fitted by smallest enclosing rectangle (axis 37° south of east, centre E 404 / S 350 m); 621 m by 118 m (Wikipedia) | three tiers of stands 30 m deep, 24 m outer wall, sand track graded to the highest ground across each section, central barrier with Augustus's obelisk, gate block. Trajan's stone rebuilding began just after AD 100 |
| Domus Flavia | OSM relation 1857984 (surviving walls), smallest rectangle (151 × 101 m); completed c. AD 92 (Pleiades 564783056); walls about 16 m, hall over 30 m (Wikipedia) | wings 18 m round an open court, two halls (31 m and 26 m) |
| Domus Augustana | OSM relation 1805347 (225 × 86 m); Pleiades 792237246; curved exedra facing the circus (Wikipedia) | wings 17 m, exedra 13 m on the side facing the circus |
| Domus Tiberiana | OSM relation 1860920 (219 × 120 m; Wikipedia says about 150 × 120 m) | ring 20 m round a court on a terraced platform |

Each wing stands on a platform that follows the slope (top at the highest ground under it, base 4 m below the lowest).

## Streets

Radial spokes are gone. Where a source maps a street the mapped line is **evidence-based**; where the line is drawn along a modern street in the same valley it is a **best guess** and says so.

| Street | Certainty | Basis |
| --- | --- | --- |
| Vicus Tuscus · Forum end | evidence-based | OSM way 998877106, Pleiades 380281017 |
| Vicus Tuscus · through the Velabrum to the market | best guess | route from Pleiades/Wikipedia (Forum, western flank of the Palatine, Velabrum, Forum Boarium, processions to the Circus); line along today's Via di San Teodoro and Via del Velabro |
| Vicus Iugarius · Forum end | evidence-based | OSM way 1000529940, Pleiades 889101791 |
| Vicus Iugarius · foot of the Capitoline to the market | best guess | Platner; line along Via della Consolazione and Via del Velabro |
| Clivus Victoriae | evidence-based | OSM way 132682585, Pleiades 668537796 |
| Road from the bridge to the Velabrum | evidence-based | Platner (unchanged) |
| Road to the Circus Maximus | best guess | Platner/Wikipedia: the market opened towards the starting gates; line along Via dei Cerchi |
| Riverside road, road west of the bridge, 119 back lanes | best guess | generator |

Lanes are laid out in five district grids (market, Velabrum, circus side, two on the west bank) aligned to the valley, the river and the circus.
They are narrow (3.4–4.3 m) and appear only where lots stand beside them.

## The city

Attached blocks (insulae with ground-floor tabernae, flats, shop-houses) of 2–5 storeys (at most 16.8 m, under the 17.75 m limit) fill the blocks between lanes,
leaving courtyards; lots touch exactly (party walls) with an occasional 2–3 m passage; 1,732 buildings. Storeys are capped near the temples (2 within 75 m, 3 within 120 m,
4 within 170 m) so they stay readable. Warehouses stay along the river (north quay and a shorter south row). No Roman-kit buildings are used.
The urban region is bounded by the river, the Palatine foot (Via di San Teodoro line), the Capitoline slope, the circus and palace keep-outs,
and a 640 m radius: it is about half a square kilometre, not the whole city, and ends abruptly at its edge.

## Known gaps

* The Theatre of Marcellus, Forum Holitorium, Tiber Island and the Capitoline temples are not modelled; the north of the area is empty.
* Block sizes, lane widths and street grids are generic; Roman districts were less regular than these grids.
* Palace and circus heights are typical, not recorded; the circus's stands are cleaner than the partly timber AD 100 original.


# Pass D · a period survey and a flexible date (v5.9.0)

## Date policy: snap to the evidence

The scene is still labelled AD 100, but an object is no longer forced to be dated to AD 100 exactly. Where the best evidence is undated or comes from a nearby
date, the object keeps its real date range and carries a `snap` note, shown in the inspector under **Date ·**, saying why it appears at AD 100. Nothing that
began after AD 100 is added (the Arcus Argentariorum of AD 204 and everything on the Severan Marble Plan stay out); the check still enforces this.
The Severan plan itself was not used: Stanford's terms do not allow redistributing derived geometry.

## What was read from Lanciani's plate 28

Method: the plate was fitted to the scene frame on three points (the Temple of Portunus outline, the Round Temple, the Ponte Rotto arch); residuals 1.3–3 m.
Everything below was then read by hand against a 10 m grid drawn over the scan, so positions are good to **about 3–5 m**. The Round Temple's outline in
OpenStreetMap sits about 4 m from where Lanciani draws it; no correction was applied.

| Object | Certainty | What was read | Date |
| --- | --- | --- | --- |
| Ancient east bank | evidence-based | The riverfront Lanciani surveyed before the embankments (from 1876): the excavated wall he labels RIPA from S 0 to S 123 m, and the pre-embankment shore from S −200 to S −20 and S 130 to S 160. It lies **10 to 30 m east** of today's OpenStreetMap bank, so the ancient river was wider. The strip is drawn as water and the ground there is cut down to the river bed | wall undated on the plate; taken as standing at AD 100 |
| Tiber quay wall | evidence-based | S −10 to S 123, on that line; height, facing and steps guessed | as above (`snap`) |
| Pons Aemilius piers | evidence-based | Four piers as drawn (E −154.5, −137.5, −121.4, −98.6 m); the east piers spaced evenly to the bank. Eight piers, seven spans (extended to the west bank in Part 5) | AD 100 |
| Cloaca Maxima, Cloaca Circi Maximi | evidence-based | Courses from the river wall to the edge of the plate; vaulted in the market, so map-only (kind `drain`) | Republican origin |
| Basalt-paved street and a paved cross street | evidence-based | A 9 m wide street excavated in 1873, running from the Forum Holitorium side to the market; Lanciani calls it the Vicus Iugarius (likely, not certain) | undated paving; taken as in place by AD 100 (`snap`) |
| Statio Annonae | evidence-based | Placed on the Santa Maria in Cosmedin site where Lanciani draws it; walls, roof, heights are massing | shown from about AD 100 within ±50 years (`snap`) |

Effects: the quays, stages and barges moved with the bank; the bridge got its real pier spacing; buildings keep 11 m off the ancient bank; the 1,732 lots
became 1,622 because the widened river took some plots.

## Bugs found on the way

* **Quays were mostly not drawn (since v5.7.0).** The quay builder skipped any segment where the coarse terrain sat below the shared river level, which was most of
  the north quay and the whole Forum Boarium frontage. The terrain model puts the Tiber bed at about 16–19 m and the bank lower still. Walls are now at least their
  own height and stand 1.6 m above the river wherever the terrain is lower.
* The label of the Cloaca Maxima still comes from today's OpenStreetMap outlet point, which is now in the river 15 m west of the ancient mouth. Not moved: it is a
  sourced modern datum.

## Part 2 (v5.10.0): the north of the market, from the same plate

| Object | Certainty | What was read | Date |
| --- | --- | --- | --- |
| Theatre of Marcellus | evidence-based | Centre (E −115, S −269) and outer radius (61 m) from a circle fitted to nine points on the plate's outer arcade (residuals under 3 m); the half-ring opens north. Wikipedia gives a diameter of 111 m, the plate reads about 122 m; the plate's figure is used. The surviving arcade in OpenStreetMap lies on the plate's arc to within a few metres. Three arcade storeys (28 m), the seating bowl and the stage block are massing | finished 13 BC |
| Temples of Janus, Juno Sospita and Spes | evidence-based | Positions, tilt (13.5°, facing east) and sizes read from the plate; column counts from Wikipedia (6×8, 6×9, 6×11). Named by modern identification (north to south: Janus, Juno, Spes); Lanciani labelled them the other way round | republican; restored AD 17 |
| Porticus Minucia (as Lanciani placed it) | evidence-based | The pier field about 85 by 33 m with a wall along each long side. The name is his identification and later scholars place the porticoes of that name elsewhere, so the note says so | shown within ±50 years |
| Riverfront wall below the theatre | evidence-based | Extends the ancient bank north to S −260, along the wall Lanciani draws from the Pons Fabricius side (E −194 at S −255, E −143 at S −205), about 35 m east of today's bank at S −255 | undated |

## Part 3 (v5.11.0): Tiber Island and phone width

| Object | Certainty | What was read | Date |
| --- | --- | --- | --- |
| Pons Fabricius | evidence-based | Ends at E −178.5 / S −231.8 and E −217.5 / S −192.8, two arches and a central pier as drawn; it still stands | 62 BC |
| Pons Cestius | evidence-based | Island end E −256.5 / S −130.5 to the west bank E −288 / S −57, three spans as the piers are drawn; the present bridge is of 1892, the Roman one was rebuilt in AD 370 | about 46 BC |
| Temple of Aesculapius | evidence-based | Place read where Lanciani labels the excavated remains (E −190.5, S −127.5); orientation, size, column count and heights guessed | 3rd century BC |

* The bridge renderer got a second form (`skew-bridge`) that runs on any line; the original east–west form is unchanged for the Pons Aemilius.
* The Cloaca Maxima marker still sits at today's mapped mouth, now relabelled "(mouth today)", with a note that Lanciani puts the ancient mouth about 15 m east.
* **Phone width.** The journey card used to cover most of the map. While a journey plays it now has a "Hide details / Show details" toggle on narrow screens (`sm:hidden`); folded, only the title shows. Looked at in a 390×790 frame on the river crossing, the two temples and the exterior beats: the scene is visible with the card folded. The "Portunus" label still sits on the temple model.

Not modelled: the other Tiber Island buildings (Jupiter Jurarius and the Faunus temple on the island's neighbour), the Porticus Octaviae (OpenStreetMap has its site at E −198 to −175, S −398 to −378, beyond plate 28's top edge), and the Capitoline temples.

## Part 4 (v5.12.0): the city from the first beat, roofs at mid LOD

* **Low LOD.** `reconstruction-city-roofscape` is a heatmap of one point per lot, tinted terracotta and visible from zoom 7, so "Rome from above" shows a roofscape during the fly-in instead of one dot. It is feathered by construction (the heatmap falls off over about 60 m) and fades out by zoom 15.6 as the extruded blocks take over. At zoom 13 to 15.5 the blocks at the thin edge of the laid-out area (lots with few neighbours within about 60 m) are lower and blend toward the ground colour, so the patch no longer ends in a hard edge.
* **Basis, stated in the journey card:** "City roofscape: best guess, extent of the 1,619 generated lots around the mapped sites, not a survey of Rome in AD 100". The extent is where the generated layout stops. It is not the ancient built-up area, which was far larger. The certainty percentage line still appears from zoom 15.5, where it is computed from mapped areas.
* **Mid LOD roofs.** Each lot's massing is now wall plus a three-slab stepped gable (eave slab, mid slab, ridge strip) in the same tile palette as the 3D roofs, so the hand-over to the lit scene keeps the colours. Palace wings carry the palace roof colour. Same single `fill-extrusion` layer and source, three more polygons per lot.
* **Bridges at mid LOD.** `massingFeatures` draws a deck on pier blocks for the Pons Aemilius and the two skew bridges. No arches; those are the 3D scene's.
* **Cost.** `map.redraw()` plus a GL read-back, 55 repeats at a fixed camera on this Mac (median, ms): before / after at zoom 11.5, 13.2, 14.7, 15.6 = 5.0 / 5.2, 7.0 / 5.1, 5.1 / 8.2, 6.4 / 7.9. The roofs add about 2 to 3 ms at zoom 14.7 to 15.6; everything is under the 16.7 ms frame. Run-to-run noise is about ±1 ms.
* **Looked at:** desktop (800×600 pane), beats 1 to 3 played in real time and the explore beat reached with Next; 390×844, beats 1 and 2 only. Beats 4 to 6 were not looked at, and the changes do not touch them. No console errors during the run; the earlier `folded is not defined` crash did not reproduce, since `folded` is declared in `Playback`.

## Part 5 (v5.13.0): Pons Aemilius to the west bank; river structures and relief

* **West end.** The deck used to stop at the westmost pier Lanciani drew (E −154.5), in mid-river. It now runs on to an abutment 4 m inland of today's west bank at the bridge axis (OpenStreetMap, E −216.6, so the abutment is at E −220.6), in three even spans of 22 m, no wider than the widest span he drew (22.8 m). No ancient west bank is read off the plate, so this end is a **best guess** and the bridge's note says so. That gives ten spans, not Wikipedia's seven: seven would need spans of about 31 m, far wider than his spacing, so the discrepancy is left open and stated in the note. The Trastevere road starts at the new abutment.
* **Relief and river structures.** Relief ×2 exaggerates the terrain about sea level, so it doubled the step between the river surface and the banks. Bridges took a flat deck at the higher end or 6.5 m above the water, whichever was higher, so they floated and the low end (Tiber Island) stood on a pier about 11 m tall. Bridges and quays now measure each bank from the river with the exaggeration taken out (`River` in `UrbanScene`), and every bridge, Pons Aemilius included, runs straight from one end to the other with a slight hump (at most 4% of its length) over the water. Measured with relief ×2 / ×1, deck ends minus ground: Pons Fabricius −0.4 and +2.3 / +0.4 and +0.4 m; Pons Cestius +3.1 and +2.6 / +0.4 and +0.4 m. Landing stages and barges sit on the drawn water and were not affected.
* **Limitation.** The elevation model puts the drawn river surface above the market (water 22.6 m, the market 15 to 17 m at ×1), because its 30 m cells blend the river with the modern embankments. So the arches are mostly below the water line, and at the Pons Aemilius' east end the quay coping (river + 1.6 m) stands above the bridge deck, which meets the market street; with relief ×2 that end's abutment stands 6.4 m above the ground there (0.4 m at ×1).
* **Labels and legend.** Map labels that fall under the header (wordmark, search) are hidden until the camera moves them clear; the Tiber label is larger (14 to 19 px). The certainty line now shows "<1%" rather than rounding a present share to 0%, and adds the number of documented buildings in view (the two temples).

## Part 6 (v5.14.0): a level, yellow Tiber

* **Level water.** The river used to be draped on the terrain (the highest bed nearby, smoothed), so it varied across the channel, rode up the banks and doubled with relief ×2. It is now one flat surface at the 10th percentile of the terrain over today's open channel with the exaggeration taken out: 18.5 m (37.0 m displayed at ×2). Bridges, quays, stages and barges use the same level. No drop along the flow is modelled.
* **Ground under and beside it.** MapLibre's terrain cannot be cut, so inside its disc the lit ground now stands in for it: a first pass resets the depth over the ground's footprint and the ground writes its own. Under the water the ground is cut 1.5 m below the level; within 10 m of the water the banks are measured from the river without the exaggeration, so relief ×2 does not steepen them (buildings stand at least 11 m back, so none moves). Holes under 1,000 m² in today's outline (the Ponte Rotto ruin and a small islet off Tiber Island) are drawn as river.
* **Quays.** The river's east edge now stops at the quay wall's river face (the wall centred 2.5 m out from Lanciani's bank, 1.8 m thick), so no water lies behind the wall. The lot layout shifted slightly with the new edge (1,620 lots).
* **Look.** The foam band is gone; the bank darkens in a narrow wet band (about 1 m of height) above the water line. The water is muddy ochre-olive in the shallows to olive-brown in the channel, after *flavus Tiberis*; that colour is a best guess and the Tiber layer's note says so. The surface noise is broader and weaker; sky reflection and sun glint are kept. No foam at the bridge piers.
* **Limitation.** The elevation model still has the market (about 15 m) below the river level (18.5 m), so the quay wall along the market stands higher on its land side than on the water side, more so with relief ×2.

## Part 7 (v5.15.0): banks, shoreline, docks

* **Banks.** The banks are reshaped over 45 m instead of 10 m: at the water's edge the bank stands at most 1 m above the water (measured without the relief exaggeration) and rises smoothly to the terrain's own height 45 m back (`ContextGround.shapeHeight`, from a 4 m distance field). Buildings, temples, streets, scenery and river structures stand on this shaped ground, so they move with it rather than floating or sinking. This removes the steep, faceted bank faces the modern embankments left in the elevation model.
* **Shoreline.** The water has a crisp edge just outside the channel outline; under the water no ground stands above the level. The wet edge is the mask's 2 m band on the bank side, the same width everywhere.
* **Depth.** The water is shaded by distance from the bank (shallow ochre-olive at the edge to olive-brown 24 m out), with long, slow streaks along the flow and a broader sun sheen.
* **Docks.** Barges were placed 13 m along the bank from their stage but at the stage's east coordinate; the bank slants, so several lay on the land side of the quay wall. Stages now start at the wall's river face and barges moor against it where they lie; `check-reconstruction.mjs` checks both.
* **Bridge ends** never sit lower than the quay coping (1.6 m above the water) where the land behind is lower than the river (the market).
* **Looked at** (1280×660): the river-crossing beat at relief ×2; the two-temples beat at ×2; the "Where the evidence ends" view from the north (the reported view) at ×2 and ×1; the crossing pose at ×1. The pale slab beside the journey card in that view is the Pons Cestius seen end-on; its ends now sit 1 to 2 m above the water.

## Verification notes

* Desktop only, in Chrome, at the explore beat and by moving the camera. At phone width nothing was looked at.
* The local detailed scene falls back to placeholder blocks when the map centre sits about 200 m or more from the temples at high zoom, so the theatre and the Forum Holitorium temples could be inspected from a distance (zoom 18) but not from close in. Not changed; it is how the local scene is gated.

## Still open

* Plates 22 (Fori Imperiali), 29 (Forum Romanum) and 35 (Circus Maximus end) were not traced; plate 35 shows the circus with its Marrana channel but not the river.
* The Porticus Octaviae lies off the top of plate 28, on a plate not traced.
* The ground mesh is coarse (about 9 m near the temples), so the bank is a soft ramp with a stone coping on top, not a vertical wall face.
