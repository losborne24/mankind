# Phase 5C: research and acquisition (sources)

Phase 5C closes the loop for places nobody has built by hand. A plan's gaps become research tasks. Open sources
around the place are fetched from an allow-list. Claims are extracted, checked and reviewed. A reviewed draft
blueprint is published into the app. After that, the place plans and plays like any other, at the detail its
sources support.

```
plan gaps ─► research queue ─► fetch-place (allow-list) ─► quarantine ─► snapshots + manifest
   ─► claims (API or chat app) ─► review ─► draft blueprint ─► Checkpoint A ─► review ─► publish ─► planner and app
```

## Decisions

| Decision | Chosen |
| --- | --- |
| Sources | Wikidata (CC0), Pleiades (CC BY 3.0), English Wikipedia summaries (CC BY-SA 4.0, quoted for claims, not republished), OpenStreetMap through Overpass (ODbL) |
| Hosts contacted | Only `query.wikidata.org`, `www.wikidata.org`, `pleiades.stoa.org`, `en.wikipedia.org`, `overpass-api.de`, over HTTPS, with the project user agent |
| 3D models | Not yet. Sources come first, and model acquisition follows once this works |
| First place | Ostia, AD 100 |

## Pieces

| Piece | Role |
| --- | --- |
| `lib/research/sources.ts` | The allow-list, the Wikidata and Overpass queries, and the normalisers. A raw response is promoted from quarantine only if it passes them. Size cap is 2 MiB per response |
| `scripts/research/fetch-place.mjs` | Does the network work (see below) |
| `lib/ai/claims.ts` (`placeDocuments`) | One fixed text document per fetched record, so claims can quote it. Wikidata dates are written as recorded ("700 BCE") |
| `lib/research/queue.ts`, `scripts/research/queue.mjs` | A plan's gaps as tasks, each listing the sources that could close it and the command to start it |
| `scripts/ai/draft-blueprint.mjs --place <slug>` | Drafts a blueprint from accepted claims inside the fetch radius. The draft carries the sources it cites as a `sources@1` layer, so journeys can cite them |
| `scripts/research/publish-accepted.mjs` | Copies drafts accepted by a named reviewer into `lib/plan/accepted/blueprints.json`, after re-checking them against Checkpoint A. The app's planning context loads that file |

The fetch script runs a fixed sequence:
1. A Wikidata query for historical items within the radius: items with a Pleiades id, or with an inception before 1500.
2. The Pleiades records those items name.
3. The English Wikipedia summaries for those items.
4. The OpenStreetMap remains carrying a `historic` tag.

Raw responses are kept in `data/research/quarantine/` (git-ignored). Trimmed snapshots and `manifest.json` go to
`data/history/<slug>/source/`. The manifest records each snapshot's licence, request URLs, access date and
SHA-256 digest. An Overpass failure is recorded and doesn't stop the fetch.

Two checks became stricter for this phase:
- **BCE years in claims.** A BCE year must now appear in its quote either as its era year next to BCE or BC, or
  exactly as a signed number. A conversion that's one year off ("700 BCE" given as −700 instead of −699) is
  caught.
- **Claim provenance.** Claims drafts record who produced them (`extractedBy`), and `review.mjs list` shows it.

## Ostia: where it stands

Ostia's sources were fetched on 1 November 2026, within 2 km of Ostia Antica:
- 32 Wikidata items, including the city (inception 700 BCE), the theatre, baths, temples, Mithraea and the
  synagogue;
- 28 Pleiades records;
- 4 Wikipedia summaries;
- 161 OpenStreetMap remains.

That's 225 documents in all. The snapshots are committed, and the gate checks them against their digests.

The pipeline was run end to end in a scratch copy, with a test reviewer and five hand-written claims. That was a
test of the code path, not an extraction:
- The draft passed Checkpoint A, carrying its sources.
- "Ostia" then resolved to the draft rather than to "no blueprint".
- The journey composed, citing Pleiades and Wikidata.
- The Capitolium and the Baths of the Trinacria (both dated 120 CE by Wikidata) were reported as not yet standing
  at AD 100.

No claims for Ostia have been reviewed for real. The steps to get there:

```sh
node scripts/ai/manual-batch.mjs export claims --place ostia --from 0 --count 25
node scripts/ai/manual-batch.mjs import claims data/ai/manual/batches/claims.reply.txt --source "claude.ai" --place ostia --from 0 --count 25
node scripts/ai/review.mjs list
node scripts/ai/review.mjs accept claims wikidata-Q1012797 --reviewer "Your name"
MANKIND_AI_MODE=manual MANKIND_AI_MANUAL_SOURCE=claude.ai node scripts/ai/draft-blueprint.mjs --place ostia --title "Ostia" --year 100
node scripts/ai/review.mjs accept blueprint draft-ostia --reviewer "Your name"
node scripts/research/publish-accepted.mjs
```

Some notes on these steps:
- **Chunked export:** repeat the first two commands with `--from 25`, `--from 50` and so on, so each reply fits in a
  chat.
- **Review:** accept or reject each claims draft after reading it.
- **Drafting:** the draft step writes a prompt file and stops. Paste the chat's reply into the `.reply.txt` beside
  it, then run the command again.

With an API key, `extract-claims.mjs` and `draft-blueprint.mjs` run the same steps without pasting.

## What a fetched place looks like

A blueprint from these sources is mostly dated, located markers: settlements, temples, baths and gates.
It has the date evidence the sources give, and it says plainly what it lacks:
- extent;
- zoning;
- streets;
- landmark footprints;
- 3D models.

It's far thinner than the hand-built Rome blueprint, and the plan's gaps say so. Places with no open sources still
get honest gaps.

## Remaining

- **Model acquisition.** Finding openly licensed models, quarantining them and ingesting them as draft catalogue
  versions is the next part of 5C.
- **No parent link for fetched blueprints.** Adding one would need a revision of the parent blueprint. A fetched
  place is therefore planned without a parent context (no approach over Central Italy).
- **Coordinates only.** Wikidata and Pleiades give points; OSM outlines are in the snapshots but not yet used as
  footprints.
