import type { Coordinate, SettlementDefinition } from "@/map/settlements/romanSettlement";
import type { ProceduralSettlementConfig, SettlementProfile } from "@/map/settlements/proceduralSettlement";

export type SettlementLOD = "global" | "regional" | "local";
/** Discovery data only. No generation, asset request or scene construction. */
interface SettlementDescriptorBase {
  id: string;
  origin: Coordinate;
  radiusMeters: number;
  visual?: { roofColour?: number; label?: string };
  /** Reserved for later historical filtering; fixtures make no historical claim. */
  validYears?: { from: number; to: number };
}
export type SettlementDescriptor = SettlementDescriptorBase & (
  | { definition: SettlementDefinition; profile?: SettlementProfile; seed?: number; config?: never }
  | { definition?: undefined; profile: SettlementProfile; seed: number; config?: Partial<ProceduralSettlementConfig> }
);
export const DEVELOPMENT_SETTLEMENTS: readonly SettlementDescriptor[] = [
  {id:"fictional-hamlet",origin:[12.55,41.85],radiusMeters:90,profile:"hamlet",seed:7},
  {id:"fictional-village",origin:[12.57,41.85],radiusMeters:130,profile:"village",seed:42},
  {id:"fictional-town",origin:[12.59,41.85],radiusMeters:190,profile:"small-town",seed:2026},
];
export const LOD_DISTANCES = {localEnter:550,localExit:850,regionalEnter:8000,regionalExit:12000} as const;
export interface SettlementObservation { descriptor: SettlementDescriptor; distance: number; visible: boolean }
export interface StreamingDecision { lod: SettlementLOD; descriptor?: SettlementDescriptor; distance: number }
/** Metres from the camera to the settlement's approximate extent, including altitude.
 * Camera location/altitude come from MapLibre's projection-aware transform (pitch included).
 * Wrapped haversine remains stable at high latitude and across the date line.
 */
export function settlementDistance(eye: Coordinate, altitudeAboveSite: number, descriptor: SettlementDescriptor): number {
  const rad=Math.PI/180,a=eye[1]*rad,b=descriptor.origin[1]*rad;
  const h=Math.sin((b-a)/2)**2+Math.cos(a)*Math.cos(b)*Math.sin((descriptor.origin[0]-eye[0])*rad/2)**2;
  const surface=6371008.8*2*Math.asin(Math.sqrt(Math.min(1,h)));
  return Math.max(0,Math.hypot(surface,Math.max(0,altitudeAboveSite))-descriptor.radiusMeters);
}
export function settlementLOD(distance: number, previous: SettlementLOD): SettlementLOD {
  if (distance <= (previous==="local" ? LOD_DISTANCES.localExit : LOD_DISTANCES.localEnter)) return "local";
  if (distance <= (previous!=="global" ? LOD_DISTANCES.regionalExit : LOD_DISTANCES.regionalEnter)) return "regional";
  return "global";
}
/** Selection is pure/testable. Integration owns the single scene slot and async revision guards. */
export class SettlementLODController {
  current: StreamingDecision = {lod:"global",distance:Infinity};
  override: SettlementLOD | "auto" = "auto";
  update(observations: readonly SettlementObservation[]): StreamingDecision {
    // Visibility gates entry only: the incumbent stays while within its exit distance, so glancing away from the site
    // does not tear down a loaded scene that panning back would have to stream again.
    const current=this.current;
    const relevant=observations.filter(o=>o.visible || (current.lod!=="global" && o.descriptor.id===current.descriptor?.id && o.distance<=LOD_DISTANCES.regionalExit)).sort((a,b)=>a.distance-b.distance);
    let nearest=relevant[0];
    const incumbent=relevant.find(o=>o.descriptor.id===this.current.descriptor?.id);
    // Require a material improvement to steal a local slot in overlapping coverage.
    if (incumbent && nearest && this.current.lod==="local" && incumbent.distance<=LOD_DISTANCES.localExit && nearest.distance>incumbent.distance*.8) nearest=incumbent;
    if (!nearest) return this.current={lod:"global",distance:Infinity};
    const previous=nearest.descriptor.id===this.current.descriptor?.id ? this.current.lod : "global";
    const lod=this.override==="auto" ? settlementLOD(nearest.distance,previous) : this.override;
    return this.current={lod,descriptor:nearest.descriptor,distance:nearest.distance};
  }
}
