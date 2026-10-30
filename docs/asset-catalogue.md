# Persistent asset catalogue — Phase 4 Step 7

The project now has a source-controlled, file-backed historical asset catalogue.
It records exact content versions independently of an append-only review history,
and connects usable versions to the existing renderer registry. Load Menander and
expand **Asset catalogue · version 1 · draft** in its inspector to review the
initial draft's evidence, phase, rights and missing architecture.

This milestone supplies the catalogue and ingest workflow. It does not supply a
new reconstruction model. [Step 8 in the revised plan](phase4-plan.md) is the first
visible evidence-backed building.

## Persistent records

The authoritative store is `lib/assets/catalogue.json`, not browser storage or a
temporary in-memory index. The app validates a bundled snapshot and returns
detached metadata through `readAssetCatalogue()`. Local edits require the normal
rebuild/reload to become the current app snapshot. A server database, live update
subscription and browser administration API are outside this minimal catalogue.

Each content version records:

- Stable asset identity, positive integer version, title, canonical place ID and
  structural category.
- Historical phase and uncertainty, source records, documented/inferred/unknown
  features and limitations.
- Model reuse-rights status, declaration, attribution and notes. Rights for source
  research material do not automatically become rights for a model.
- An optional exact renderer registry ID and SHA-256 of its model file.

The registry still owns path, units/scale, dimensions, orientation, grounding and
entrance metadata. The catalogue does not duplicate or replace that rendering
contract. A new model must be registered explicitly before it can be ingested
with a rendering binding. Step 8 should use versioned binary paths and keep older
versions available while referenced.

The local ingest command will not replace an existing content version. A new
version uses the next integer, preserving place/category identity. Review events
record status, date, reviewer and rationale separately; the most recently appended
event determines status. With no review, the version is **draft**. Reviews can
mark a version **usable** or **retired**. Retirement is terminal for that version.
Changes in content, rights or interpretation require a new content version.

## Ingestion and review commands

Run from the repository root:

```sh
node scripts/asset-catalogue.mjs list
node scripts/asset-catalogue.mjs validate
```

For prepared metadata files:

```sh
node scripts/asset-catalogue.mjs add /absolute/path/to/entry.json
node scripts/asset-catalogue.mjs review catalogue:asset-id 2 /absolute/path/to/review.json
```

An entry follows `CatalogueVersion` in `lib/assets/catalogueValidation.ts`. A review
input contains only `status`, `at` (YYYY-MM-DD), `reviewer` and `note`. The command
adds identity/version itself. `--file /absolute/path/to/catalogue.json` supports
isolated local catalogues, as used by the persistence tests.

Writes use an exclusive lock, validate the complete next store, verify renderer
bindings and binary checksums, then atomically rename a temporary file in the same
directory. Failed validation leaves the original store untouched. An existing lock
stops another writer; a crash can leave a stale lock for the operator to inspect.
The command never downloads content, generates geometry or edits model binaries.

Usable status requires a rendering binding, cleared rights with terms and credit,
and interpreted features with source references. The command checks file presence,
category and hash. These checks validate records and integrity; they do not certify
archaeological accuracy or verify the truth of an operator's review assertions.

## Binding to a historical scene

`HistoricalAsset.catalogueRef` pins `{ id, version }`. It cannot coexist with a
direct `registryId`. The shared binding resolver checks exact existence, current
review status, canonical place, category and the complete selected date interval.
No latest-version, name, proximity or nearest-era fallback is used.

Draft, retired, missing, wrong-place, wrong-category and uncertain/outside-phase
versions cannot supply a model. Both the settlement adapter and scene-requirement
resolver use this check. A resolved entry uses the existing registry/cache/streamer;
no new model-loader ownership or animation loop was introduced.

Legacy direct registry bindings remain supported for the existing explicit fixtures
and adapters. New catalogue-managed historical content should use a catalogue pin;
this local development system is not an authenticated asset-approval service.

## Initial record

Menander's missing architecture now pins `catalogue:menander-reconstruction`,
version 1. It is a metadata-only draft: the property extent is documented, its
AD 79 association is inferred, and its architectural geometry remains unknown.
There is no rendering binding, usable review or model-rights grant. The existing
property polygon stays visible as map context and no reconstruction model loads.
The footprint importer reproduces this pin without changing source vertices.

The inspector displays the pinned version and status, phase, model-rights record,
feature certainty, source links and limitations. Where present, it also displays
model terms/attribution and the latest review event. The version remains inspectable
outside its scene date; geographic Visit still obeys the current date selection.

## Verification

```sh
node scripts/check-asset-catalogue.mjs
node scripts/check-phase3.mjs docs/previews/asset-catalogue
```

**26/26 commands passed**, including TypeScript, ESLint and the webpack production
build. [Raw integration results](previews/asset-catalogue/regression.json) retain the
existing historical, scenario, terrain, Roman and streaming checks. Historical test
loaders were extended to import the persistent JSON snapshot; their assertions
remain in place.

New checks exercise cold-process persistence, detached reads, strict metadata and
provenance validation, immutable content versions, identity, review history and
retirement, locking, atomic failure behavior, model hashes/categories, exact pins,
place/date guards, draft rejection by the settlement adapter and inspector markup.
A usable model lifecycle is tested only in an isolated temporary catalogue with
an explicitly synthetic record. The real catalogue is unchanged by tests and has
no usable reconstruction.

Chrome acceptance verified the [draft review panel](previews/asset-catalogue/01-draft-review.jpg),
explicit draft rejection, zero 3D scene descriptors and continued 2D context. No
architectural reconstruction or new performance benchmark is claimed.

## Next step

Step 8: choose a building with adequate reusable plans and elevation evidence,
construct or acquire one specific asset, register a versioned binary, ingest its
evidence and rights through this catalogue, and render it for review. Menander's
draft does not commit us to that building if another site provides better evidence.
