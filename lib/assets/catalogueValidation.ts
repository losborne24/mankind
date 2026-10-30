import type { HistoricalPeriod, HistoricalSource } from '@/lib/history/schema';
import { periodBounds } from '@/lib/history/time';

export interface CatalogueVersion {
  id: string; version: number; title: string; placeId: string;
  category: 'building' | 'infrastructure';
  period: HistoricalPeriod;
  sources: HistoricalSource[];
  features: { title: string; certainty: 'documented' | 'inferred' | 'unknown'; sourceIds: string[]; note: string }[];
  limitations: string[];
  rights: { status: 'unresolved' | 'cleared'; title: string; url?: string; provenancePath?: string; attribution?: string; note: string };
  rendering?: { registryId: string; sha256: string };
}
export interface CatalogueReview { id: string; version: number; status: 'draft' | 'usable' | 'retired'; at: string; reviewer: string; note: string }
export interface AssetCatalogue { version: 1; entries: CatalogueVersion[]; reviews: CatalogueReview[] }
export const catalogueKey = (entry: { id: string; version: number }) => `${entry.id}@${entry.version}`;
export function catalogueStatus(catalogue: AssetCatalogue, entry: { id: string; version: number }): CatalogueReview['status'] {
  return catalogue.reviews.filter(r => catalogueKey(r) === catalogueKey(entry)).at(-1)?.status ?? 'draft';
}
/** Strict detached JSON metadata; model files/registry bindings are checked by the local ingest command. */
export function validateAssetCatalogue(value: unknown): AssetCatalogue {
  let nodes = 0;
  const seen = new Set<object>();
  const plain = (v: unknown, depth = 0): void => {
    if (++nodes > 100000 || depth > 24) throw Error('Catalogue complexity limit');
    if (v === null || typeof v === 'boolean' || typeof v === 'number' && Number.isFinite(v)) return;
    if (typeof v === 'string') { if (v.length > 16000) throw Error('Catalogue text limit'); return; }
    if (!v || typeof v !== 'object' || !Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype || seen.has(v) || Object.getOwnPropertySymbols(v).length) throw Error('Expected plain catalogue JSON');
    if (Array.isArray(v) && (v.length > 10000 || Object.keys(v).length !== v.length)) throw Error('Expected dense catalogue array');
    seen.add(v);
    for (const [key, d] of Object.entries(Object.getOwnPropertyDescriptors(v))) {
      if (Array.isArray(v) && key === 'length') continue;
      if (!d.enumerable || !('value' in d)) throw Error('Expected catalogue data property');
      plain(d.value, depth + 1);
    }
    seen.delete(v);
  };
  plain(value);
  const record = (v: unknown, keys: string[]) => {
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !keys.includes(k))) throw Error('Unknown catalogue field or expected record');
    return v as Record<string, unknown>;
  };
  const text = (v: unknown) => { if (typeof v !== 'string' || !v.trim()) throw Error('Expected catalogue text'); return v; };
  const id = (v: unknown) => { if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(text(v))) throw Error('Invalid catalogue ID'); };
  const version = (v: unknown) => { if (!Number.isSafeInteger(v) || (v as number) < 1 || (v as number) > 1000000) throw Error('Invalid catalogue version'); };
  const list = (v: unknown): unknown[] => { if (!Array.isArray(v)) throw Error('Expected catalogue array'); return v; };
  const one = (v: unknown, choices: string[]) => { if (!choices.includes(text(v))) throw Error('Unknown catalogue status or category'); };
  const url = (v: unknown) => { const u = new URL(text(v)); if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw Error('Expected public catalogue source URL'); };
  const date = (v: unknown) => { const s = text(v), d = new Date(`${s}T00:00:00Z`); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw Error('Invalid catalogue review/access date'); };
  const root = record(value, ['version', 'entries', 'reviews']);
  if (root.version !== 1) throw Error('Unsupported catalogue version');
  const entries = new Map<string, CatalogueVersion>();
  const identities = new Map<string, string>();
  for (const item of list(root.entries)) {
    const e = record(item, ['id', 'version', 'title', 'placeId', 'category', 'period', 'sources', 'features', 'limitations', 'rights', 'rendering']);
    id(e.id); version(e.version); text(e.title); id(e.placeId); one(e.category, ['building', 'infrastructure']);
    const identity = `${e.placeId}:${e.category}`;
    if (identities.has(e.id as string) && identities.get(e.id as string) !== identity) throw Error('Catalogue identity cannot change place or category');
    identities.set(e.id as string, identity);
    const key = catalogueKey(e as unknown as CatalogueVersion); if (entries.has(key)) throw Error('Duplicate catalogue version');
    const p = record(e.period, ['start', 'end', 'approximate', 'uncertaintyYears']); periodBounds(p as unknown as HistoricalPeriod);
    if (p.approximate !== undefined && typeof p.approximate !== 'boolean' || p.uncertaintyYears !== undefined && (typeof p.uncertaintyYears !== 'number' || p.uncertaintyYears < 0 || p.uncertaintyYears > 1000)) throw Error('Invalid catalogue date uncertainty');
    const sources = new Set<string>();
    for (const item of list(e.sources)) {
      const s = record(item, ['id', 'title', 'url', 'publisher', 'accessed', 'citation']); id(s.id); text(s.title); text(s.publisher); url(s.url); date(s.accessed);
      if (s.citation !== undefined) text(s.citation);
      if (sources.has(s.id as string)) throw Error('Duplicate catalogue source'); sources.add(s.id as string);
    }
    for (const item of list(e.features)) {
      const f = record(item, ['title', 'certainty', 'sourceIds', 'note']); text(f.title); text(f.note); one(f.certainty, ['documented', 'inferred', 'unknown']);
      const refs = list(f.sourceIds); if (new Set(refs).size !== refs.length || refs.some(r => !sources.has(r as string))) throw Error('Unknown or duplicate catalogue feature source');
      if (f.certainty !== 'unknown' && !refs.length) throw Error('Catalogue feature needs evidence');
    }
    list(e.limitations).forEach(text);
    const rights = record(e.rights, ['status', 'title', 'url', 'provenancePath', 'attribution', 'note']); one(rights.status, ['unresolved', 'cleared']); text(rights.title); text(rights.note);
    if (rights.provenancePath !== undefined && (!/^[a-zA-Z0-9][a-zA-Z0-9_./-]*\.md$/.test(text(rights.provenancePath)) || text(rights.provenancePath).split('/').some(part => part === '..' || part === '.'))) throw Error('Invalid local model provenance path');
    if (rights.url !== undefined) url(rights.url); if (rights.attribution !== undefined) text(rights.attribution);
    if (e.rendering !== undefined) { const r = record(e.rendering, ['registryId', 'sha256']); id(r.registryId); if (!/^[a-f0-9]{64}$/.test(text(r.sha256))) throw Error('Invalid model SHA-256'); }
    entries.set(key, item as CatalogueVersion);
  }
  const previous = new Map<string, CatalogueReview>();
  for (const item of list(root.reviews)) {
    const r = record(item, ['id', 'version', 'status', 'at', 'reviewer', 'note']); id(r.id); version(r.version); one(r.status, ['draft', 'usable', 'retired']); date(r.at); text(r.reviewer); text(r.note);
    const key = catalogueKey(r as unknown as CatalogueReview), entry = entries.get(key), prior = previous.get(key);
    if (!entry) throw Error('Review refers to missing catalogue version');
    if (prior?.status === 'retired' || prior && (r.at as string) < prior.at) throw Error('Retired version or nonchronological review');
    if (r.status === 'usable' && (!entry.rendering || entry.rights.status !== 'cleared' || !(entry.rights.url || entry.rights.provenancePath) || !entry.rights.attribution || !entry.features.length || entry.features.some(f => f.certainty === 'unknown'))) throw Error('Usable asset needs a model, cleared rights and interpreted features');
    previous.set(key, item as CatalogueReview);
  }
  return JSON.parse(JSON.stringify(value)) as AssetCatalogue;
}
