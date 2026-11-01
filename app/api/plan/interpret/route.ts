import { aiMode, runAi } from '@/lib/ai/boundary';
import { interpretTask } from '@/lib/ai/interpret';
import { defaultPlanningContext } from '@/lib/plan/context';

/** Whether free-text interpretation is available on this server (a credential is configured and the mode is not off). */
export function GET() {
  return Response.json({ mode: aiMode() });
}

/**
 * Free text to a structured request (Phase 5B). Server-only: the browser never holds the key or calls the model. The answer is a
 * validated ScenarioRequest, a clarifying question or a refusal; the client then plans it with the deterministic planner.
 */
export async function POST(request: Request) {
  let text: unknown;
  try { text = ((await request.json()) as { text?: unknown }).text; } catch { return Response.json({ ok: false, error: 'bad-request', message: 'Expected JSON {"text": "..."}.' }, { status: 400 }); }
  if (typeof text !== 'string' || !text.trim() || text.length > 500) return Response.json({ ok: false, error: 'bad-request', message: 'Text must be 1 to 500 characters.' }, { status: 400 });
  const result = await runAi(interpretTask(text, defaultPlanningContext().store));
  if (!result.ok) return Response.json({ ok: false, error: result.error, message: result.message }, { status: result.error === 'disabled' ? 503 : result.error === 'over-budget' ? 429 : 502 });
  return Response.json({ ok: true, interpretation: result.value, costUsd: result.record.costUsd });
}
