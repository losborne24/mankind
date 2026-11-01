import type { AiTask } from '@/lib/ai/boundary';
import { claimEvidence, type Claim } from '@/lib/ai/claims';
import type { HistoricalPeriod } from '@/lib/history/schema';
import type { BlueprintRef, Bounds, FeatureKind, PlanFeature, SpatialBlueprint, SpatialLOD } from '@/lib/plan/contracts';
import { validateBlueprint } from '@/lib/plan/contracts';
import { CODEC_VERSIONS } from '@/lib/plan/codecs';
import { inside } from '@/lib/plan/store';
import type { Coordinate } from '@/lib/scenarios/schema';

/**
 * Blueprint drafting (Phase 5B step 10). Documented anchors are copied from accepted claims by code, never by the model. The model
 * proposes only inferred features, each citing the claims it rests on and saying why. The result is a draft SpatialBlueprint that
 * must pass the contract and Checkpoint A, and is used only after a person accepts it.
 */
export const DRAFT_VERSION = 'draft-1';
export interface DraftFrame { id: string; title: string; placeId: string; placeTitle: string; aliases: string[]; lod: SpatialLOD; bounds: Bounds; applicability: HistoricalPeriod; traditions: string[]; parent?: BlueprintRef; anchor?: Coordinate }
/** The sources a draft cites, carried in the draft as a `sources@1` layer so journeys can cite them (lib/plan/sources.ts). */
export interface DraftSource { id: string; title: string; url: string; licence: string }
export interface InferredFeature { title: string; kind: FeatureKind; longitude: number; latitude: number; startYear: number | null; endYear: number | null; reason: string; claimIds: string[] }

const KINDS: FeatureKind[] = ['landmark', 'structure', 'open-space', 'route', 'zone', 'settlement', 'water', 'terrain', 'marker'];
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });
export const DRAFT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['inferred'],
  properties: { inferred: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'kind', 'longitude', 'latitude', 'startYear', 'endYear', 'reason', 'claimIds'], properties: {
    title: { type: 'string' }, kind: { type: 'string', enum: KINDS }, longitude: { type: 'number' }, latitude: { type: 'number' }, startYear: nullable({ type: 'integer' }), endYear: nullable({ type: 'integer' }),
    reason: { type: 'string' }, claimIds: { type: 'array', items: { type: 'string' } } } } } },
} as const;
const DRAFT_SYSTEM = `You help draft a dated 2D plan of a historical place for Mankind. Documented features are already placed from accepted claims; you only propose inferred features: things the claims imply but do not locate (for example the line of a street joining two documented gates, or a precinct around a documented temple).

Rules:
- Every inferred feature cites one or more claim ids from the list and gives a one-sentence reason.
- Place it inside the frame. Never move or restate a documented feature.
- Propose nothing the claims do not support. An empty list is a good answer when they support nothing more.
- Years are astronomical (1 BCE = 0); leave them null when the claims do not date the feature.`;

export function draftTask(frame: DraftFrame, claims: Claim[]): AiTask<InferredFeature[]> {
  const listed = claims.map(c => `- ${c.id} | ${c.feature} | ${c.kind} | ${c.coordinate ? c.coordinate.map(v => v.toFixed(6)).join(', ') : 'unlocated'} | dates ${c.existence.startYear ?? '?'}–${c.existence.endYear ?? '?'} | "${c.quote}"`).join('\n');
  return {
    task: 'draft-blueprint', promptVersion: DRAFT_VERSION, system: DRAFT_SYSTEM,
    user: `Frame: ${frame.title} (${frame.lod}), bounds west ${frame.bounds[0]}, south ${frame.bounds[1]}, east ${frame.bounds[2]}, north ${frame.bounds[3]}; date ${frame.applicability.start.year}.\n\nAccepted claims (id | feature | kind | position | dates | quote):\n${listed}`,
    schema: DRAFT_SCHEMA as unknown as Record<string, unknown>, effort: 'high', maxTokens: 8000,
    validate: output => {
      const o = output as { inferred: InferredFeature[] };
      if (!o || !Array.isArray(o.inferred) || o.inferred.length > 100) throw Error('Expected up to 100 inferred features');
      const ids = new Set(claims.map(c => c.id));
      for (const f of o.inferred) {
        if (!f.title?.trim() || !f.reason?.trim()) throw Error('An inferred feature needs a title and a reason');
        if (!KINDS.includes(f.kind)) throw Error(`Unknown kind ${f.kind}`);
        if (!f.claimIds.length || f.claimIds.some(id => !ids.has(id))) throw Error(`${f.title} must cite accepted claims only`);
        if (!inside(frame.bounds, [f.longitude, f.latitude])) throw Error(`${f.title} lies outside the frame`);
      }
      return o.inferred;
    },
  };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
/** A feature whose source gives no date is shown only at the frame's own date, as an approximate interpretation (never timeless). */
function dates(start: number | null, end: number | null, frame: DraftFrame): Pick<PlanFeature, 'chronology' | 'existence'> & { assumed: boolean } {
  if (start !== null && end !== null) return { chronology: 'dated', existence: { start: { year: start }, end: { year: end } }, assumed: false };
  if (start !== null) return { chronology: 'from-start', existence: { start: { year: start } }, assumed: false };
  const at = frame.applicability.end ?? frame.applicability.start;
  return { chronology: 'dated', existence: { start: frame.applicability.start, end: at, approximate: true }, assumed: true };
}

/** Deterministic assembly: documented features copied from claims, then the model's inferred features. */
export function assembleDraft(frame: DraftFrame, claims: Claim[], inferred: InferredFeature[], sources: DraftSource[] = [], sourcesFile = 'data/plan/drafts/sources.json'): SpatialBlueprint {
  const features: PlanFeature[] = [], ids = new Set<string>();
  const unique = (base: string) => { let id = base, n = 2; while (ids.has(id)) id = `${base}-${n++}`; ids.add(id); return id; };
  for (const c of claims) {
    if (!c.coordinate || !inside(frame.bounds, c.coordinate)) continue;
    const d = dates(c.existence.startYear, c.existence.endYear, frame), evidence = claimEvidence(c);
    features.push({ id: unique(`documented:${slug(c.feature)}`), kind: c.kind, title: c.feature, chronology: d.chronology, existence: d.existence,
      evidence: d.assumed ? { ...evidence, certainty: 'inferred', note: `${evidence.note} The source does not date it; shown at ${frame.applicability.start.year} as an approximate interpretation.` } : evidence,
      refs: [{ store: 'claim', id: c.id }, { store: 'source', id: c.sourceId }], geometry: { type: 'point', anchor: [...c.coordinate] as Coordinate }, rung: 5 });
  }
  const byId = new Map(claims.map(c => [c.id, c]));
  for (const f of inferred) {
    const d = dates(f.startYear, f.endYear, frame), cited = f.claimIds.map(id => byId.get(id)!);
    features.push({ id: unique(`inferred:${slug(f.title)}`), kind: f.kind, title: f.title, chronology: d.chronology, existence: d.existence,
      evidence: { certainty: 'inferred', sources: [...new Set(cited.map(c => c.sourceId))], note: `${f.reason} Rests on ${f.claimIds.join(', ')} (drafted ${DRAFT_VERSION}).` },
      refs: cited.map(c => ({ store: 'claim', id: c.id })), geometry: { type: 'point', anchor: [f.longitude, f.latitude] }, rung: 5 });
  }
  const draft: SpatialBlueprint = {
    schema: 1, id: frame.id, version: 1, title: frame.title, lod: frame.lod,
    place: { id: frame.placeId, title: frame.placeTitle, aliases: frame.aliases, anchor: frame.anchor ?? [(frame.bounds[0] + frame.bounds[2]) / 2, (frame.bounds[1] + frame.bounds[3]) / 2], refs: [] },
    bounds: frame.bounds, boundsEvidence: { certainty: 'illustrative', sources: [], note: 'Drafting frame chosen for the request; not a boundary.' },
    applicability: frame.applicability, traditions: frame.traditions, ...(frame.parent ? { parent: frame.parent } : {}), children: [], features, generators: [],
    layers: (() => { const cited = new Set(features.flatMap(f => f.evidence.sources)), used = sources.filter(s => cited.has(s.id)).sort((a, b) => a.id.localeCompare(b.id)); return used.length ? [{ id: 'sources', role: 'sources' as const, codec: 'sources@1', output: sourcesFile, serialisation: { indent: 1 as const }, order: ['sources'], header: {}, collections: { sources: used } }] : []; })(),
    provenance: { builtFrom: [...new Set(claims.map(c => c.sourceId))], note: `AI-drafted (${DRAFT_VERSION}) from ${claims.length} accepted claims; documented positions copied from the claims, ${inferred.length} inferred features proposed. A draft until reviewed.` },
    versions: { schema: 1, codecs: { ...CODEC_VERSIONS } },
  };
  return validateBlueprint(draft);
}

/** Coverage of a golden blueprint by a draft, and whether every documented position is exactly its claim's. */
export function scoreDraft(draft: SpatialBlueprint, golden: SpatialBlueprint, claims: Claim[], metres = 300) {
  const distance = (a: Coordinate, b: Coordinate) => Math.hypot((a[0] - b[0]) * Math.cos(a[1] * Math.PI / 180) * 111320, (a[1] - b[1]) * 110950);
  const points = draft.features.map(f => f.geometry.anchor!).filter(Boolean);
  const targets = golden.features.filter(f => ['marker', 'landmark', 'settlement', 'structure'].includes(f.kind) && f.geometry.anchor && inside(draft.bounds, f.geometry.anchor));
  const covered = targets.filter(t => points.some(p => distance(p, t.geometry.anchor!) <= metres));
  const byId = new Map(claims.map(c => [c.id, c]));
  const exact = draft.features.filter(f => f.id.startsWith('documented:')).every(f => { const c = byId.get(f.refs.find(r => r.store === 'claim')!.id)!; return c.coordinate![0] === f.geometry.anchor![0] && c.coordinate![1] === f.geometry.anchor![1]; });
  return { goldenTargets: targets.length, covered: covered.length, coverage: targets.length ? covered.length / targets.length : null, documented: draft.features.filter(f => f.id.startsWith('documented:')).length, inferred: draft.features.filter(f => f.id.startsWith('inferred:')).length, documentedAnchorsExact: exact, missed: targets.filter(t => !covered.includes(t)).map(t => t.title) };
}
