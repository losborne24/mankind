import type { AiTask } from '@/lib/ai/boundary';
import { SPATIAL_LODS, normaliseRequest, type ScenarioRequest, type SpatialLOD } from '@/lib/plan/contracts';
import type { BlueprintStore } from '@/lib/plan/store';
import { MAX_YEAR, MIN_YEAR } from '@/lib/historicalDate';

/**
 * Free text to a ScenarioRequest (Phase 5B step 8). The model only translates: it never picks scenes, assets or evidence, and it
 * may only name places the gazetteer lists (or a new place by title and coordinate). The deterministic planner does the rest.
 * Ambiguity comes back as a clarifying question, not a guess.
 */
export const INTERPRET_VERSION = 'interpret-1';
export type Interpretation =
  | { outcome: 'request'; request: ScenarioRequest; rationale: string }
  | { outcome: 'clarify'; question: string; options: string[]; rationale: string }
  | { outcome: 'refuse'; reason: string; rationale: string };

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });
export const INTERPRET_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['outcome', 'placeId', 'newPlace', 'startYear', 'endYear', 'scope', 'target', 'question', 'options', 'reason', 'rationale'],
  properties: {
    outcome: { type: 'string', enum: ['request', 'clarify', 'refuse'] },
    placeId: nullable({ type: 'string' }),
    newPlace: nullable({ type: 'object', additionalProperties: false, required: ['title', 'longitude', 'latitude', 'tradition'], properties: { title: { type: 'string' }, longitude: { type: 'number' }, latitude: { type: 'number' }, tradition: nullable({ type: 'string', enum: ['roman'] }) } }),
    startYear: nullable({ type: 'integer' }),
    endYear: nullable({ type: 'integer' }),
    scope: { type: 'string', enum: ['auto', ...SPATIAL_LODS] },
    target: nullable({ type: 'string' }),
    question: nullable({ type: 'string' }),
    options: { type: 'array', items: { type: 'string' } },
    reason: nullable({ type: 'string' }),
    rationale: { type: 'string' },
  },
} as const;

/** The stable part of the prompt: rules and the gazetteer. Same for every call with the same blueprints, so it caches. */
export function interpretSystem(store: BlueprintStore): string {
  const places = store.gazetteer().filter(e => !e.feature).map(e => `- ${e.placeId} | ${e.title} | ${e.lod} | aliases: ${e.aliases.join('; ') || 'none'}`).join('\n');
  const landmarks = store.gazetteer().filter(e => e.feature).map(e => `- ${e.placeId} | ${e.title} (inside ${e.blueprint.id})`).join('\n');
  return `You translate a person's request to visit a place in history into a structured request for Mankind, a historical world explorer. You only translate. You never decide what is shown; a deterministic planner does that and reports what is missing.

Fields:
- outcome: "request" when the place and time are clear; "clarify" when you would have to guess either; "refuse" when the request is not a visit to a real place and time (fiction, a person rather than a place, harm).
- placeId: a place id copied exactly from the gazetteer below, or null. Never invent an id. Prefer the finest listed place that matches (a temple over its city) unless the person asks for the wider area.
- newPlace: only when the place is real but not in the gazetteer: its common title, a WGS84 longitude and latitude you are confident of (the historical centre), and tradition "roman" if the request is for a Roman-period place, else null. Leave null when placeId is set.
- startYear / endYear: astronomical years (1 CE = 1, 1 BCE = 0, 100 BCE = -99). A single year leaves endYear null. Turn a reign, era or event into the year range it names (for example "under Trajan" is 98 to 117; "the Olympics" in London is 2012). If no time is given or implied, clarify.
- scope: "auto" unless the person asks for a wider or narrower view than the place itself (for example "the whole empire", "just the temple").
- target: a landmark id from the landmark list when the person names one inside a listed place, else null.
- question / options: for "clarify" only: one short question and up to four answers to choose from.
- reason: for "refuse" only.
- rationale: one sentence on how you read the request.

Gazetteer places (id | title | scale | aliases):
${places}

Landmarks inside listed places (id | title):
${landmarks}`;
}

export function interpretTask(text: string, store: BlueprintStore): AiTask<Interpretation> {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 500);
  return {
    task: 'interpret', promptVersion: INTERPRET_VERSION, system: interpretSystem(store), user: clean, schema: INTERPRET_SCHEMA as unknown as Record<string, unknown>,
    effort: 'low', maxTokens: 2000,
    validate: output => validateInterpretation(output, store),
  };
}

type Raw = { outcome: string; placeId: string | null; newPlace: { title: string; longitude: number; latitude: number; tradition: string | null } | null; startYear: number | null; endYear: number | null; scope: string; target: string | null; question: string | null; options: string[]; reason: string | null; rationale: string };
/** Everything the model returns is checked here; anything off contract is rejected, not corrected. */
export function validateInterpretation(output: unknown, store: BlueprintStore): Interpretation {
  const o = output as Raw;
  if (!o || typeof o !== 'object' || typeof o.rationale !== 'string') throw Error('Interpretation is not an object with a rationale');
  if (o.outcome === 'clarify') {
    if (!o.question?.trim()) throw Error('A clarification needs a question');
    if (!Array.isArray(o.options) || o.options.length > 4) throw Error('A clarification offers at most four options');
    return { outcome: 'clarify', question: o.question.trim(), options: o.options.map(String), rationale: o.rationale };
  }
  if (o.outcome === 'refuse') {
    if (!o.reason?.trim()) throw Error('A refusal needs a reason');
    return { outcome: 'refuse', reason: o.reason.trim(), rationale: o.rationale };
  }
  if (o.outcome !== 'request') throw Error(`Unknown outcome ${o.outcome}`);
  if (!o.placeId === !o.newPlace) throw Error('A request names exactly one of placeId or newPlace');
  if (o.placeId) {
    const entry = store.gazetteer().find(e => e.placeId === o.placeId);
    if (!entry || entry.feature) throw Error(`placeId ${o.placeId} is not a gazetteer place`);
  }
  if (o.newPlace) {
    if (store.gazetteer().some(e => e.title.toLowerCase() === o.newPlace!.title.trim().toLowerCase() || e.aliases.some(a => a.toLowerCase() === o.newPlace!.title.trim().toLowerCase()))) throw Error(`${o.newPlace.title} is in the gazetteer; use its id`);
    if (Math.abs(o.newPlace.longitude) > 180 || Math.abs(o.newPlace.latitude) > 85) throw Error('newPlace coordinate is out of range');
  }
  if (o.startYear === null || !Number.isInteger(o.startYear) || o.startYear < MIN_YEAR || o.startYear > MAX_YEAR) throw Error('startYear must be a supported integer year');
  if (o.endYear !== null && (!Number.isInteger(o.endYear) || o.endYear < o.startYear || o.endYear > MAX_YEAR)) throw Error('endYear must follow startYear');
  if (!['auto', ...SPATIAL_LODS].includes(o.scope)) throw Error('Unknown scope');
  if (o.target) {
    const place = o.placeId ? store.gazetteer().find(e => e.placeId === o.placeId) : undefined, blueprint = place && store.get(place.blueprint);
    const found = blueprint && (blueprint.features.some(f => f.id === o.target) || store.children(blueprint).some(c => c.features.some(f => f.id === o.target)));
    if (!found) throw Error(`target ${o.target} is not a feature of the requested place`);
  }
  const request = normaliseRequest({
    schema: 1,
    place: o.placeId ? { id: o.placeId } : { title: o.newPlace!.title.trim(), coordinate: [o.newPlace!.longitude, o.newPlace!.latitude], ...(o.newPlace!.tradition ? { tradition: o.newPlace!.tradition } : {}) },
    time: { start: { year: o.startYear }, ...(o.endYear !== null && o.endYear !== o.startYear ? { end: { year: o.endYear } } : {}) },
    scope: o.scope as SpatialLOD | 'auto', intent: o.target ? 'landmark' : 'tour', ...(o.target ? { target: o.target } : {}),
  });
  return { outcome: 'request', request, rationale: o.rationale };
}
