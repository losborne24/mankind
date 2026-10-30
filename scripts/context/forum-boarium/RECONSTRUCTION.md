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
| Wikipedia: Forum Boarium, Pons Aemilius, Great Altar of Hercules, Insula, Horrea; it.Wikipedia Porto tiberino | CC BY-SA 4.0 | No (text only, short facts) | Bridge dates (179/151 BC) and seven spans; altar tentatively under Santa Maria in Cosmedin; harbour 6th century BC to at least the Flavian period; typical shops, flats and warehouses; height limits of 70 then 60 Roman feet |
| Lanciani, *Forma Urbis Romae* (1893–1901) | Public domain (author died 1929; published 1893–1901) | **No** | Consulted for orientation only. His sheets record what the 1890s excavations and the Severan plan showed, not Rome c. AD 100, and no sheet covering this ground was found as a ready-to-use open scan in this session |
| Stanford Digital Forma Urbis Romae Project (Severan Marble Plan fragments) | Site notice: text and images may be copied "only for research and personal use"; the Comune di Roma owns the 1960 photographs; a licence is needed for the 3D archive | **No** | Not usable: those terms do not allow redistributing derived geometry in a shipped app. Reference only |
| *Mapping Augustan Rome* (Haselberger, Romano 2002, JRA Supplement 50) | Copyrighted printed book; no open data licence found | **No** | Reference only: the project did not use its map or gazetteer geometry |

Result: **no third-party geometry beyond the OpenStreetMap/Pleiades/Wikidata snapshots already licensed for the scene.**
Every other position is derived by rules in the generator. The Severan plan and *Mapping Augustan Rome* are the right
next references for a scholar's review (see §5) but could not be adopted here without a licence that allows it.

## 2. What is documented, evidence-based, best guess

| Class | Objects | Basis |
| --- | --- | --- |
| **Documented** (2) | Temple of Portunus, Temple of Hercules Victor | Standing buildings; footprints are modern outlines; models carry their own evidence cards |
| **Evidence-based** (3) | Pons Aemilius · Ara Maxima · road from the bridge | Bridge: position from the surviving Ponte Rotto arch (two piers fixed), seven spans and stone from Wikipedia, deck, arches and other piers guessed. Altar: placed at Pleiades' derived point, tentative platform under Santa Maria in Cosmedin; size and steps guessed. Road: Platner records a road from the bridge to the Velabrum; its line is bent around Portunus by guess |
| **Best guess** (172) | River quays (2) · landing stages (8) · barges (6) · open square · cattle pens (2) · stalls (16) · streets (4) · shops (94) · blocks of flats (35) · warehouses (4) | Plausible for a Roman river market district; each note says what it is based on and what is invented |

The best-guess share is shown live in the legend (area-weighted over the mapped objects in view), with a switch that
hides every best-guess object in the 3D scene and on the map, and a colour-by-certainty option.

## 3. Rules the generator follows

* **Frame.** Metres east and south of the temple-pair layout origin, as in the scene definition.
* **River.** East bank = today's Tiber outline (OpenStreetMap), smoothed. It is an approximation of the ancient bank, not its course (the embankments date from 1876).
* **Bridge.** Axis through the Ponte Rotto fragment; piers at its two surviving pier positions, the rest spread to meet the modern banks; seven spans.
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
