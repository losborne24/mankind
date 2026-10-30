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
