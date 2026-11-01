import Anthropic from '@anthropic-ai/sdk';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { canonicalJson, sha256 } from '@/lib/plan/digest';
import { manualPrompt, parseManualReply } from '@/lib/ai/manual';

/**
 * The one place Mankind calls an AI model (Phase 5B). Server-side only: the key is read by the SDK from the server environment and
 * never reaches the browser. Every call is schema-constrained, validated by the caller's own validator (invalid output is
 * rejected, never repaired), priced against per-request and per-day caps that fail closed, and logged. Modes:
 *
 * - `off`: no call is made (the default when no credential is configured).
 * - `live`: a real request.
 * - `record`: a real request whose response is saved as a fixture under lib/ai/recordings/.
 * - `replay`: only saved fixtures; a request without one fails. The gate runs in replay, never live.
 * - `manual`: no API. The prompt is written to data/ai/manual/<task>/<digest>.prompt.md for pasting into a chat app; the reply,
 *   pasted into the matching .reply.txt, is validated like any response and saved as a recording labelled with its source
 *   (MANKIND_AI_MANUAL_SOURCE, e.g. "claude.ai"). For testing with a chat subscription; see lib/ai/manual.ts.
 */
export const AI_MODEL = 'claude-opus-5-5';
export type AiMode = 'off' | 'live' | 'record' | 'replay' | 'manual';
export type Effort = 'low' | 'medium' | 'high';

/** USD per million tokens (input, output, cache read). Fallback models are priced at their own rates. */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
};

export interface AiTask<T> {
  task: string;
  promptVersion: string;
  /** Stable across calls of the task, so it is cached. */
  system: string;
  user: string;
  schema: Record<string, unknown>;
  effort: Effort;
  maxTokens: number;
  /** Throws on anything the contract does not accept. */
  validate(output: unknown): T;
}
export interface TransportResponse { text: string; stopReason: string | null; model: string; usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null } }
export type Transport = (request: { model: string; system: string; user: string; schema: Record<string, unknown>; effort: Effort; maxTokens: number }) => Promise<TransportResponse>;
export interface CallRecord { at: string; task: string; promptVersion: string; mode: AiMode; model: string; servedBy?: string; requestDigest: string; inputTokens?: number; outputTokens?: number; costUsd: number; outcome: string; detail?: string }
export type AiResult<T> = { ok: true; value: T; record: CallRecord } | { ok: false; error: AiErrorKind; message: string; record: CallRecord };
export type AiErrorKind = 'disabled' | 'over-budget' | 'replay-missing' | 'awaiting-reply' | 'refused' | 'truncated' | 'invalid-json' | 'invalid-output' | 'api-error';

export interface Ledger { spentToday(day: string): number; add(day: string, usd: number): void }
export interface CallLog { write(record: CallRecord, io?: { user: string; output?: unknown }): void }
export interface BoundaryOptions { mode?: AiMode; transport?: Transport; ledger?: Ledger; log?: CallLog; recordings?: string; manual?: string; manualSource?: string; now?: () => Date; requestCapUsd?: number; dailyCapUsd?: number }

const AI_DIR = 'data/ai';
export function aiMode(): AiMode {
  const set = process.env.MANKIND_AI_MODE as AiMode | undefined;
  if (set && ['off', 'live', 'record', 'replay', 'manual'].includes(set)) return set;
  return process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? 'live' : 'off';
}
const capFromEnv = (name: string, fallback: number) => { const v = Number(process.env[name]); return Number.isFinite(v) && v > 0 ? v : fallback; };

/** A JSON-lines file of {day, usd}; today's total gates the next call. */
export function fileLedger(path = join(AI_DIR, 'ledger.jsonl')): Ledger {
  return {
    spentToday: day => !existsSync(path) ? 0 : readFileSync(path, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as { day: string; usd: number }).filter(e => e.day === day).reduce((s, e) => s + e.usd, 0),
    add: (day, usd) => { mkdirSync(dirname(path), { recursive: true }); appendFileSync(path, JSON.stringify({ day, usd }) + '\n'); },
  };
}
export function fileLog(path = join(AI_DIR, 'calls.jsonl')): CallLog {
  return { write: (record, io) => { mkdirSync(dirname(path), { recursive: true }); appendFileSync(path, JSON.stringify({ ...record, ...(io ? { user: io.user, output: io.output } : {}) }) + '\n'); } };
}

/** The live transport: the official SDK, structured JSON output, refusal fallbacks routed by Anthropic ("default"). */
export function claudeTransport(client = new Anthropic()): Transport {
  return async ({ model, system, user, schema, effort, maxTokens }) => {
    const response = await client.beta.messages.create({
      model, max_tokens: maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      output_config: { effort, format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content: user }],
    });
    const text = response.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('');
    return { text, stopReason: response.stop_reason, model: response.model, usage: response.usage };
  };
}

export const requestDigest = (task: AiTask<unknown>, model = AI_MODEL) =>
  sha256(canonicalJson({ model, task: task.task, promptVersion: task.promptVersion, system: task.system, user: task.user, schema: task.schema, effort: task.effort, maxTokens: task.maxTokens }));
const price = (model: string) => PRICES[model] ?? PRICES[AI_MODEL];
/** The most a call can cost before it is made: the whole prompt uncached (about 3.5 characters a token) and every output token. */
export const worstCaseUsd = (task: AiTask<unknown>) => (Math.ceil((task.system.length + task.user.length) / 3.5) * price(AI_MODEL).input + task.maxTokens * price(AI_MODEL).output) / 1e6;
export function costUsd(model: string, u: TransportResponse['usage']) {
  const p = price(model), creation = u.cache_creation_input_tokens ?? 0, read = u.cache_read_input_tokens ?? 0;
  return (u.input_tokens * p.input + creation * p.input * 1.25 + read * p.cacheRead + u.output_tokens * p.output) / 1e6;
}

export async function runAi<T>(task: AiTask<T>, options: BoundaryOptions = {}): Promise<AiResult<T>> {
  const mode = options.mode ?? aiMode(), now = options.now?.() ?? new Date(), day = now.toISOString().slice(0, 10);
  const ledger = options.ledger ?? fileLedger(), log = options.log ?? fileLog(), digest = requestDigest(task);
  const recordings = options.recordings ?? 'lib/ai/recordings', recordingPath = join(recordings, task.task, `${digest}.json`);
  const base: CallRecord = { at: now.toISOString(), task: task.task, promptVersion: task.promptVersion, mode, model: AI_MODEL, requestDigest: digest, costUsd: 0, outcome: 'pending' };
  const fail = (error: AiErrorKind, message: string, extra: Partial<CallRecord> = {}): AiResult<T> => {
    const record = { ...base, ...extra, outcome: error, detail: message };
    log.write(record, { user: task.user });
    return { ok: false, error, message, record };
  };
  if (mode === 'off') return fail('disabled', 'AI is off: no credential is configured (set ANTHROPIC_API_KEY on the server) or MANKIND_AI_MODE=off.');

  let response: TransportResponse;
  if (mode === 'manual') {
    const folder = join(options.manual ?? join(AI_DIR, 'manual'), task.task), prompt = join(folder, `${digest}.prompt.md`), reply = join(folder, `${digest}.reply.txt`);
    if (!existsSync(reply) || !readFileSync(reply, 'utf8').trim()) {
      mkdirSync(folder, { recursive: true });
      writeFileSync(prompt, manualPrompt(task));
      if (!existsSync(reply)) writeFileSync(reply, '');
      return fail('awaiting-reply', `Paste ${prompt} into a chat app, put its reply in ${reply}, then run again.`);
    }
    let text: string;
    try { text = JSON.stringify(parseManualReply(readFileSync(reply, 'utf8'))); } catch (e) { return fail('invalid-json', (e as Error).message); }
    const source = options.manualSource ?? process.env.MANKIND_AI_MANUAL_SOURCE ?? 'chat-app';
    response = { text, stopReason: 'end_turn', model: `manual:${source}`, usage: { input_tokens: 0, output_tokens: 0 } };
    mkdirSync(dirname(recordingPath), { recursive: true });
    writeFileSync(recordingPath, JSON.stringify({ task: task.task, promptVersion: task.promptVersion, digest, recordedAt: now.toISOString(), source: `manual:${source}`, response }, null, 2) + '\n');
  } else if (mode === 'replay') {
    if (!existsSync(recordingPath)) return fail('replay-missing', `No recorded response for ${task.task} ${digest.slice(0, 12)}.`);
    response = (JSON.parse(readFileSync(recordingPath, 'utf8')) as { response: TransportResponse }).response;
  } else {
    const worst = worstCaseUsd(task), requestCap = options.requestCapUsd ?? capFromEnv('MANKIND_AI_REQUEST_USD', 0.5), dailyCap = options.dailyCapUsd ?? capFromEnv('MANKIND_AI_DAILY_USD', 5);
    if (worst > requestCap) return fail('over-budget', `The call could cost up to $${worst.toFixed(3)}, over the $${requestCap} per-request cap.`);
    const spent = ledger.spentToday(day);
    if (spent + worst > dailyCap) return fail('over-budget', `Today's spend $${spent.toFixed(3)} plus up to $${worst.toFixed(3)} would pass the $${dailyCap} daily cap.`);
    try { response = await (options.transport ?? claudeTransport())({ model: AI_MODEL, system: task.system, user: task.user, schema: task.schema, effort: task.effort, maxTokens: task.maxTokens }); }
    catch (e) {
      const status = e instanceof Anthropic.APIError ? ` (${e.status})` : '';
      return fail('api-error', `${e instanceof Error ? e.message : String(e)}${status}`);
    }
    const usd = costUsd(response.model, response.usage);
    ledger.add(day, usd);
    if (mode === 'record') { mkdirSync(dirname(recordingPath), { recursive: true }); writeFileSync(recordingPath, JSON.stringify({ task: task.task, promptVersion: task.promptVersion, digest, recordedAt: now.toISOString(), response }, null, 2) + '\n'); }
    base.costUsd = usd;
  }
  const spent: Partial<CallRecord> = { servedBy: response.model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
  if (response.stopReason === 'refusal') return fail('refused', 'The model declined the request.', spent);
  if (response.stopReason === 'max_tokens') return fail('truncated', 'The output was cut off at the token limit.', spent);
  let json: unknown;
  try { json = JSON.parse(response.text); } catch { return fail('invalid-json', 'The output was not JSON.', spent); }
  let value: T;
  try { value = task.validate(json); } catch (e) { return fail('invalid-output', (e as Error).message, spent); }
  const record = { ...base, ...spent, outcome: 'ok' };
  log.write(record, { user: task.user, output: json });
  return { ok: true, value, record };
}
