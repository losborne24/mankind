# Rome c. AD 100 · simple landmark reconstructions (Stage 3b)

The monumental zones were left open by the fill (`FILL.md`), so the Campus Martius, the Capitoline and the Fora read as empty ground.
They now carry **simple reconstructions**: each monument is one kit shape, stood where its remains are mapped. They are placeholders
until proper assets are made, and are labelled as such.

* `scripts/context/rome/fetch-landmarks.mjs` snapshots the OpenStreetMap outlines of the remains (`data/history/rome/source/osm-landmarks.json`).
* `scripts/context/rome/build-landmarks.mjs` turns them, with Pleiades points and published sizes, into
  `lib/scenarios/fixtures/rome-ad100-landmarks.json`: one entry per monument (kit, centre, facing, size, height, dates, note, sources).
* `lib/scenarios/romeLandmarks.ts` draws each entry as extruded pieces; `lib/scenarios/romeFill.ts` adds them to the fill as kind
  `landmark`, and `map/romeFillOverlay.ts` draws them with it.

## Where each one stands

* **Mapped remains (evidence-based placing).** Where OpenStreetMap maps the remains, the monument is centred and turned by the smallest
  rectangle round that outline: the Colosseum, Ludus Magnus and Arch of Titus; the Basilicas Julia and Aemilia, the Curia, Regia and
  the temples of Castor, Divus Julius, Concord, Saturn, Vespasian and Vesta; the Fora of Caesar, Augustus and Nerva, the Templum Pacis,
  and the temples of Venus Genetrix, Mars Ultor and Minerva; the Pantheon, the Stadium of Domitian (Piazza Navona keeps its arena), the
  Largo Argentina temples, the Porticus of Octavia (from its standing propylon) and the Mausoleum of Augustus.
* **Facing.** An outline gives an axis, not a front. Each temple, the Pantheon's porch, the stadium's straight end and each theatre's
  stage is given the rough compass direction it faces, and the axis is turned to the nearer end. Where an outline is near square
  (Concord, Vespasian) the facing is a judgement, as their notes say.
* **Pleiades points (best guess).** The Temple of Jupiter on the Capitoline (the point is good to only about 2 km, checked against the
  remains under Palazzo Caffarelli), the Theatre and Porticus of Pompey (set 25 m east of the line of Via di Grotta Pinta, which follows
  the cavea), the Ara Pacis at its original site, the Horologium obelisk and the Circus of Gaius and Nero.
* **Described positions (best guess).** The Saepta Julia (east of the Pantheon), the Baths of Nero and the Odeum of Domitian, placed as
  Platner describes them, to about 50 m.
* **Zone centres (best guess).** The Baths of Titus, the Claudianum terrace and temple, and the Castra Praetoria (also turned by the zone).

**Sizes** are the published figures (Platner 1929; the Wikipedia article on each monument), rounded. Where an outline covers only the
excavated part (the Templum Pacis, the Forum of Augustus with its exedrae), the published size is set on the outline's centre and axis.
**Heights** are published where recorded (Colosseum 48 m, Arch of Titus 15.4 m, Curia 21 m, Pantheon 43 m) and guesses otherwise; each
note says which.

## Kits

| Kit | Pieces |
| --- | --- |
| temple | podium, colonnaded body stopped short for the steps, a gable roof in two steps along the axis |
| round-temple | podium, drum, roof |
| basilica | aisles, clerestory, ridge |
| hall | walls and a stepped roof |
| precinct | porticoes round an open square (fora, the Saepta, the Porticus of Octavia and of Pompey, the Ludus Magnus) |
| baths | main block, a raised central hall and cross hall |
| amphitheatre | four tiers stepping down to an open arena, 48 sectors each |
| stadium, circus | an open arena with a straight end and a curved end, two tiers of stands; the circus has a spine and its obelisk |
| theatre | a semicircular cavea in three tiers and the stage building; Pompey's carries the Temple of Venus Victrix at the top |
| drum | stacked tiers (the Mausoleum of Augustus, the top planted) |
| rotunda | the Pantheon's drum, a dome in three steps, the block and porch with its gable |
| camp | walls, the headquarters and barrack rows (Castra Praetoria) |
| block | the Arch of Titus, the Ara Pacis enclosure, the obelisk |

## Rules

* **Dated.** Only monuments standing by AD 100 are drawn: Trajan's Forum and Baths, the Temple of Venus and Roma, the Basilica of
  Maxentius and the rest of the later monuments are left out. The Pantheon is drawn on Hadrian's plan (c. AD 113–125), which stands on the
  same site and faces the same way; the building of AD 100 was Domitian's restoration of Agrippa's, and its form is uncertain.
* **Not repeated.** What the Forum Boarium neighbourhood already models (the Circus Maximus, the Palatine palaces, the Theatre of
  Marcellus, the Forum Holitorium temples, the Temple of Aesculapius) is not drawn again. A landmark any of whose pieces would stand in
  one of the neighbourhood's footprints is left out whole and listed (`landmarksLeftOut`): only the House of the Vestals, which the
  Domus Tiberiana platform covers as the neighbourhood draws it.
* **Kept clear.** The lots keep the same 20 m margin from the landmarks as from the monumental zones.
* **Colour by certainty.** Landmarks placed from mapped remains tint as evidence-based, the rest as best guess; the rest of the fill
  stays best guess.

## Known gaps

* Kit shapes, not models: no columns, arches or steps; roofs are stepped slabs.
* The central Campus Martius still has open ground where the Iseum, the Porticus Divorum, the Theatre of Balbus and smaller temples
  stood: no mapped remains or confident positions were found for this pass.
* The Forum square's smaller monuments (Rostra, arches, statues) are not drawn.
