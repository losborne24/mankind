import { generateSettlement, layoutStillSuitable, type GenerationResult, type GenerationSampler, type ProceduralSettlementConfig } from "@/map/settlements/proceduralSettlement";

/** Layout transaction lifecycle only; assets, retained heights and rendering belong to SettlementScene. */
export class ProceduralSettlementSession {
  result?: GenerationResult;
  private revision = 0;
  private active = false;
  private dirty = true;
  constructor(readonly config: ProceduralSettlementConfig) {}
  start() { this.active = true; this.dirty = true; }
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
    const result = generateSettlement(this.config,sample);
    // Also guards cancellation/replacement during an injected sampler callback.
    if (!this.active || revision !== this.revision) return undefined;
    this.result = result;
    return result;
  }
}
