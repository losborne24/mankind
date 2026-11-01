import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Claim, ExtractionResult } from '@/lib/ai/claims';
import type { SpatialBlueprint } from '@/lib/plan/contracts';
import { digestOf } from '@/lib/plan/digest';

/**
 * Drafts and their reviews. AI output is stored as a draft with the digest of its content; a person accepts or rejects it in an
 * append-only review log, as the asset catalogue does. Only accepted drafts whose content still matches the reviewed digest are
 * returned for use; anything edited after review is a draft again.
 */
export const PLAN_DATA = 'data/plan';
export interface Review { kind: 'claims' | 'blueprint'; id: string; digest: string; status: 'accepted' | 'rejected'; reviewer: string; at: string; note: string }

const draftPath = (root: string, kind: Review['kind'], id: string) => join(root, 'drafts', kind, `${id.replace(/[^a-z0-9._-]+/gi, '_')}.json`);
export function saveDraft(kind: 'claims', id: string, value: ExtractionResult, root?: string): string;
export function saveDraft(kind: 'blueprint', id: string, value: SpatialBlueprint, root?: string): string;
export function saveDraft(kind: Review['kind'], id: string, value: unknown, root = PLAN_DATA) {
  const path = draftPath(root, kind, id);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
  return path;
}
export function readDraft<T>(kind: Review['kind'], id: string, root = PLAN_DATA): T | undefined {
  const path = draftPath(root, kind, id);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as T : undefined;
}
export function listDrafts(kind: Review['kind'], root = PLAN_DATA): string[] {
  const dir = join(root, 'drafts', kind);
  return existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort() : [];
}
export function reviews(root = PLAN_DATA): Review[] {
  const path = join(root, 'reviews.jsonl');
  return existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as Review) : [];
}
/** Records a decision on the draft as it stands now. A reviewer name is required; there is no automatic acceptance. */
export function review(kind: Review['kind'], id: string, status: Review['status'], reviewer: string, note: string, root = PLAN_DATA, now = new Date()): Review {
  if (!reviewer.trim()) throw Error('A review needs the reviewer\'s name');
  const draft = readDraft(kind, id, root);
  if (draft === undefined) throw Error(`No ${kind} draft ${id}`);
  const entry: Review = { kind, id, digest: digestOf(draft), status, reviewer: reviewer.trim(), at: now.toISOString(), note };
  mkdirSync(root, { recursive: true });
  appendFileSync(join(root, 'reviews.jsonl'), JSON.stringify(entry) + '\n');
  return entry;
}
/** The latest decision for the draft's current content, if any. */
export function status(kind: Review['kind'], id: string, root = PLAN_DATA): Review['status'] | 'draft' {
  const draft = readDraft(kind, id, root);
  if (draft === undefined) return 'draft';
  const digest = digestOf(draft);
  return reviews(root).filter(r => r.kind === kind && r.id === id && r.digest === digest).at(-1)?.status ?? 'draft';
}
export function acceptedClaims(root = PLAN_DATA): Claim[] {
  return listDrafts('claims', root).filter(id => status('claims', id, root) === 'accepted').flatMap(id => readDraft<ExtractionResult>('claims', id, root)!.accepted);
}
export function acceptedBlueprints(root = PLAN_DATA): SpatialBlueprint[] {
  return listDrafts('blueprint', root).filter(id => status('blueprint', id, root) === 'accepted').map(id => readDraft<SpatialBlueprint>('blueprint', id, root)!);
}
