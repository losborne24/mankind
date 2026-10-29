import type { HistoricalTime } from '@/lib/scenarios/schema';
import type { HistoricalWorldData } from '@/lib/history/schema';
import { validateHistoricalWorld } from '@/lib/history/validate';
import { selectHistoricalWorld, type HistoricalSelection } from '@/lib/history/selection';
import { loadHistoricalDataset } from '@/lib/history/datasets';
export interface HistoricalDatasetSnapshot {
  status: 'idle' | 'loading' | 'ready' | 'error';
  datasetId?: string;
  title?: string;
  selection?: HistoricalSelection;
  error?: string;
}
export interface HistoricalDatasetPorts {
  time(): HistoricalTime;
  subscribeTime(listener: () => void): () => void;
  apply(selection: HistoricalSelection | null): void;
  release(): void;
  load?(id: string, signal: AbortSignal): Promise<unknown>;
}
/** One dataset owner, one request, no date clock or animation loop. */
export class HistoricalDatasetSession {
  private snapshot: HistoricalDatasetSnapshot = { status: 'idle' };
  private listeners = new Set<() => void>();
  private world?: HistoricalWorldData;
  private request?: AbortController;
  private revision = 0;
  private disposed = false;
  private readonly unsubscribeTime: () => void;
  constructor(private readonly ports: HistoricalDatasetPorts) { this.unsubscribeTime = ports.subscribeTime(() => this.refresh()); }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(snapshot: HistoricalDatasetSnapshot) { this.snapshot = snapshot; for (const listener of this.listeners) listener(); }
  async load(datasetId: string) {
    if (this.disposed) return;
    this.request?.abort(); const revision = ++this.revision, request = new AbortController();
    this.request = request; this.world = undefined;
    this.ports.apply(null);
    this.publish({ status: 'loading', datasetId });
    try {
      const value = await (this.ports.load ?? loadHistoricalDataset)(datasetId, request.signal);
      if (this.disposed || request.signal.aborted || revision !== this.revision) return;
      this.world = validateHistoricalWorld(value);
      this.refresh();
    } catch (error) {
      if (this.disposed || request.signal.aborted || revision !== this.revision) return;
      this.world = undefined; this.ports.apply(null);
      this.publish({ status: 'error', datasetId, error: error instanceof Error ? error.message : String(error) });
    } finally { if (revision === this.revision) this.request = undefined; }
  }
  private refresh() {
    if (this.disposed || !this.world) return;
    try {
      const selection = selectHistoricalWorld(this.world, this.ports.time());
      this.ports.apply(selection);
      this.publish({ status: 'ready', datasetId: this.snapshot.datasetId, title: this.world.title, selection });
    } catch (error) {
      this.ports.apply(null);
      this.publish({ status: 'error', datasetId: this.snapshot.datasetId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  clear() {
    if (this.disposed || this.snapshot.status === 'idle') return;
    this.request?.abort(); this.request = undefined; this.revision++; this.world = undefined;
    this.ports.release(); this.publish({ status: 'idle' });
  }
  dispose() { if (this.disposed) return; this.clear(); this.disposed = true; this.unsubscribeTime(); this.listeners.clear(); }
}
