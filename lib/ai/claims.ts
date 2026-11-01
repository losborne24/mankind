import { readFileSync } from 'node:fs';
import type { AiTask } from '@/lib/ai/boundary';
import type { Evidence } from '@/lib/history/schema';
import type { Coordinate } from '@/lib/scenarios/schema';
import type { SpatialBlueprint } from '@/lib/plan/contracts';
import { MAX_YEAR, MIN_YEAR } from '@/lib/historicalDate';
import { wikidataYearWords, type WikidataPlace } from '@/lib/research/sources';

/**
 * Claim extraction (Phase 5B step 9): discrete, quotable claims from sources already cached and licensed, never the open web.
 * A source is rendered to a fixed text document; every claim must quote it exactly, and any coordinate or year a claim states
 * must appear in its quote. Claims that fail are discarded and counted. Surviving claims are drafts until a person accepts them.
 */
/** claims-2: documents from Wikidata, Wikipedia and OpenStreetMap as well as Pleiades; dates written in words. */
export const CLAIMS_VERSION = 'claims-2';
export interface SourceDocument { sourceId: string; title: string; url: string; licence: string; text: string }
export interface Claim {
  id: string;
  sourceId: string;
  feature: string;
  kind: 'landmark' | 'structure' | 'open-space' | 'route' | 'zone' | 'settlement' | 'water' | 'terrain';
  coordinate: Coordinate | null;
  existence: { startYear: number | null; endYear: number | null };
  quote: string;
  confidence: 'high' | 'medium' | 'low';
  note: string;
}
export interface ExtractionResult { sourceId: string; accepted: Claim[]; discarded: { claim: unknown; reason: string }[]; /** Who produced the claims: the model served, or `manual:<chat app>`. */ extractedBy?: string; promptVersion?: string }

type PleiadesPlace = { id: number; uri: string; title: string; description: string; reprPoint: Coordinate | null; locations: { title: string; provenance: string; accuracy: number | null; start: number | null; end: number | null }[] };
type PleiadesFile = { accessed: string; licence: string; licenceUrl: string; places: Record<string, PleiadesPlace> };
export const PLEIADES_FILES = ['data/history/forum-boarium/source/pleiades.json', 'data/history/rome/source/pleiades-zoning.json'];

/** One document per cached Pleiades place, keyed as the fixtures cite it (`source:pleiades-<key>`). Deterministic text. */
export function pleiadesDocuments(files = PLEIADES_FILES): SourceDocument[] {
  const docs = new Map<string, SourceDocument>();
  for (const file of files) {
    const data = JSON.parse(readFileSync(file, 'utf8')) as PleiadesFile;
    for (const [key, p] of Object.entries(data.places)) {
      const sourceId = `source:pleiades-${key}`;
      if (!docs.has(sourceId)) docs.set(sourceId, pleiadesDocument(sourceId, p, data.accessed, data.licence));
    }
  }
  return [...docs.values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId));
}
const pleiadesDocument = (sourceId: string, p: PleiadesPlace, accessed: string, licence: string): SourceDocument => ({ sourceId, title: p.title, url: p.uri, licence, text: [
  `Source: Pleiades place ${p.id} (${p.uri}), accessed ${accessed}.`, `Title: ${p.title}`, `Description: ${p.description || '(none)'}`,
  p.reprPoint ? `Representative point: longitude ${p.reprPoint[0].toFixed(6)}, latitude ${p.reprPoint[1].toFixed(6)}.` : 'Representative point: none.',
  ...p.locations.map((l, n) => `Location ${n + 1}: "${l.title}". Provenance: ${l.provenance}. Accuracy: ${l.accuracy ?? 'unknown'} m. This location record is attested for ${l.start ?? '?'} to ${l.end ?? '?'} (the dates of the mapping, not of the feature).`)].join('\n') });

/**
 * Documents for a place fetched by Phase 5C (data/history/<slug>/source/): one per Wikidata item, Pleiades record, Wikipedia
 * summary and OpenStreetMap feature, rendered deterministically so claims can quote them. Wikidata dates are written in words as
 * recorded ("100 BCE"); the claim prompt converts them to astronomical years and the verifier accepts either form.
 */
export function placeDocuments(slug: string): SourceDocument[] {
  const dir = `data/history/${slug}/source`;
  function read<T>(f: string): T | undefined { try { return JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as T; } catch { return undefined; } }
  const docs: SourceDocument[] = [];
  const wd = read<{ accessed: string; licence: string; places: WikidataPlace[] }>('wikidata.json');
  for (const w of wd?.places ?? []) docs.push({ sourceId: `source:wikidata-${w.qid}`, title: w.label, url: w.uri, licence: wd!.licence, text: [
    `Source: Wikidata item ${w.qid} (${w.uri}), accessed ${wd!.accessed}.`, `Label: ${w.label}`, `Description: ${w.description ?? '(none)'}`,
    `Coordinate: longitude ${w.coordinate[0].toFixed(6)}, latitude ${w.coordinate[1].toFixed(6)}.`,
    `Inception: ${w.inception ? wikidataYearWords(w.inception) : 'not recorded'}.`, `Dissolved, abolished or demolished: ${w.dissolved ? wikidataYearWords(w.dissolved) : 'not recorded'}.`,
    `Pleiades ID: ${w.pleiadesId ?? 'none'}.`].join('\n') });
  const pl = read<{ accessed: string; licence: string; places: PleiadesPlace[] }>('pleiades.json');
  for (const p of pl?.places ?? []) docs.push(pleiadesDocument(`source:pleiades-${p.id}`, p, pl!.accessed, pl!.licence));
  const wp = read<{ accessed: string; licence: string; summaries: { title: string; url: string; extract: string; revision: string | null }[] }>('wikipedia.json');
  for (const a of wp?.summaries ?? []) docs.push({ sourceId: `source:wikipedia-${a.title.replace(/\s+/g, '_')}`, title: a.title, url: a.url, licence: wp!.licence, text:
    `Source: Wikipedia article "${a.title}" (${a.url}), revision ${a.revision ?? 'unknown'}, accessed ${wp!.accessed}.\nSummary: ${a.extract}` });
  const osm = read<{ accessed: string; licence: string; features: { type: string; id: number; name: string; historic: string; centre: Coordinate; tags: Record<string, string> }[] }>('osm.json');
  for (const f of osm?.features ?? []) docs.push({ sourceId: `source:osm-${f.type}-${f.id}`, title: f.name, url: `https://www.openstreetmap.org/${f.type}/${f.id}`, licence: osm!.licence, text: [
    `Source: OpenStreetMap ${f.type} ${f.id} (https://www.openstreetmap.org/${f.type}/${f.id}), accessed ${osm!.accessed}. Present-day mapping of what survives.`,
    `Name: ${f.name}`, `Historic: ${f.historic}`, `Centre: longitude ${f.centre[0].toFixed(6)}, latitude ${f.centre[1].toFixed(6)}.`,
    `Tags: ${Object.entries(f.tags).map(([k, v]) => `${k}=${v}`).join('; ')}`].join('\n') });
  return docs.sort((a, b) => a.sourceId.localeCompare(b.sourceId, 'en', { numeric: true }));
}
/** Sources as the planner and journeys cite them: id, title, public URL, licence. */
export const sourceEntries = (docs: SourceDocument[]) => docs.map(d => ({ id: d.sourceId, title: d.title, url: d.url, licence: d.licence }));

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });
export const CLAIMS_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['claims'],
  properties: { claims: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['feature', 'kind', 'longitude', 'latitude', 'startYear', 'endYear', 'quote', 'confidence', 'note'], properties: {
    feature: { type: 'string' }, kind: { type: 'string', enum: ['landmark', 'structure', 'open-space', 'route', 'zone', 'settlement', 'water', 'terrain'] },
    longitude: nullable({ type: 'number' }), latitude: nullable({ type: 'number' }), startYear: nullable({ type: 'integer' }), endYear: nullable({ type: 'integer' }),
    quote: { type: 'string' }, confidence: { type: 'string', enum: ['high', 'medium', 'low'] }, note: { type: 'string' } } } } },
} as const;
const CLAIMS_SYSTEM = `You extract discrete historical claims from one source document for Mankind, a historical world explorer. Output only what the document states.

Rules:
- One claim per feature the document locates or dates. A claim names the feature, its kind, and where and when it stood, as far as the document says.
- quote: copy the exact words from the document that support the claim, character for character. Every number you give (longitude, latitude, a year) must appear in your quote.
- longitude / latitude: only from a representative point or coordinate written in the document; otherwise null.
- startYear / endYear: only when the document dates the feature itself, in astronomical years (1 BCE = 0, so "700 BCE" is -699 and "120 CE" is 120). A Wikidata inception is the start; "dissolved, abolished or demolished" is the end. The attestation dates of location records, and OpenStreetMap's present-day mapping, are not dates of the feature: never use them. Unknown stays null.
- confidence: "high" when the document states it plainly, "medium" when it is approximate, "low" when it is only implied.
- note: one sentence of context, or an empty string.
Do not add knowledge from outside the document.`;

export function claimsTask(doc: SourceDocument): AiTask<Omit<Claim, 'id' | 'sourceId'>[]> {
  return { task: 'claims', promptVersion: CLAIMS_VERSION, system: CLAIMS_SYSTEM, user: doc.text, schema: CLAIMS_SCHEMA as unknown as Record<string, unknown>, effort: 'medium', maxTokens: 6000,
    validate: output => {
      const o = output as { claims: Raw[] };
      if (!o || !Array.isArray(o.claims) || o.claims.length > 50) throw Error('Expected up to 50 claims');
      return o.claims.map(c => ({ feature: String(c.feature), kind: c.kind, coordinate: c.longitude !== null && c.latitude !== null ? [c.longitude, c.latitude] as Coordinate : null, existence: { startYear: c.startYear, endYear: c.endYear }, quote: String(c.quote), confidence: c.confidence, note: String(c.note ?? '') }));
    } };
}
type Raw = { feature: string; kind: Claim['kind']; longitude: number | null; latitude: number | null; startYear: number | null; endYear: number | null; quote: string; confidence: Claim['confidence']; note: string };

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
/** The checks a claim must pass to be kept. Returns the reason it fails, or null. */
export function claimProblem(claim: Omit<Claim, 'id' | 'sourceId'>, doc: SourceDocument): string | null {
  const quote = squash(claim.quote);
  if (quote.length < 8) return 'quote too short to verify';
  if (!squash(doc.text).includes(quote)) return 'quote does not appear in the source';
  if (!claim.feature.trim()) return 'no feature named';
  if (claim.coordinate) {
    const [lng, lat] = claim.coordinate;
    if (Math.abs(lng) > 180 || Math.abs(lat) > 85) return 'coordinate out of range';
    // The quoted digits must carry the number to at least 4 decimals (about 10 m): no coordinate from outside the document.
    const inQuote = (v: number) => [...quote.matchAll(/-?\d+\.\d+/g)].some(m => Math.abs(Number(m[0]) - v) < 1e-4);
    if (!inQuote(lng) || !inQuote(lat)) return 'coordinate not in the quote';
  }
  for (const y of [claim.existence.startYear, claim.existence.endYear]) {
    if (y === null) continue;
    if (!Number.isInteger(y) || y < MIN_YEAR || y > MAX_YEAR) return 'year out of range';
    // CE years appear as written. A BCE year y (astronomical, 1 BCE = 0) appears as its era year 1 - y beside BCE/BC, or exactly
    // as a signed number: so a conversion that is one year off (700 BCE given as -700) is caught.
    const ok = y > 0 ? new RegExp(`\\b${y}\\b`).test(quote) : new RegExp(`\\b${1 - y}\\s*(BCE|BC|B\\.C\\.)`).test(quote) || new RegExp(`(^|[^\\d])${y}\\b`).test(quote);
    if (!ok) return `year ${y} not in the quote`;
  }
  if (claim.existence.startYear !== null && claim.existence.endYear !== null && claim.existence.endYear < claim.existence.startYear) return 'reversed dates';
  return null;
}
export function verifyClaims(doc: SourceDocument, raw: Omit<Claim, 'id' | 'sourceId'>[]): ExtractionResult {
  const accepted: Claim[] = [], discarded: ExtractionResult['discarded'] = [];
  raw.forEach((claim, n) => {
    const problem = claimProblem(claim, doc);
    if (problem) discarded.push({ claim, reason: problem });
    else accepted.push({ ...claim, quote: squash(claim.quote), id: `claim:${doc.sourceId.replace(/^source:/, '')}:${n + 1}`, sourceId: doc.sourceId });
  });
  return { sourceId: doc.sourceId, accepted, discarded };
}

/**
 * Agreement with the hand-curated golden blueprints: the curated features citing a source are what extraction from that source
 * should find. A located claim matches a curated feature within `metres`. Curators sometimes moved points on purpose (a region
 * marker set on its road rather than at Pleiades' later gate), which shows up as a miss and is reported as such.
 */
export function scoreClaims(results: ExtractionResult[], blueprints: readonly SpatialBlueprint[], metres = 300) {
  const curated = new Map<string, { id: string; title: string; at: Coordinate }[]>();
  for (const b of blueprints) for (const f of b.features) {
    // Point-like features only: a zone or line citing a source (a district, the river) has no single position a claim should hit.
    const box = f.geometry.bbox, small = box && Math.hypot((box[2] - box[0]) * Math.cos(box[1] * Math.PI / 180) * 111320, (box[3] - box[1]) * 110950) <= 600;
    const at = f.geometry.anchor ?? (small ? [(box![0] + box![2]) / 2, (box![1] + box![3]) / 2] as Coordinate : undefined);
    if (!at || b.lod === 'empire' || b.lod === 'region') continue;
    for (const s of f.evidence.sources.filter(s => s.startsWith('source:pleiades-'))) curated.set(s, [...(curated.get(s) ?? []).filter(x => x.id !== `${b.id}#${f.id}`), { id: `${b.id}#${f.id}`, title: f.title, at }]);
  }
  const distance = (a: Coordinate, b: Coordinate) => Math.hypot((a[0] - b[0]) * Math.cos(a[1] * Math.PI / 180) * 111320, (a[1] - b[1]) * 110950);
  let located = 0, matchedClaims = 0, expected = 0, found = 0;
  const perSource = results.map(r => {
    // A source with no curated counterpart (a newly fetched place) is reported but not scored.
    const want = curated.get(r.sourceId) ?? [], claims = want.length ? r.accepted.filter(c => c.coordinate) : [];
    const hits = claims.filter(c => want.some(w => distance(c.coordinate!, w.at) <= metres));
    const covered = want.filter(w => claims.some(c => distance(c.coordinate!, w.at) <= metres));
    located += claims.length; matchedClaims += hits.length; expected += want.length; found += covered.length;
    return { sourceId: r.sourceId, claims: r.accepted.length, discarded: r.discarded.length, located: claims.length, matched: hits.length, curated: want.length, covered: covered.length, missed: want.filter(w => !covered.includes(w)).map(w => w.title) };
  });
  return { precision: located ? matchedClaims / located : null, recall: expected ? found / expected : null, discarded: results.reduce((s, r) => s + r.discarded.length, 0), accepted: results.reduce((s, r) => s + r.accepted.length, 0), perSource };
}

/** A claim as Evidence for a drafted blueprint feature: approximate positions are inferences about where, as in the codecs. */
export const claimEvidence = (c: Claim): Evidence => ({ certainty: c.confidence === 'high' ? 'documented' : 'inferred', sources: [c.sourceId], note: `${c.quote}${c.note ? ` ${c.note}` : ''} (${c.id}, extracted ${CLAIMS_VERSION}, accepted by review)` });
