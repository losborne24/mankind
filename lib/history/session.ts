import type { HistoricalTime } from '@/lib/scenarios/schema';
import type { HistoricalWorldData } from '@/lib/history/schema';
import { validateHistoricalWorld } from '@/lib/history/validate';
import { selectHistoricalWorld, type HistoricalSelection } from '@/lib/history/selection';
import { loadHistoricalDataset } from '@/lib/history/datasets';
import { inspectHistoricalRecord, type HistoricalInspectionKey, type HistoricalInspection } from '@/lib/history/inspection';
export interface HistoricalDatasetSnapshot {
  status: 'idle' | 'loading' | 'ready' | 'error';
  datasetId?: string;
  title?: string;
  selection?: HistoricalSelection;
  error?: string;
  inspection?: HistoricalInspection;
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
  private inspectionKey?: HistoricalInspectionKey;
  private previewLayoutId?: string;
  private readonly unsubscribeTime: () => void;
  constructor(private readonly ports: HistoricalDatasetPorts) { this.unsubscribeTime = ports.subscribeTime(() => { this.previewLayoutId = undefined; this.refresh(); }); }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(snapshot: HistoricalDatasetSnapshot) { this.snapshot = snapshot; for (const listener of this.listeners) listener(); }
  async load(datasetId: string) {
    if (this.disposed) return;
    this.request?.abort(); const revision = ++this.revision, request = new AbortController();
    this.request = request; this.world = undefined; this.inspectionKey = undefined; this.previewLayoutId = undefined;
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
      const selection = selectHistoricalWorld(this.world, this.ports.time(), { explicitLayoutId: this.previewLayoutId });
      this.ports.apply(selection);
      const inspection = this.inspectionKey ? inspectHistoricalRecord(this.world, selection, this.inspectionKey) : undefined;
      this.publish({ status: 'ready', datasetId: this.snapshot.datasetId, title: this.world.title, selection, ...(inspection ? { inspection } : {}) });
    } catch (error) {
      this.ports.apply(null);
      this.publish({ status: 'error', datasetId: this.snapshot.datasetId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  inspect(key: HistoricalInspectionKey): boolean {
    if (this.disposed || !this.world || this.snapshot.status !== 'ready' || !this.snapshot.selection) return false;
    const inspection = inspectHistoricalRecord(this.world, this.snapshot.selection, key);
    if (!inspection) return false;
    this.inspectionKey = { ...key }; this.publish({ ...this.snapshot, inspection }); return true;
  }
  closeInspection() {
    if (this.disposed || !this.snapshot.inspection) return;
    this.inspectionKey = undefined;
    this.publish({ ...this.snapshot, inspection: undefined });
  }
  /** Explicit user choice of an evidenced interpretation; date changes revoke it. */
  previewReconstruction(layoutId: string | null): boolean {
    if (this.disposed || this.snapshot.status !== 'ready') return false;
    if (layoutId !== null && !this.snapshot.inspection?.locations.some(location => location.reconstructionPreviews?.some(layout => layout.id === layoutId))) return false;
    this.previewLayoutId = layoutId ?? undefined; this.refresh();
    return layoutId === null || this.snapshot.selection?.interpretationLayoutId === layoutId;
  }
  /** Recheck the latest date/record at activation, rather than navigating from stale UI props. */
  getVisitTarget(placeId: string) {
    if (this.disposed || this.snapshot.status !== 'ready') return;
    const target = this.snapshot.inspection?.locations.find(location => location.placeId === placeId)?.target;
    return target ? structuredClone(target) : undefined;
  }
  clear() {
    if (this.disposed || this.snapshot.status === 'idle') return;
    this.request?.abort(); this.request = undefined; this.revision++; this.world = undefined; this.inspectionKey = undefined; this.previewLayoutId = undefined;
    this.ports.release(); this.publish({ status: 'idle' });
  }
  dispose() { if (this.disposed) return; this.clear(); this.disposed = true; this.unsubscribeTime(); this.listeners.clear(); }
}
