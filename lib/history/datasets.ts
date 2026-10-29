export const HISTORICAL_DATASETS = [{ id: 'london2012', title: 'London 2012 ceremony context', url: '/api/historical-world/london2012' }] as const;
/** Only explicitly registered local datasets are fetched. Citations are never fetched. */
export async function loadHistoricalDataset(id: string, signal: AbortSignal): Promise<unknown> {
  const dataset = HISTORICAL_DATASETS.find(dataset => dataset.id === id);
  if (!dataset) throw Error(`Unknown historical dataset ${id}`);
  const response = await fetch(dataset.url, { signal });
  if (!response.ok) throw Error(`Historical dataset request failed (${response.status})`);
  if (!response.body) throw Error('Historical dataset response has no body');
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) throw Error('Historical dataset exceeds 2 MiB');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  signal.throwIfAborted();
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
