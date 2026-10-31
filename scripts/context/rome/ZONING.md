# Rome c. AD 100 · land-use zoning

`build-zoning.mjs` writes `lib/scenarios/fixtures/rome-ad100-zoning.json` from the Pleiades snapshot that `fetch-zoning-sources.mjs` saves in
`data/history/rome/source`, plus the Tiber from the Forum Boarium context layer. Checked by `node scripts/check-zoning.mjs` (deterministic output,
tiers, dates, sources, no overlaps, full cover, temple anchors, markers, nothing from the Aurelian circuit).
Pipeline position: the land-use part of the 2D plan (map first). Landmarks and the zoned fill build on it.

## What the layer is

A 2D map layer, off by default, switched on under **Map layers → Land use c. AD 100 (zoning)** in the Forum Boarium journey. It draws:

* **The continuous city** as a dashed outline (approximate): 12.7 km², with short tapering ribbons out along nine roads.
* **24 zones** (22 at AD 100), each with a use, an evidence tier, an existence interval and a note. Fill and outline take the zone's colour; outlines
  are solid for documented, dashed for approximate, dotted and pale for illustrative.
* **19 markers**: the fourteen Augustan regions and five anchors (three horti, the Emporium, the Porticus Aemilia).

Everything is date-filtered. The Baths of Trajan (from AD 104) and Trajan's Forum (from c. 106) are in the data and are named under
"Not shown at 100 CE". Like the flat ground, the layer gives way to the lit 3D ground close in.

| Use | Zones at AD 100 | Tier |
| --- | --- | --- |
| Open / river | Tiber (today's channel) | approximate |
| Monumental, public, commercial | Capitoline–Forum–Palatine–Colosseum valley–Circus Maximus; **Forum Boarium and Velabrum** (temples, markets, harbour); Oppian (Baths of Titus, Domus Aurea pavilion); Temple of Claudius; Forum Holitorium and Circus Flaminius; central Campus Martius, **now reaching north to the Horologium**; Mausoleum and Ara Pacis; Castra Praetoria; Tiber Island | approximate |
| Port | Emporium, Porticus Aemilia and horrea | approximate |
| | Trastevere riverfront | illustrative |
| Horti | Pincian (Luculliani, Sallustiani); Esquiline (Maecenatis, Lamiani) | approximate |
| | Outer Esquiline/Viminal plateau; eastern Caelian | illustrative |
| Open ground | **Campus by the river bend (Trigarium, Tarentum, Euripus)** | approximate |
| | Northern Campus towards the Via Flaminia | illustrative |
| Housing · dense | East bank (Subura, Argiletum, Via Lata, Quirinal, Viminal, Esquiline slopes), density 1; Trastevere, density 0.6 | approximate |
| Housing · low-density elite | Aventine and Caelian, density 0.35 | approximate |
| Housing · roadside | Ribbons along the roads outside the core, density 0.45 | illustrative |

No zone is **documented**: every boundary is drawn by hand.

## Revision (v5.17.0)

* **Extent.** The Aurelian Wall outline is gone, and with it the Janiculum triangle and the spike at the Castra Praetoria. The OpenStreetMap wall snapshot was deleted and is no longer fetched. The extent is drawn by hand at about 150 m precision. The east bank and Trastevere are drawn separately, each closed along today's bank, and joined by the river and Tiber Island between them. Trastevere stops at the foot of the Janiculum. Ribbons 120 m wide run along approximate road axes from the gates: Flaminia, Salaria, Nomentana, Tiburtina, Labicana–Praenestina, Appia, Ostiensis, Portuensis, Aurelia. The axes are a guess and should give way to the sourced roads in the suburbium stage.
* **Forum Boarium and Velabrum** are now monumental/commercial (Wikipedia: original docks, intense commercial activity; the Velabrum's edges are unclear). Both temple anchors lie inside; the check asserts it.
* **Markers.** Porta Portuensis was removed: it is an Aurelian gate, and the Pleiades record is no longer fetched. Three markers were moved by hand, each marked illustrative with the reason in its note:
  * Regio I, onto the Via Appia outside Porta Capena.
  * Regio XIV, into the Trastevere housing.
  * Horti Luculliani, onto the Pincian inside its zone.

  Regio V was added by hand: Pleiades has no point for it.
* **Oppian.** The Baths of Titus stay. The Baths of Trajan were built after the fire of AD 104 and dedicated in 109, so they are kept as a dated zone that the filter leaves out at AD 100. Their notes and the Oppian note say so.
* **Campus Martius.** The monumental zone now reaches the Horologium and Mausoleum (Agrippa's baths and lake, porticoes). A new open zone in the river bend covers the Trigarium and Tarentum, with the caveat that insulae encroached on the Campus from Sulla on.
* **Housing classes.** Dense: the Subura is "a vast and populous neighborhood" (Wikipedia). Low-density elite: aristocratic residences on the Aventine in the imperial era, Trajan's own among them, and the Caelian as "a fashionable residential district" (Wikipedia). Roadside ribbons are illustrative.

## Revision (v5.17.1), after review of the plan image

* **River.** The Tiber zone now runs the length of the map (41.85–41.935): the OpenStreetMap urban relation 5071 stops at 41.911, so the
  polygons up- and downstream (relations 15909049, 17258409 and 14 ways) are fetched too and joined. It is not clipped to the city.
  The 3D water still uses the urban stretch from the context layer, unchanged.
* **Markers.** "Gardens of Maecenas" was the same place as the Horti Maecenatis zone and is gone; the zone label is now "Esquiline horti".
  "Insula" is now "Tiber Island". 19 markers.
* **Ribbons** taper from 140 m wide where the road leaves the city to 50 m at the end, and take precedence over open ground, so the
  Via Flaminia ribbon runs from inside the city along the Via Lata. The northern Campus "open" zone was left as a 9,000 m² sliver between that
  ribbon and the river and was dropped. The fill should still taper by distance, not follow the polygon (next stage).
* **Housing** now has four classes: dense valleys (Subura, Argiletum, Via Lata; density 1), **mixed hill housing** on the Quirinal, Viminal,
  upper Esquiline and Pincian slope (0.6, illustrative: Wikipedia names Quirinal temples and the Esquiline as favoured by the aristocracy
  for houses, but not the share), elite Aventine and Caelian (0.35), Trastevere (0.6) and roadside ribbons (0.45).
* **Review plan.** `node scripts/context/rome/plot-zoning.mjs` draws `docs/previews/rome-zoning/zoning-ad100.{svg,png}`: a square frame from
  12.42 to 12.55 E, the filled river, features dated after AD 100 hatched and labelled "not shown", markers, a legend, and labels placed so
  they do not overlap (a label that finds no free place is left out: Horti Lamiani's, beside Regio V).
* **Not yet built:** the suburbium (consular roads, Vatican plain, aqueducts, Campagna). Nothing is off-frame; that is the next stage.

## Suburbium (v5.18.0)

The plan now covers a frame about 14 km square (12.40–12.57 E), with the continuous city, the suburbium round it and the Campagna beyond.

* **Roads (13).** Flaminia, Salaria, Nomentana, Tiburtina, Labicana, Praenestina, Latina, Appia, Ostiensis, Portuensis, Aurelia, Triumphalis and Cornelia.
  Each is drawn along the modern streets that keep its line (OpenStreetMap: Via Flaminia, Via Salaria, … Via Casilina for the Labicana,
  Via Appia Antica, Via Aurelia Antica, Via Trionfale), simplified at 8 m and cut at the frame. The Via Appia is **documented**: the Appia Antica keeps the
  ancient line and paving. The others are **approximate**: the road is documented, but the modern street only approximates its line. The Via Cornelia and the link from the
  Pons Neronianus to the Via Trionfale have no modern street; they are drawn by hand and are **illustrative**. The Via Latina is drawn only where
  stretches named Via Latina survive. Roads begin where the modern street begins, so some start a few hundred metres outside the city edge.
* **Ribbons** now follow these roads, not hand-drawn axes: within 700 m of the city they are part of it (100 m wide, narrowing to 60 m); from 700 m to
  2.5 km they are suburban roadside (60 m narrowing to 25 m), illustrative.
* **Belt** (illustrative): villas, gardens and farms within 1.2 km of the city and up to 3.5 km out along the roads, so it reaches out with them.
* **Campagna** (illustrative): everything beyond, to the frame. On the 3D map it is left unfilled, since its square frame would show on the globe.
* **Vatican plain:** Circus of Gaius and Nero (begun under Caligula, AD 37–41), the Vatican necropolis, the Horti Agrippinae and the Horti Domitiae
  (the river bend where Hadrian's mausoleum later stood), all **approximate**, with the Pons Neronianus and Via Triumphalis necropolis markers.
* **Aqueducts:** the standing arches of the Aqua Claudia and Anio Novus in the Campagna (OpenStreetMap, **documented**). The link from them into the
  city at the later Porta Maggiore is drawn by hand through Pleiades' Aqua Claudia point (**approximate**). Nero's Arcus Neroniani to the Caelian, which Domitian
  extended to the Palatine, is **illustrative**. All date from AD 52 or later. The Acqua Felice (1586), which OpenStreetMap maps along part of the
  Claudia's line, is not used.
* **Aniene:** drawn to its confluence with the Tiber. The upstream pieces at the top of the earlier plan were clipped meanders; the frame now
  takes them in whole. Rivers are simplified at 2 m and drawn without an outline.
* **Not shown at AD 100**, each with what its date means: Baths of Trajan (built after the fire of 104, opened 109), Trajan's Forum (construction from
  c. 106, dedicated 112), Baths of Caracalla (built c. 212–216), Hadrian's Mausoleum (construction from 134, finished 139).
* **Not drawn:** brickworks, clay pits and riverside market gardens. No source used here places them.
* **Plan:** the legend is in a side panel. `plot-zoning.mjs` writes the PNG with headless Chrome at the plan's own size (Quick Look as the fallback).

## Revision (v5.18.1), after review of the suburbium

* **Belt.** The belt is no longer a union of large circles. It is three bands of decreasing density, each within a fixed distance of the city or of a road
  (roads count out to 2.5 km from the city): within 300 m (density 0.06), 300–700 m (0.03) and 700–1,200 m (0.012). Their colour
  moves towards the Campagna, so the belt fades out instead of ending in a scalloped edge. It now reaches about 3.7 km at most, instead of 5–7 km.
* **Via Appia tombs.** A necropolis ribbon 90 m wide runs along the Appia from the edge of the city to about 400 m past the Tomb of Caecilia
  Metella. That tomb is placed at its Pleiades point (Wikipedia: third mile, built c. 30–10 BC) and marked. The ribbon is approximate: the line is the road's, and the width and length are a guess.
* **Roads** are one chain each. Second carriageways and parallel pieces are dropped. Jumps that the street's own geometry runs alongside are
  joined. Only real breaks are kept as gaps, drawn dotted ("road assumed"): Flaminia 351 m (the Pons Mulvius crossing, where today's bridge has another
  name), Tiburtina 325 m, Labicana 1 km (between the city street and the Casilina), Latina 120 m, Portuensis three short breaks, Triumphalis the hand-drawn
  link from the bridge.
* **Via Ostiensis** was checked against the river outline: no segment crosses the Tiber. It runs close to the bend south of the city, on the east bank.
  The check now asserts that no road crosses the river except at a bridge (the Pons Neronianus, and the Pons Mulvius on the Flaminia).
* **Not-shown labels** (Trajan's Forum, Baths of Trajan, Baths of Caracalla, Hadrian's Mausoleum) are pinned to their own footprints on two short lines:
  the name, then what the date means.

## In the app: the 2D plan

The journey card (start card and every beat) has a **2D plan** thumbnail. It opens the plan full screen, drawn live from the zoning data
by `lib/scenarios/zoningPlan.ts`, the same drawing `plot-zoning.mjs` writes to `docs/previews/rome-zoning`. Clicking a zone, a marker or
the city outline opens its evidence card, docked at the right edge, including the hatched features dated after AD 100. The view zooms with
+ and −, keeping the centre, and closes with ✕ or Escape. Opening it pauses a playing journey.

## Sources

| Source | Licence | Used for |
| --- | --- | --- |
| Pleiades: the fourteen regions, horti, Emporium, Porticus Aemilia, the monuments | CC BY 3.0 | Representative points the outlines and markers are drawn from |
| OpenStreetMap: Tiber (relation 5071, from the context layer) | ODbL | The river and the banks that close the extent |
| Wikipedia: Fourteen regions; Subura; Aventine Hill; Caelian Hill; Forum Boarium; Velabrum; Baths of Trajan; Trajan's Forum; Baths of Agrippa; Campus Martius | CC BY-SA 4.0 | Text: uses, characters and dates (each article read for the claim cited) |
| Platner & Ashby (1929) | Public domain | Text: horti, Subura, Campus Martius, Emporium |
| Lanciani, *Forma Urbis Romae* (1893–1901) | Public domain | General layout; no plate traced for these zones |
| Severan Marble Plan (Stanford Digital FUR) | Reference only | Later than AD 100 and not licensed for derived geometry; nothing traced |
| Carandini (ed.), *The Atlas of Ancient Rome* (2017) | Copyright | Reference only; nothing traced |

## Known gaps

* The generated neighbourhood (1,620 lots) still fills the Forum Boarium and Velabrum with housing; the zoned fill (next stage) will follow the new zone.
* Road ribbons use straight approximate axes and a fixed width.
* The Trajan's Forum saddle falls to dense housing at AD 100; what stood there is uncertain.
* Plates of Lanciani's map for the Campus Martius, the Esquiline and Trastevere were not traced.
