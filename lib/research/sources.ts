import type { Coordinate } from '@/lib/scenarios/schema';

/**
 * Phase 5C source acquisition: the allow-list, the queries and the normalisers that turn raw responses into the trimmed snapshots
 * kept under data/history/<place>/source/. Pure: scripts/research/fetch-place.mjs does the network work, and a raw response is
 * promoted from quarantine only when it passes these checks. No other host is ever contacted, and every snapshot keeps its licence.
 */
export const ALLOWED_HOSTS = ['query.wikidata.org', 'www.wikidata.org', 'pleiades.stoa.org', 'en.wikipedia.org', 'overpass-api.de'] as const;
export const USER_AGENT = 'mankind-research/0.1 (osborneleith@gmail.com)';
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const LICENCES = {
  wikidata: { licence: 'CC0 1.0', licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  pleiades: { licence: 'CC BY 3.0 · Pleiades contributors', licenceUrl: 'https://creativecommons.org/licenses/by/3.0/' },
  wikipedia: { licence: 'CC BY-SA 4.0 · Wikipedia contributors (summaries quoted for claims, not republished)', licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  osm: { licence: 'ODbL 1.0 · © OpenStreetMap contributors', licenceUrl: 'https://www.openstreetmap.org/copyright' },
} as const;

export function assertAllowed(url: string): URL {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !(ALLOWED_HOSTS as readonly string[]).includes(u.hostname) || u.username || u.password) throw Error(`${u.hostname} is not an allowed research host`);
  return u;
}
export const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/** Wikidata items within `km` of a point that are historical places: with a Pleiades id, or a recorded inception before 1500. */
export function wikidataAroundQuery([lng, lat]: Coordinate, km: number, limit = 80): string {
  return `SELECT ?item ?itemLabel ?itemDescription ?coord ?pleiades ?inception ?dissolved ?article WHERE {
  SERVICE wikibase:around { ?item wdt:P625 ?coord . bd:serviceParam wikibase:center "Point(${lng} ${lat})"^^geo:wktLiteral . bd:serviceParam wikibase:radius "${km}" . }
  OPTIONAL { ?item wdt:P1584 ?pleiades . }
  OPTIONAL { ?item wdt:P571 ?inception . }
  OPTIONAL { ?item wdt:P576 ?dissolved . }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }
  FILTER(BOUND(?pleiades) || (BOUND(?inception) && YEAR(?inception) < 1500))
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
} LIMIT ${limit}`;
}
export interface WikidataPlace { qid: string; uri: string; label: string; description: string | null; coordinate: Coordinate; pleiadesId: string | null; inception: string | null; dissolved: string | null; article: string | null }
type Binding = Record<string, { value: string } | undefined>;
/** Wikidata dates use historical numbering ("-0100" is 100 BCE); kept as written and rendered in words, never converted silently. */
export function normaliseWikidata(json: unknown): WikidataPlace[] {
  const rows = (json as { results?: { bindings?: Binding[] } })?.results?.bindings;
  if (!Array.isArray(rows)) throw Error('Wikidata: not a SPARQL JSON result');
  const places = new Map<string, WikidataPlace>();
  for (const r of rows) {
    const uri = r.item?.value, m = r.coord?.value.match(/^Point\((-?[\d.]+) (-?[\d.]+)\)$/);
    if (!uri?.startsWith('http://www.wikidata.org/entity/Q') || !m) continue;
    const qid = uri.split('/').pop()!, existing = places.get(qid);
    const place: WikidataPlace = { qid, uri: `https://www.wikidata.org/wiki/${qid}`, label: r.itemLabel?.value ?? qid, description: r.itemDescription?.value ?? null, coordinate: [Number(m[1]), Number(m[2])],
      pleiadesId: r.pleiades?.value ?? null, inception: r.inception?.value ?? null, dissolved: r.dissolved?.value ?? null, article: r.article?.value ?? null };
    // Several values of a property give several rows; the earliest inception and latest dissolution are kept, as recorded.
    if (existing) {
      if (place.inception && (!existing.inception || wikidataYear(place.inception)! < wikidataYear(existing.inception)!)) existing.inception = place.inception;
      if (place.dissolved && (!existing.dissolved || wikidataYear(place.dissolved)! > wikidataYear(existing.dissolved)!)) existing.dissolved = place.dissolved;
      existing.pleiadesId ??= place.pleiadesId; existing.article ??= place.article;
    } else places.set(qid, place);
  }
  return [...places.values()].sort((a, b) => a.qid.localeCompare(b.qid, 'en', { numeric: true }));
}
/** Wikidata's own year number (historical: -100 is 100 BCE). */
export const wikidataYear = (value: string) => { const m = value.match(/^([+-]?)(\d+)-/); return m ? (m[1] === '-' ? -Number(m[2]) : Number(m[2])) : null; };
/** In words, as a document states it: "100 BCE", "AD 100". */
export const wikidataYearWords = (value: string) => { const y = wikidataYear(value); return y === null ? 'unknown' : y < 0 ? `${-y} BCE` : `${y} CE`; };

export interface PleiadesSnapshot { id: number; uri: string; title: string; description: string; reprPoint: Coordinate | null; rights: string; locations: { title: string; provenance: string; accuracy: number | null; start: number | null; end: number | null }[] }
export function normalisePleiades(json: unknown): PleiadesSnapshot {
  const d = json as { id?: string | number; uri?: string; title?: string; description?: string; reprPoint?: Coordinate | null; rights?: string; locations?: { title: string; provenance: string; accuracy_value?: number | null; start?: number | null; end?: number | null }[] };
  if (!d?.uri?.startsWith('https://pleiades.stoa.org/places/') || typeof d.title !== 'string') throw Error('Pleiades: not a place record');
  return { id: Number(d.id), uri: d.uri, title: d.title, description: d.description ?? '', reprPoint: d.reprPoint ?? null, rights: d.rights ?? '',
    locations: (d.locations ?? []).map(l => ({ title: l.title, provenance: l.provenance, accuracy: l.accuracy_value ?? null, start: l.start ?? null, end: l.end ?? null })) };
}

export interface WikipediaSummary { title: string; url: string; extract: string; revision: string | null; timestamp: string | null }
export function normaliseWikipedia(json: unknown): WikipediaSummary {
  const d = json as { title?: string; extract?: string; revision?: string; timestamp?: string; content_urls?: { desktop?: { page?: string } } };
  if (typeof d?.title !== 'string' || typeof d.extract !== 'string' || !d.content_urls?.desktop?.page?.startsWith('https://en.wikipedia.org/')) throw Error('Wikipedia: not a page summary');
  return { title: d.title, url: d.content_urls.desktop.page, extract: d.extract, revision: d.revision ?? null, timestamp: d.timestamp ?? null };
}

/** Present-day remains with a historic tag within `metres`: what survives, as mapped today. */
export const overpassAroundQuery = ([lng, lat]: Coordinate, metres: number) =>
  `[out:json][timeout:60];(nwr(around:${metres},${lat},${lng})["historic"~"archaeological_site|ruins|monument|building|city_gate|tomb"]["name"];);out center tags;`;
export interface OsmFeature { type: 'node' | 'way' | 'relation'; id: number; name: string; historic: string; centre: Coordinate; tags: Record<string, string> }
export function normaliseOverpass(json: unknown): { baseTimestamp: string | null; features: OsmFeature[] } {
  const d = json as { osm3s?: { timestamp_osm_base?: string }; elements?: { type: OsmFeature['type']; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] };
  if (!Array.isArray(d?.elements)) throw Error('Overpass: not an Overpass JSON result');
  const keep = ['name', 'name:en', 'name:la', 'historic', 'historic:civilization', 'archaeological_site', 'start_date', 'end_date', 'wikidata', 'wikipedia', 'heritage'];
  return { baseTimestamp: d.osm3s?.timestamp_osm_base ?? null, features: d.elements.flatMap(e => {
    const at = e.center ?? (e.lat !== undefined ? { lat: e.lat, lon: e.lon! } : undefined);
    if (!at || !e.tags?.name || !e.tags.historic) return [];
    return [{ type: e.type, id: e.id, name: e.tags.name, historic: e.tags.historic, centre: [at.lon, at.lat] as Coordinate, tags: Object.fromEntries(Object.entries(e.tags).filter(([k]) => keep.includes(k))) }];
  }).sort((a, b) => a.type.localeCompare(b.type) || a.id - b.id) };
}

/** A promoted snapshot's record in the place manifest. */
export interface ManifestEntry { source: keyof typeof LICENCES; file: string; requests: string[]; accessed: string; licence: string; licenceUrl: string; sha256: string; records: number }
