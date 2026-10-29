# Vision — the target experience

This is the north star for Mankind. Every phase should move the product closer
to this storyboard. It is a design target, not a description of what exists today.

![Target experience: a guided journey to London during the 2012 Olympics](vision/target-experience.png)

## The core loop

A user **asks Mankind to take them somewhere in history**. Mankind turns that
request into a **guided, cinematic scenario**: the camera flies from the globe
down to the place, the world gains detail as it approaches, and the journey
moves through key locations and moments, each with historical context. The user
can **take control at any time**, explore freely, resume the guide, and **move
through time** to see how the same place has changed.

## Storyboard (example: "Take me to London during the 2012 Olympics")

| # | Beat | What happens | Key UI |
|---|------|--------------|--------|
| 1 | **User request** | Whole-Earth globe; the user types a natural-language request. | Centered prompt bar ("Take me to London during the 2012 Olympics.") with a submit arrow. |
| 2 | **Journey begins** | The camera flies toward the destination; a route line traces into the target. | Glowing destination marker labelled with place + date ("London · July 2012"). |
| 3 | **Arriving in London** | The world gains detail as we approach — terrain, river, city fabric, landmarks. | Top-right location card (place, date). |
| 4 | **Following the torch relay** | The camera follows a route through the streets; crowds, flags, the event in motion. | Side context card: image, title, place, date, short description. |
| 5 | **Notable landmarks** | Key locations are highlighted with historical context (e.g. Tower Bridge). | Same context card pattern, anchored to the landmark. |
| 6 | **Arriving at the stadium** | The journey reaches its climax location. | Location card (Olympic Stadium · London · 27 July 2012). |
| 7 | **The opening ceremony** | Key moments are experienced in their historical context (night, fireworks, crowds). | Context card for the moment. |
| 8 | **User takes control** | Any interaction immediately pauses the scenario; the user explores freely. | "Scenario paused · Explore freely" pill; "Resume guided scenario" button. |
| 9 | **Continue exploring** | Move through time and see the same place in different eras. | Era comparison: Roman Londinium c. 200 AD → Medieval London c. 1400 → London c. 1800 → London July 2012. |

**Persistent chrome on every frame:** the `MANKIND` wordmark bottom-left and a
minimal bottom timeline (8000 BC · 1 AD · 1000 · 1500 · 1900 · 2012) with the
current moment highlighted.

## Experience principles

- **Ask, don't navigate.** The entry point is a natural-language request, not
  menus or coordinates.
- **Seamless scale.** One continuous camera from orbit to street level — no
  page loads or hard cuts between globe and city.
- **Guided, but never captive.** Scenarios play like a documentary, but any
  input pauses them instantly; resuming is one click.
- **Context is anchored.** Cards are tied to real places, dates and moments,
  short and factual, with an image.
- **Time is a first-class axis.** The same place should be explorable across
  eras; the timeline is always visible.
- **Photoreal-leaning, cinematic look.** Warm golden-hour lighting, depth,
  atmosphere; restrained dark-glass UI that stays out of the way.

## Where we are vs. the target

| Capability | Today | Needed for the target |
|---|---|---|
| Globe + camera | MapLibre globe, manual rotate/zoom | Scripted fly-to paths, smooth orbit → street-level transitions |
| Terrain & geography | Natural Earth, Mapterhorn elevation, biomes | City-scale detail: rivers, street networks, buildings |
| Settlements | Procedural Roman settlement (Three.js) | Era-specific cities (Roman, medieval, early-modern, modern) for one place |
| Timeline | 3000 BCE → 2025, scrub/play | Extend to 8000 BC; era markers; jumping between eras at a place |
| Search / prompt | Disabled placeholder in `TopBar` | Natural-language request → scenario (AI-planned) |
| Scenarios | None | Scenario model: ordered beats (location, date, camera path, card), play/pause/resume |
| Context cards | None | Anchored cards with image, title, place, date, description |
| Events & people | None | Crowds, routes (e.g. torch relay), event moments (ceremonies) |
| Historical data | None | Sourced places/events/dates backing scenarios and cards |

## Suggested build order

1. **Scenario engine** — data model for a scripted journey (beats with
   coordinates, date, camera keyframes, card content) plus play / pause on
   interaction / resume UI. Can be hand-authored before any AI exists.
2. **Camera choreography** — fly-to and path-following between beats, orbit to
   low oblique views.
3. **Context cards + location card** — the overlay UI from frames 3–7.
4. **Prompt bar** — wire the `TopBar` search into scenario selection (first
   matching hand-authored scenarios, later AI-generated ones).
5. **Era comparison at one place** — reuse the Roman settlement work for
   Londinium and add later eras, driven by the timeline (frame 9).
6. **City-scale detail and events** — buildings, crowds, routes, set-piece moments.
