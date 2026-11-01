/**
 * The manual mirror of the AI boundary: for testing with a chat subscription (Claude or ChatGPT apps) instead of an API key. A
 * task becomes one self-contained prompt to paste into the chat; the pasted reply is validated by the task's own validator, exactly
 * as an API response would be. Nothing here calls a model or touches the server, so the browser can use it.
 *
 * Replies are labelled with where they came from. A chat app runs its own model and settings without the API's schema
 * constraint, so results measure the prompt and contract, not the production configuration.
 */
export interface PromptParts { task: string; promptVersion: string; system: string; user: string; schema: Record<string, unknown> }

const CLOSING = 'Reply with the JSON only: no explanation, no Markdown.';
/** One message to paste into a chat app: the task's rules, the exact output schema, then the request. */
export function manualPrompt(t: PromptParts): string {
  return `${t.system}\n\nOutput: a single JSON object that matches this JSON Schema exactly (every listed field present; null where a field does not apply).\n\n${JSON.stringify(t.schema, null, 1)}\n\n${CLOSING}\n\n(Mankind task ${t.task}, prompt ${t.promptVersion}.)\n\nRequest:\n${t.user}\n`;
}
/** Many requests of one task in one message; the reply is {"answers": [{"id": ..., "answer": <object>}]}. */
export function batchPrompt(t: Omit<PromptParts, 'user'>, items: { id: string; user: string }[]): string {
  return `${t.system}\n\nYou will answer ${items.length} separate requests. Treat each independently. Each answer is a JSON object that matches this JSON Schema exactly (every listed field present; null where a field does not apply):\n\n${JSON.stringify(t.schema, null, 1)}\n\nOutput: {"answers": [{"id": "<request id>", "answer": <object>}, ...]} with one entry per request, in the same order, using the ids given. ${CLOSING}\n\n(Mankind task ${t.task}, prompt ${t.promptVersion}, batch of ${items.length}.)\n\n${items.map(i => `=== Request ${i.id} ===\n${i.user}`).join('\n\n')}\n`;
}

/**
 * The JSON a chat reply contains. Chat apps often wrap it in a code fence or a sentence; that wrapping is removed. The content is
 * not altered: a reply that is not valid JSON fails here, and one off contract fails the task's validator.
 */
export function parseManualReply(text: string): unknown {
  const unfenced = text.replace(/```(?:json)?\s*([\s\S]*?)```/i, '$1').trim();
  const start = unfenced.search(/[[{]/);
  if (start < 0) throw Error('No JSON object in the reply');
  const open = unfenced[start], close = open === '{' ? '}' : ']';
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < unfenced.length; i++) {
    const c = unfenced[i];
    if (inString) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') inString = false; continue; }
    if (c === '"') inString = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return JSON.parse(unfenced.slice(start, i + 1));
  }
  throw Error('The reply\'s JSON is incomplete (it may have been cut off)');
}
export function parseBatchReply(text: string): Map<string, unknown> {
  const reply = parseManualReply(text) as { answers?: { id?: unknown; answer?: unknown }[] };
  if (!reply || !Array.isArray(reply.answers)) throw Error('Expected {"answers": [...]}');
  const answers = new Map<string, unknown>();
  for (const a of reply.answers) if (typeof a?.id === 'string' && !answers.has(a.id)) answers.set(a.id, a.answer);
  return answers;
}
