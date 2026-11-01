# Phase 5B: AI drafting

Phase 5B adds AI to the Phase 5A pipeline. Free text becomes a structured
request. Cached sources become verifiable claims. Accepted claims become a draft
blueprint. In each case the model fills a contract that Phase 5A already
validates, and nothing it produces is shown or used without passing those
checks. Claims and blueprints also need a named person's review before they are
used.

```
free text ──► /api/plan/interpret ──► ScenarioRequest ──► planner (5A) ──► journey
cached Pleiades ──► extract-claims ──► verified claims (draft) ──► review ──► draft-blueprint ──► Checkpoint A ──► review ──► planner
```

## Decisions taken

Phase 5B was started without the step 7 decisions from the [Phase 5 plan](phase5-plan.md), so these defaults were chosen. All can be changed in one place.

| Decision | Chosen | Where to change it |
| --- | --- | --- |
| Provider | Anthropic, through the official `@anthropic-ai/sdk` | `lib/ai/boundary.ts` (`claudeTransport`) |
| Model | `claude-opus-5-5` for every task: interpretation at effort `low`, claims at `medium`, drafting at `high` | `AI_MODEL`, and each task's `effort` |
| Refusals | Server-side fallbacks on (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`). A declined request is retried on the model Anthropic routes it to, and priced at that model's rates | `claudeTransport` |
| Cost caps | $0.50 per request (worst case, checked before the call) and $5 per day (actual spend), both failing closed | `MANKIND_AI_REQUEST_USD`, `MANKIND_AI_DAILY_USD` |
| Where AI runs | Interpretation at request time, on the server. Extraction and drafting offline, as scripts | Fixed by design |
| Sources | Only cached and licensed records: 75 Pleiades places (CC BY), already in `data/history/` | `PLEIADES_FILES` |
| Review | A named reviewer per decision, in an append-only log (`data/plan/reviews.jsonl`) | `scripts/ai/review.mjs` |

The Phase 5 plan had suggested a faster model for interpretation. Opus 5.5 at
low effort is used instead, so one model and one prompt cache serve every task.
Switching interpretation to a cheaper model is a one-line change, to be decided
after the live eval shows whether it holds quality.

## Server boundary (`lib/ai/boundary.ts`)

All AI calls go through `runAi(task)`. It has four modes:

| Mode | Behaviour |
| --- | --- |
| `off` | The default with no credential. No call is made, and the app falls back to the structured fields |
| `live` | Real requests |
| `record` | Real requests, with each response saved under `lib/ai/recordings/` |
| `replay` | Only saved responses; a request without one fails. This is the mode for regression runs |

The key is read by the SDK from the server environment and never reaches the
browser. Every call follows the same rules:

- **Output format:** constrained by JSON schema (`output_config.format`).
- **Validation:** checked by the task's own validator. Invalid output is
  rejected with a typed error (`refused`, `truncated`, `invalid-json`,
  `invalid-output`), never repaired.
- **Cost:** priced from usage and appended to a daily ledger.
- **Logging:** written to `data/ai/calls.jsonl` with the request digest, prompt
  version, model served, tokens, cost and outcome. `data/ai/` is git-ignored
  because it may contain request text.

## Request interpretation (`lib/ai/interpret.ts`, `/api/plan/interpret`)

The model translates only. Its system prompt holds the rules plus the gazetteer
of registered places and landmarks. The prompt is stable, so it is cached, and
user text never enters it. The model returns one of three outcomes: a request, a
clarifying question with up to four options, or a refusal. Validation rejects:
- a place id that isn't in the gazetteer, including a landmark offered as a place;
- a new place that duplicates a gazetteer name;
- a target landmark that isn't in the requested place;
- unsupported or reversed years.

Accepted output is normalised into the same `ScenarioRequest` the structured
form produces.

In the app, **Plan a journey** now has a free-text box above the fields. An
interpretation is written into the fields, so you see exactly what will be
planned, and then planned. A question offers its options as buttons. Without a
server credential, the box is disabled and says why.

**Eval:** `lib/ai/evals/interpret-cases.json` has 60 cases: 51 requests, 5
clarifications and 4 refusals. They cover reigns, BCE dates, aliases in Italian
and Latin, landmarks inside Rome, places outside the gazetteer, fiction and a
prompt-injection attempt. Grading is deterministic
(`lib/ai/evalInterpret.ts`).

## Claim extraction (`lib/ai/claims.ts`)

Each cached Pleiades record is rendered into a fixed text document. A claim
names a feature, its kind, its position and dates where the document gives
them, a quote and a confidence. A claim is discarded and counted if any of these
fail:
- the quote isn't an exact substring of the document;
- a stated coordinate isn't in the quote to 4 decimals;
- a stated year isn't in the quote.

The prompt also forbids using the dates of a location record (the date of the
mapping) as the feature's dates. Surviving claims are saved as drafts.

**Golden comparison:** agreement is measured against the hand-curated
point-like features in the golden blueprints that cite the same Pleiades record.
As a ceiling, copying every Pleiades point perfectly reaches 85% recall and 57%
precision at 300 m. The misses are deliberate curatorial choices, such as a
region marker moved onto its road, or a temple placed from its mapped outline.
Live extraction should be judged against that ceiling, not against 100%.

## Blueprint drafting (`lib/ai/draft.ts`)

Code copies documented positions from accepted claims, exactly. The model only
proposes inferred features. Each must cite accepted claims, give a reason and
lie inside the frame. A feature whose source gives no date is shown only at the
frame's date, as an approximate interpretation, never as timeless. The draft
must pass `validateBlueprint` and Checkpoint A. It's scored against the golden
blueprint by coverage of its point-like features, and by whether every
documented position equals its claim's position.

## Reviews (`lib/ai/review.ts`, `scripts/ai/review.mjs`)

Drafts are stored with the digest of their content. A decision records the
reviewer, a note and that digest, in an append-only log. Only accepted drafts
whose content still matches are used. Editing a draft returns it to draft.
There is no automatic acceptance.

## What is verified, and what is not

**Verified offline**, in the gate, by `scripts/check-ai-boundary.mjs` with a
scripted fake transport (no model is called):
- the boundary is off without a credential;
- both caps fail closed before any call;
- record and replay round-trip, and a missing recording fails;
- refusals, truncation, non-JSON and every off-contract interpretation are
  rejected;
- claim quotes are verified, with fabricated quotes, coordinates and years all
  dropped;
- drafts keep documented positions exactly and pass Checkpoint A;
- reviews are append-only and lapse when a draft is edited;
- an accepted draft plans and composes;
- the route returns typed errors;
- the grader passes a perfect answer on all 60 cases and fails wrong years and
  wrong places.

**Not yet run: everything that needs the model.** This machine has no
`ANTHROPIC_API_KEY`, so there are no recorded responses and no measured
accuracy. The steps to run them are below. None of the following is claimed
until those runs exist:
- interpretation accuracy;
- claim precision and recall;
- draft coverage;
- step 10 acceptance (a site not hand-built before, planned from AI-drafted,
  reviewed content).

## Testing with a chat subscription (no API key)

The copy-paste path in `lib/ai/manual.ts` lets the Claude or ChatGPT apps stand in for the API. Each task becomes one
self-contained prompt (the rules, the exact JSON schema, the request). The pasted reply goes through the same
validator as an API response. Code fences and surrounding sentences are removed, but the JSON itself isn't
altered, so a reply off contract is rejected exactly as an API answer would be.

- **In the app:** without a server key, **Plan a journey** offers **Copy prompt** for the free text. Paste it into
  your chat, paste the reply back, and press **Use reply**. The reply is validated in the browser, written into the
  fields and planned. Nothing is sent to the server.
- **Evals in one paste:**

  ```sh
  node scripts/ai/manual-batch.mjs export interpret
  node scripts/ai/manual-batch.mjs import interpret data/ai/manual/batches/interpret.reply.txt --source "claude.ai"
  node scripts/ai/manual-batch.mjs export claims --only forum-boarium,portunus,hercules-victor
  node scripts/ai/manual-batch.mjs import claims data/ai/manual/batches/claims.reply.txt --source "claude.ai" --only forum-boarium,portunus,hercules-victor
  ```

  The interpretation batch is all 60 cases in one prompt of about 13,000 characters. Claims go in chunks
  (`--only`, or `--from`/`--count`) so the reply fits. Imports write `interpret-eval-manual.json` and
  `claims-eval-manual.json`, and save claim drafts for review.
- **Any single task, including drafting:** set `MANKIND_AI_MODE=manual` and run the script. The first run writes the
  prompt to `data/ai/manual/<task>/<digest>.prompt.md` and stops. Paste the chat's reply into the `.reply.txt`
  beside it, then run again. Set `MANKIND_AI_MANUAL_SOURCE` to label replies. A pasted reply is also saved as a
  recording, so it replays later.

A chat app runs its own model and settings, without the API's schema constraint. Results from this path therefore
measure the prompts and contracts, not the production configuration. Every report and recording is labelled
`manual:<source>`.

## Running it live

Put the key in `.env.local` (git-ignored) or export it. Then run these:

```sh
MANKIND_AI_MODE=record node scripts/ai/eval-interpret.mjs --limit 10
MANKIND_AI_MODE=record node scripts/ai/eval-interpret.mjs
MANKIND_AI_MODE=record node scripts/ai/extract-claims.mjs --only forum-boarium,portunus,hercules-victor
node scripts/ai/review.mjs list
node scripts/ai/review.mjs accept claims pleiades-forum-boarium --reviewer "Your name"
MANKIND_AI_MODE=record node scripts/ai/draft-blueprint.mjs
```

Rough cost at Opus 5.5 rates, with the stable prompt cached after the first call:
- **Interpretation:** about $0.01–0.03 per case, so roughly $1 for the 60.
- **Claims:** about $0.02–0.05 per source, so up to $4 for all 75.
- **Drafting:** one call under $0.20.

The daily cap stops a run at $5. Reports are written to `docs/previews/phase5b/`.
Recorded responses can then be replayed for free (`MANKIND_AI_MODE=replay`).

## Remaining boundaries

- **No new site yet.** A site that isn't already hand-built needs its sources
  fetched first. Fetching is research and acquisition (Phase 5C) and needs an
  allow-list decision, so step 10's "new site" acceptance waits for it. Drafting
  is exercised on Rome's frame, where the golden blueprint gives a measure.
- **Accepted drafts reach the planner through scripts only.** Bundling reviewed
  drafts into the app's planning context is a small follow-up, once there are
  reviewed drafts worth bundling.
- **Local-only files.** The ledger and logs are local files. A hosted
  deployment would need persistent storage for them.
