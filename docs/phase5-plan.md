# Phase 5 plan

Goal: a user asks for a place and a date in plain language. Mankind returns a guided
journey built from the evidence, catalogue and scenes it actually has, plus an
explicit list of what is missing. AI makes that possible at scale. It drafts
structured, checked specifications (requests, claims, plans) and never geometry,
renderer calls or usable assets.

This plan follows the [Phase 4 handoff](phase4-completion.md#phase-5-starting-boundary)
and the [scene generation pipeline](scene-generation-pipeline.md) (section 10, step 9).
Phase 5 starts from a green 36-command gate (v5.21.1, 1 November 2026).

## Shape of the phase

Phase 5 has three milestones. Each must be accepted before the next starts, because
each later milestone is measured against the one before it.

| Milestone | What it proves | AI involved |
| --- | --- | --- |
| **5A: deterministic planning** | Requests, plans and content gaps are real, validated data, and the existing scenes can be expressed in them | None |
| **5B: AI drafting** | An AI can fill those same contracts from a request or a source, and is measured against golden references | Yes, behind a server boundary |
| **5C: research and acquisition** | Gaps turn into reviewable source and asset drafts through the existing catalogue | Yes, offline only |

| Step | Deliverable | Milestone |
| --- | --- | --- |
| 1 | Scene contracts: `SceneQuery`, `Claim`/`EvidenceBundle`, `ScenePlan`, `ResolvedFeature`, `AssetRequest` | 5A |
| 2 | Golden references: Forum Boarium and Rome AD 100 expressed as bundles and plans | 5A |
| 3 | Scenario request and content-gap planner | 5A |
| 4 | Checkpoint A validators and 2D plan review | 5A |
| 5 | Deterministic journey composer | 5A |
| 6 | Prompt bar: request in, journey or honest gap report out | 5A |
| 7 | AI provider decision and server boundary | 5B |
| 8 | AI request interpretation | 5B |
| 9 | AI claim extraction from cited sources | 5B |
| 10 | AI plan drafting | 5B |
| 11 | Research and acquisition queue | 5C |
| 12 | End-to-end acceptance and handoff | All |

## 5A: deterministic planning

**Status:** implemented (November 2026). See [Phase 5A planning](phase5a-planning.md). Steps 1–6 were
built with one addition from the Phase 5A brief: hierarchical, versioned spatial blueprints (empire to site)
with reuse, override layers, selective invalidation and compact saves. Tests A–F pass in the gate.

### Step 1: scene contracts

Turn the sketch in [pipeline section 8](scene-generation-pipeline.md#8-data-contracts-sketch)
into real types with runtime validation, in a new `lib/plan/` module.

- Reuse what exists rather than parallel it: `HistoricalPeriod` for existence
  intervals, `Evidence` (whose four certainties map onto the pipeline's tiers, with
  `unknown` as the modern default), `HistoricalSource`, `HistoricalDate`, and
  catalogue pins `{id, version}`.
- `PlanFeature` records its fallback rung (1 bespoke asset to 5 marker). Every
  feature marked documented carries claim ids. Every inferred feature carries a reason.
- `AssetRequest` is keyed so that many scenes needing the same structure produce
  one request (pipeline section 6).
- All of it is plain serialisable JSON with bounded sizes, the same discipline as
  `lib/history/validate.ts`.

**Done when:** `scripts/check-scene-plan.mjs` covers schema acceptance and rejection,
reference integrity, chronology and evidence rules, and it is in the gate.

### Step 2: golden references

Express what is already hand-built in the new contracts. This is the reference
that 5B is measured against. If the contracts cannot express a scene that already
exists, fix the contracts, not the scene.

- **Forum Boarium:** the two temples (rung 1, catalogue-pinned), period survey
  streets, quays, bridges and the Tiber bank, as an `EvidenceBundle` with a `ScenePlan`.
- **Rome AD 100:** the zoning (`rome-ad100-zoning.json`) as land-use features. The
  fill rules (`FILL.md`, `romeFill.ts`) become fill areas with density and tradition.
  The simple landmarks (`romeLandmarks.ts`) become rung-3 massing features, and each
  one raises an `AssetRequest`. That makes the request queue real from day one.
- Adapters compile the plans back into the descriptors and layers the renderer
  already uses. The check proves the output matches today's output, byte for byte
  where the code is already seeded.

**Done when:** both scenes render from their plans with no visible change, and the
check compares the plan-compiled output with the current output.

### Step 3: scenario request and content-gap planner

The slice the handoff recommends. It is pure and deterministic, and it does no
fetching.

- **Input:** `ScenarioRequest` `{ place, date, intent, detailLevel }`, either
  normalised from structured fields or (in 5B) drafted by AI.
- **Place resolution:** a small gazetteer built from the registered datasets'
  places and aliases. An unknown place is reported as unknown, never guessed.
- **Output:** `RequestPlan`, containing:
  - the scenes that can be shown, with the rung each feature reached, resolved
    through `resolveSceneRequirements` and exact catalogue pins;
  - the scenes that fall back to map-only, and why;
  - content gaps: `EvidenceTask` (a claim or source is needed) and `AssetRequest`
    (a model is needed), deduplicated across requests.
- **No nearest-era substitution**, no borrowing kits across traditions, and no
  promotion of draft catalogue versions (all are existing Phase 4 rules).

**Done when:** `scripts/check-request-planner.mjs` covers four cases. Forum Boarium
AD 100 returns two rung-1 temples. Forum Boarium AD 400 returns gaps, not
substitutes. Housesteads AD 200 returns map-only with geometry gaps. An unknown
place returns an explicit unknown.

### Step 4: Checkpoint A validators and 2D review

- Implement [Checkpoint A](scene-generation-pipeline.md#checkpoint-a--after-the-2d-plan):
  schema, chronology, evidence, focus features present, and geography (no buildings
  in water and footprints on buildable ground, using the existing Tiber and relief data).
- A failed check rejects the plan or downgrades features down the ladder. It is
  never rendered as if it passed.
- Extend the existing `ZoningPlanView` into a general plan review view. It shows
  features by tier and rung, plus the gap list. This is the human review surface
  for 5B drafts.

**Done when:** both golden plans pass. Seeded faults (a building in the river, a
documented feature without a claim, a feature outside the date) are each caught,
and the review view shows them.

### Step 5: deterministic journey composer

Compile a `RequestPlan` into a `ScenarioDefinition` that `validateScenario` accepts,
with no hand-authoring.

- Beats come from the plan: an approach, the focus features, then events and routes
  that fall within the date. Camera framing reuses `framing.ts` and the existing
  `flyTo`/`orbit` commands. Cards carry the claim sources and the evidence tier.
- A map-only or gap-heavy plan still yields an honest journey: geography, markers
  and a card saying what is missing.
- The composed Forum Boarium journey is checked against the hand-authored
  `portunusJourney` for beat coverage and scene requirements, not for identical camera paths.

**Done when:** composed journeys play end to end in the existing player and pass
the same lifecycle checks as Phase 4 (interrupt, explore, resume, exit, missing model).

### Step 6: prompt bar

Wire the disabled `TopBar` search into the planner (vision build-order step 4).

- 5A accepts structured input only: a place picker with aliases, plus a date. Free
  text matches registered journeys and gazetteer names deterministically.
- The result is either a playable journey or a gap report showing what exists and
  what would be needed. A blank or failed result never falls back to a generic Roman scene.
- Desktop and 390 px acceptance in the browser, matching the Phase 4 standard.

**5A acceptance:** at least three requests produce composed journeys. One uncovered
request produces a correct gap report. The gate includes every new check.

## 5B: AI drafting

### Step 7: AI provider decision and server boundary

This step starts with your decisions (see below). Then it builds:

- A server-only route (`app/api/plan/…`). The API key lives only in server
  environment variables. The browser never calls a provider directly.
- Every AI output is schema-constrained (tool or structured output) and passes
  through the step 1 validators. Invalid output is rejected, not repaired silently.
- Each call records its model id, prompt version, inputs, output, token counts and
  cost. A per-request and per-day cost cap fails closed.
- Recorded responses become test fixtures. The gate runs on recordings and never
  calls a live provider. A separate opt-in `eval` command runs live.

**Done when:** a stub prompt round-trips through the route with validation, logging,
caps and a recorded-fixture test.

### Step 8: AI request interpretation

Free text in, `ScenarioRequest` out. For example, "Take me to the cattle market in
Rome under Trajan" becomes Forum Boarium, c. AD 100, intent tour.

- This is the only AI step that runs at request time. It never chooses assets or
  scenes. The deterministic planner still does that.
- Ambiguity is returned as a clarification, such as "Which Rome: AD 100 or 1500?",
  rather than a guess.
- An eval set of about 60 prompts, each with expected normalised requests, covering
  dates (BCE, reigns, events), aliases, unsupported places and refusals.

**Done when:** accuracy on the eval set meets a target you agree in step 7, and the
prompt bar accepts free text.

### Step 9: AI claim extraction

Sources in, `Claim` drafts out, measured against the hand-curated Forum Boarium claims.

- The input is source text that is already cached and licensed (the sources the
  Phase 4 fetch scripts recorded). There is no open-web browsing in this step.
- Each claim must quote the span it relies on. A checker verifies that the quote
  appears in the cited source. A claim without a verifiable quote is discarded.
- Conflicting claims are kept and linked (`conflictsWith`), never resolved silently.
- Output enters the bundle as a draft only. A person accepts it before any plan can cite it.
- Report precision and recall against the golden bundle.

**Done when:** the extraction report on Forum Boarium sources meets an agreed bar,
with zero unverifiable quotes accepted.

### Step 10: AI plan drafting

An `EvidenceBundle` plus geography goes in, and a `ScenePlan` draft comes out
(pipeline stage 5, "the AI Scene Planner's job").

- Documented anchors are fixed and copied from claims. The AI proposes inferred
  features with reasons, and fill areas with densities.
- Checkpoint A must pass, and a person approves the draft in the step 4 review view.
- Measure it against the golden Rome and Forum Boarium plans: anchor fidelity (must
  be exact), coverage of inferred features, and how closely zoning matches.
- Approved plans are cached per site and period (cache key from pipeline section 8),
  not per request.

**5B acceptance:** for one site not hand-built before, a free-text request produces
claims, a plan and a composed journey. A person can review and approve every
AI-drafted item, and every rendered feature traces to an accepted claim or a
labelled inference.

## 5C: research and acquisition

### Step 11: research and acquisition queue

Offline tooling (scripts and a review surface), not a runtime service.

- Work through `EvidenceTask` and `AssetRequest` items. Search approved source
  catalogues and asset repositories, and record origin, licence, retrieval date and
  feature uncertainty.
- A candidate model is ingested as a new **immutable draft** catalogue version
  through the existing hash, rights and review gates. Nothing becomes usable
  without a recorded human review, and cached scenes that used a placeholder are
  invalidated only after that review.
- Downloads go to quarantine and are validated (GLB structure, size and
  dimensions) before ingestion.

**Done when:** one Rome AD 100 landmark moves from a rung-3 placeholder to a
reviewed, catalogue-pinned asset through the queue. Its scenes upgrade, and no
other scene changes.

## Step 12: end-to-end acceptance and handoff

- In the production build: one covered request plays a composed journey, one
  AI-drafted site plays after review, and one uncovered request returns a correct
  gap report.
- Gate: all domain checks, including the new planner, plan, validator and
  recorded-AI checks. Typecheck, lint, both production builds and the style check.
- The AI eval report and cost log are recorded under `docs/previews/phase5-final/`.
- Handoff table in the Phase 4 format: what was delivered, and the boundaries that remain.

## Decisions needed from you

| Decision | Needed by | Recommendation |
| --- | --- | --- |
| AI provider and models | Step 7 | One provider behind a thin interface. A larger model for claim and plan drafting (offline, low volume), a fast model for request interpretation (runtime). |
| Cost caps | Step 7 | Per-request and daily caps that fail closed, with a monthly figure you set |
| Where AI runs | Step 7 | Request interpretation at runtime only. Extraction and plan drafting offline, reviewed and cached. |
| Source policy | Step 9 | Start with sources already cached and licensed. Allow-list further catalogues (for example Pleiades, OpenHistoricalMap, museum and excavation publications) one at a time. |
| Asset sources and licences | Step 11 | Allow-list repositories and licences (CC0, CC BY) before any download tooling exists |
| Reviewer | Steps 9–11 | You, recorded by name in catalogue and plan reviews, as in Phase 4 |
| Next site after Rome | Step 10 | One with good open sources and a Roman tradition the kit already covers, for example Ostia or Pompeii (Menander is already a draft) |

## Out of scope for Phase 5

- Runtime AI generation of geometry, textures or models, and AI writing to MapLibre or Three.
- Automatic promotion of any AI or downloaded content to usable.
- Worldwide coverage, and eras or traditions without a kit.
- General wall-plan ingestion and arbitrary historical road navigation. These are
  Phase 4 boundaries that stay open unless a step needs them.
- Accounts, a database or public publishing. The catalogue and plans stay as
  compiled local stores.

## Risks

- **The golden plan exposes contract gaps late.** Step 2 is ordered before any
  planner work for this reason. Budget for a contract revision there.
- **Eval sets are small.** Treat the results as regression signals, not accuracy
  claims, the same caveat Phase 4 gave for its performance samples.
- **Composed journeys look worse than authored ones.** Keep the authored Portunus
  journey as the quality bar, and let a composed journey carry authored camera
  overrides where needed.
- **Cost and latency of runtime interpretation.** Keep it to one small call,
  recorded, with a deterministic fallback to the structured picker.
