# Rome c. AD 100 · land-use zoning (Stage 1 of the city expansion)

`build-zoning.mjs` writes `lib/scenarios/fixtures/rome-ad100-zoning.json` from the snapshots that `fetch-zoning-sources.mjs` saves in
`data/history/rome/source`. Checked by `node scripts/check-zoning.mjs` (deterministic output, tiers, dates, sources, no overlaps, full cover).
Pipeline position: this is the land-use part of the 2D plan (map first). Landmarks (Stage 2) and the zoned fill (Stage 3) build on it.

## What the layer is

Twenty zones that tile the area later enclosed by the Aurelian Walls, each with a use, an evidence tier, an existence interval and a note.
It is a 2D map layer, off by default, switched on under **Map layers → Land use c. AD 100 (zoning)** in the Forum Boarium journey.
Fill and outline take the zone's colour; outlines are solid for documented, dashed for approximate, dotted and pale for illustrative.
Like the flat ground, the layer gives way to the lit 3D ground close in, so it reads at the overview and regional zooms, not at the temples.

| Use | Zones | Tier |
| --- | --- | --- |
| Open / river | Tiber (today's channel, inside the city) | approximate |
| Monumental and public | Capitoline–Forum–Palatine–Colosseum valley–Circus Maximus; Oppian (Baths of Titus, Domus Aurea pavilion); Temple of Claudius; Forum Holitorium, Theatre of Marcellus and Circus Flaminius; central Campus Martius; Mausoleum, Ara Pacis and sundial; Castra Praetoria; Tiber Island | approximate |
| Port and warehouses | Emporium, Porticus Aemilia and horrea below the Aventine | approximate |
| | Trastevere riverfront | illustrative |
| Horti | Pincian (Collis Hortorum: Luculliani, Sallustiani); Esquiline (Maecenatis, Lamiani) | approximate |
| | Outer Esquiline/Viminal plateau; eastern Caelian; Via Appia beyond Porta Capena; Janiculum slopes | illustrative |
| Open ground | Northern Campus Martius towards the Via Flaminia | illustrative |
| Dense housing | East bank (the remainder: Subura, Velabrum, Via Lata, Quirinal, Viminal, Esquiline, Caelian, Aventine); Trastevere (density 0.6 of the core) | approximate |

No zone is **documented**: every boundary is drawn by hand. Approximate means a sourced point or attested use, with a guessed edge;
illustrative means the use itself is inferred for that place.

## How the geometry was made

* **Extent.** The surviving ways of the Mura Aureliane in OpenStreetMap (90 ways), kept at their outermost point per degree round a centre
  at 12.49 E, 41.892 N, from where the wall leaves the river north of the Campus Martius round the east to where it meets the river below the
  Emporium. The Campus Martius side is closed by today's east bank of the Tiber (the wall ran along it). In Trastevere the surviving ends
  (OSM ways 803364166 and 204145793) are joined through two hand points, one at the site of Porta Aurelia (Porta San Pancrazio): that stretch
  is lost and the line is a guess. Result 13.35 km² (the circuit is usually given as about 13.7 km²).
  The extent is the outer limit only. **The walls (AD 271–275) are never drawn**, no zone is named after them, and the check enforces it.
  In AD 100 the built-up city spilled past this line in places (the Vatican plain, along the consular roads); that is not zoned.
* **Zones.** Coarse outlines (about 50–100 m precision) drawn round Pleiades points for the monuments, horti and port, informed by the
  general topography in the works below. Each is cut by every zone of higher priority (river, monumental, port, horti, open), so they never
  overlap; housing is what remains, split into the east bank and Trastevere by the Trastevere wall line and today's west bank.
* **Dates.** Each zone carries the span over which it is defended as a description: e.g. Oppian AD 80–104 (the Domus Aurea pavilion burned
  in 104), Castra Praetoria from AD 23, the Forum zone AD 80–104. All contain AD 100.

## Sources

| Source | Licence | Used for |
| --- | --- | --- |
| Pleiades: the fourteen Augustan regions, horti, Emporium, Porticus Aemilia, Porta Portuensis, the monuments | CC BY 3.0 | Representative points the outlines are drawn round. Two records were dropped: "Capitolium" matched a town elsewhere, and the Horrea Galbana point sits beside the Colosseum |
| OpenStreetMap: Mura Aureliane ways; Tiber (relation 5071, from the context layer) | ODbL | The extent; the river and the bank that closes the extent |
| Wikipedia: Fourteen regions of Augustan Rome; Aurelian Walls | CC BY-SA 4.0 | Text: what each region held; the walls' date |
| Platner & Ashby (1929) | Public domain | Text: horti, Subura, Campus Martius, Emporium |
| Lanciani, *Forma Urbis Romae* (1893–1901) | Public domain | Consulted for general layout; no plate traced for these zones |
| Severan Marble Plan (Stanford Digital FUR) | Reference only | Later than AD 100 and not licensed for derived geometry; nothing traced |
| Carandini (ed.), *The Atlas of Ancient Rome* (2017) | Copyright | Reference only; nothing traced |

## Known gaps

* The Aurelian extent has a small spur at the Castra Praetoria's south-east corner, from how the wall points are binned.
* The Trajan's Forum saddle falls to housing; what stood there before c. AD 106 is uncertain (the zone note says so).
* Sub-region variety in housing (wealthier Aventine and Caelian houses, the Subura's density) is a note, not separate zones.
* Plates of Lanciani's map covering the Campus Martius, the Esquiline and Trastevere were not traced; they are the next correction.
