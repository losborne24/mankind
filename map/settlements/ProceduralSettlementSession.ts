import { SettlementTiming } from "@/map/settlements/settlementTiming";
import { generateSettlement, layoutStillSuitable, type GenerationResult, type GenerationSampler, type ProceduralSettlementConfig } from "@/map/settlements/proceduralSettlement";

/** Layout transaction lifecycle only; assets, retained heights and rendering belong to SettlementScene. */
export class ProceduralSettlementSession {
  readonly timing = new SettlementTiming();
  result?: GenerationResult;
  private revision = 0;
  private active = false;
  private dirty = true;
  constructor(readonly config: ProceduralSettlementConfig) {}
  start() { this.timing.reset(); this.active = true; this.dirty = true; }
  cancel() { this.active = false; this.revision++; this.result = undefined; }
  invalidate(reset = false) {
    this.dirty = true;
    if (reset) { this.revision++; this.result = undefined; }
  }
  update(sample: GenerationSampler): GenerationResult | undefined {
    if (!this.active || !this.dirty) return this.result;
    this.dirty = false;
    if (this.result?.definition && layoutStillSuitable(this.result,this.config,sample)) return this.result;
    const revision = this.revision;
    const started = performance.now();
    const result = generateSettlement(this.config,coordinate=>{const started=performance.now();const value=sample(coordinate);this.timing.add("demQueries",started);return value;});
    this.timing.add("layoutGeneration", started);
    if (result.definition) {this.timing.ready();this.timing.totals.terrainWaitWall=Math.max(0,this.timing.totals.readyWall-this.timing.totals.layoutGeneration);}
    else this.timing.stage = result.state;
    // Also guards cancellation/replacement during an injected sampler callback.
    if (!this.active || revision !== this.revision) return undefined;
    this.result = result;
    return result;
  }
}
