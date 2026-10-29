/** CPU/wall timings, never GPU timings. Aggregate only; no unbounded frame history. */
export class SettlementTiming {
  stage = "idle";
  readonly totals: Record<string, number> = {};
  readonly counts: Record<string, number> = {};
  private started = performance.now();
  reset() { this.started = performance.now(); this.stage = "loading"; for (const key of Object.keys(this.totals)) delete this.totals[key]; for (const key of Object.keys(this.counts)) delete this.counts[key]; }
  add(name: string, started: number) { this.totals[name] = (this.totals[name] ?? 0) + performance.now() - started; this.counts[name] = (this.counts[name] ?? 0) + 1; }
  ready() { if (this.stage === "ready") return; this.totals.readyWall = performance.now() - this.started; this.stage = "ready"; }
  snapshot() { return {stage: this.stage, ms: {...this.totals}, counts: {...this.counts}}; }
}
