# Portunus demo scene — target spec (draft for review)

**Status:** Agreed scope, 30 Oct 2026. Built (2D context layer, two temples, 7-beat journey); awaiting review.

## Why this exists

Before any LLM generates scenes, Mankind needs one scene that defines what "good"
looks like. This is that reference. It becomes:

1. the demo we show people;
2. the test case for the Phase 5 scenario-request / content-gap planner;
3. the yardstick future AI-generated scenes are judged against.

It will be authored *with* LLM help (research, drafting, JSON), under human review
and the existing validators. **Every correction made during review is logged**
(see "Correction log" below); those corrections become Phase 5 validation rules.

## The scene in one sentence

A visitor arrives at a riverside market in Rome around AD 100, sees why a harbour
god's temple stood here, and can tell at a glance what is known, what is
reconstructed and what is a guess.

## What changes from today

Today: one temple model on an empty green plane, four beats, about 35 s.
Target: the temple in its setting: river, market square, neighbouring temple,
bridge, docks, hills for orientation, at about 60–90 s.

## Journey (target beats)

| # | Beat | Camera | On screen | Key point |
| --- | --- | --- | --- | --- |
| 1 | Rome from above | Fly in from city scale | Hills labelled (Capitoline, Palatine, Aventine), Tiber, Tiber Island | "Where am I?" in 5 seconds |
| 2 | The river crossing | Descend along the Tiber | Pons Aemilius, Portus Tiberinus (docks), approximate ancient bank | Why there is a market here: ford, bridge, docks |
| 3 | The cattle market | Low pass over the square | Forum Boarium extent, Ara Maxima marker | What the place was for: trade and cult |
| 4 | Two temples | Frame both | Temple of Hercules Victor (marker/footprint) and Temple of Portunus (3D) | Two surviving temples, side by side, different forms |
| 5 | Read the exterior | Approach and hold on Portunus | Existing model + evidence card | (existing beat, kept) |
| 6 | Where evidence ends | Orbit | Inference card, uncertainty labels | (existing beat, kept) |
| 7 | Explore | Hand control to user | All layers live, inspector available | User takes over |

## What is on screen: three tiers

| Tier | Content | Representation |
| --- | --- | --- |
| **3D, evidence-backed** | Temple of Portunus | Existing catalogue model, unchanged |
| **2D, sourced** | Tiber course (approx. ancient bank), Forum Boarium extent, Hercules Victor footprint, Pons Aemilius, Portus Tiberinus, Ara Maxima, Cloaca Maxima outlet | Styled overlays with labels; each links to a source |
| **Orientation only** | Hill names, Tiber Island, Circus Maximus direction | Labels, visibly lighter style |

**Ground treatment:** replace the flat green plane locally with a neutral
"ancient ground" tone plus water for the river. Labelled as illustrative.

**Date filtering is part of the demo.** At AD 100 the Arch of Janus (4th century AD)
and Santa Maria in Cosmedin (later church) must *not* appear. Showing that the
system leaves them out is a feature.

## Evidence rules (non-negotiable)

- Every narrated claim has a source on its card.
- Every overlay carries a certainty level: documented / approximate / illustrative.
- **Modern ≠ ancient:** the present Tiber embankments are 19th–20th century. Modern
  river geometry (e.g. OpenStreetMap) may be used only as a labelled approximation
  of the ancient bank, never as the ancient course.
- No generated buildings to "fill" the square. Empty with labels beats invented.
- Point locations are not footprints. Where only a point exists, show a marker.

## Quality bar (acceptance)

- [ ] A first-time viewer can say where they are and why the temple is there after beat 3.
- [ ] No beat shows a featureless plane.
- [ ] Journey card never covers the subject on desktop (≥768 px).
- [ ] Narration: ≤ 45 words per card, plain English, no unsourced claims.
- [ ] Every overlay is inspectable (name, date range, certainty, source).
- [ ] Pause / explore / resume works on every beat (existing behaviour preserved).
- [ ] Runs smoothly on Leith's Mac in Chrome; measured, not assumed.
- [ ] Phone-width layout readable (390 × 844), even if not the showcase.
- [ ] Existing checks still pass; new data passes the historical-world validators.

## Out of scope

- Narration audio (planned later as a toggle; see Decisions).
- Population, animals, ships, sound, interiors.
- Any AI calls at runtime.
- Other sites.

## Candidate data sources (licences to verify before use)

| Source | Use | Note |
| --- | --- | --- |
| Pleiades gazetteer (ISAW/NYU) | Point locations and IDs for named places | Openly licensed; confirm terms and attribution |
| Digital Augustan Rome / *Mapping Augustan Rome* (Haselberger, Romano 2002) | Reference for extents and placement | Data licence unclear; may be reference-only |
| American Academy in Rome, Maps & GIS | Historical maps, base data | Check per-dataset terms |
| OpenStreetMap | Modern river, present-day temple footprints | ODbL; modern geometry only (see rule above) |
| Soprintendenza Speciale di Roma | Monument identity, dates | Already used for Portunus |

## Decisions (30 Oct 2026)

1. **Viewing date: keep AD 100.** The Portunus model is already catalogue-pinned to
   the AD 100 editorial context, so no re-review is needed. Both temples, the stone
   Pons Aemilius and the docks fit that date, and the Arch of Janus is still correctly absent.
2. **Length: about 90 s.** The existing Portunus beats alone take about 35 s; adding
   four context beats in 60 s would rush them.
3. **Hercules Victor: 3D model**, built with the same reproducible Blender/Python +
   catalogue pipeline as Portunus. Round cella, ring of 20 Corinthian columns, stepped
   base. Built after the 2D context layer, so the scene works if the model is late.
4. **Narration audio: planned as an optional toggle later.** Cards stay the primary
   channel; card text should read well aloud (≤ 45 words) so it can be voiced without rewriting.

## Correction log (fill in during build)

| Date | What the LLM proposed | What was wrong | Rule for Phase 5 |
| --- | --- | --- | --- |
| 30 Oct 2026 | Use Palladio's plan for the Hercules Victor column ring | His plan draws about 12 columns and a dome; the standing building has 20 columns and the original roof is lost | Counts and roofs must come from the standing building or a surviving-evidence source, never from a Renaissance reconstruction; use such drawings for ratios only |
| 30 Oct 2026 | Cella diameter from Palladio's text (= column height, 10.65 m) | His own plan gives 9.55 m at 14.8 m overall; text and plan disagree | When two figures from one source conflict, record both and the one used |
| 30 Oct 2026 | Luna-marble contrast on the 10 north columns | Needs a surveyed orientation the scene does not have, so a "north" side would be invented | Do not model a documented fact whose frame of reference the scene cannot supply |
| 30 Oct 2026 | Place Hercules Victor at the rounded Wikipedia point (41.88861 N, 12.48083 E) | About 20 m from the OpenStreetMap outline recorded by Pleiades, and a rounded point is not a footprint | Prefer a location record that carries its own geometry and stated accuracy over a rounded encyclopedia coordinate; derive relative positions inside one dataset so errors cancel, and record the derivation |
| 30 Oct 2026 | Show the Forum Boarium "extent" as sourced geometry | The only polygon is the present-day OSM site outline; no source gives the ancient boundary | A modern outline may be shown only as `approximate` + `modern-geometry`, never `documented`; the validator now rejects the combination |
| 30 Oct 2026 | Treat the Tiber as an ancient bank using OSM water | The embankments were begun in 1876 (Wikipedia, Tiber); today's channel is not the ancient course | Modern river geometry carries an explicit "not the ancient course" note and the `approximate` level (check enforces the title and note) |
| 30 Oct 2026 | Draw Portus Tiberinus as docks/quays with an extent | The only coordinate is a Wikidata point with about 1 km declared precision; Pleiades has no record | Point-only data stays a marker (`point-only` basis); the schema rejects a polygon or line with that basis |
| 30 Oct 2026 | The docks fit AD 100 (spec decision 1) | Italian Wikipedia says the harbour stayed in use at least to the Flavian period (to AD 96), so AD 100 is possible, not documented | When a source gives a last-attested date, treat later dates as `possible` and say so; do not extend use to the viewing date |
| 30 Oct 2026 | Pons Aemilius dated from Pleiades (first stone bridge 241 BC) | Wikipedia gives 179 BC begun, 151 BC complete; the sources disagree | Record both dates and the one used (179 BC, ±28 years); only the Ponte Rotto fragment is mapped, so the layer shows position, not span |
| 30 Oct 2026 | Ara Maxima as a located altar from Pleiades | The Pleiades record has no location of its own; its representative point is derived, and the foundation identification is tentative | A derived representative point is a marker labelled approximate; carry the source's own hedge ("possibly beneath Santa Maria in Cosmedin") into the note |
| 30 Oct 2026 | Use Pleiades location dates (e.g. 1700–2100 for Tiber Island, Forum Boarium) as feature dates | Those spans date the modern OSM location, not the ancient feature, and would hide the island at AD 100 | Take dates from the subject's own evidence (e.g. Aedes Fauni dedicated 196 BC for the island); never reuse a location-record date range as a feature's lifespan |
| 30 Oct 2026 | Load two temple layouts at once | The streamer keeps one detailed layout active, so two layouts would swap as the camera moves | Compose reviewed buildings into one layout (one descriptor, two buildings, each keeping its own catalogue place) rather than assuming concurrent layouts |
| 30 Oct 2026 | Orbit the temple pair 70° at zoom 18.6 | At bearings along the pair's axis the card covers a temple at 768 px (found by the framing check) | Check card clearance numerically per camera pose, not by eye at one width |

## Vision storyboard prompts

For an image generator, to make a 7-panel vision board in the same style as the
London 2012 storyboard (`docs/vision`). **These images are aspirational, not evidence:**
an image model will invent architecture. Label the finished board "Vision, not
reconstruction", as with London.

**Shared style line** (append to every prompt):
> Cinematic aerial photograph style, golden late-afternoon light, 16:9. Clean dark
> translucent UI overlay: "MANKIND" wordmark bottom-left, a thin timeline bar along
> the bottom with ticks 8000 BC · 1 AD · 1000 · 1500 · 1900 · 2026, marker at AD 100.
> Numbered step label top-left in white sans-serif. No modern buildings, cars or people in modern dress.

1. **Rome from above.** High aerial view of ancient Rome around AD 100, the Tiber
   curving past Tiber Island, Capitoline, Palatine and Aventine hills labelled in
   small white text. Caption: "1 · Rome, AD 100: the journey begins over the city."
2. **The river crossing.** Lower view following the Tiber downstream: a stone arched
   bridge (Pons Aemilius), wooden quays and moored river barges at the docks
   (Portus Tiberinus), warehouses. Info card: "Portus Tiberinus · Rome's river harbour".
3. **The cattle market.** Low pass over an open paved market square by the river,
   cattle pens, traders, a large ancient altar. Card: "Forum Boarium · market and cult site".
4. **Two temples.** A small round marble temple with a ring of Corinthian columns
   (Temple of Hercules Victor) beside a rectangular Ionic temple on a high podium
   (Temple of Portunus), both near the riverbank. Card: "Two temples, side by side".
5. **Read the exterior.** Close three-quarter view of the Temple of Portunus: high
   podium, front steps, four Ionic columns, tiled roof. Card with small source
   thumbnails: "Read the exterior · based on a historic plan".
6. **Where evidence ends.** Same temple, half rendered in clean stone, half as a
   translucent wireframe, with small labels "documented", "inferred", "unknown".
   Card: "Where the evidence ends".
7. **You take control.** Same scene, a hand cursor dragging the view, a small pill
   "Scenario paused · Explore freely" top-right and a "Resume guided scenario"
   button bottom-right.
