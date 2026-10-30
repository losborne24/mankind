import type { LocalPoint } from "@/map/settlements/romanSettlement";

export type ReconstructionCertainty = "documented" | "evidence-based" | "best-guess";
export type ReconstructionKind = "temple" | "bridge" | "quay" | "street" | "lane" | "stage" | "barge" | "square" | "altar" | "pen" | "stall" | "shop" | "insula" | "flats" | "warehouse" | "circus" | "palace" | "drain";
export interface ReconstructionObject {
  id: string;
  kind: ReconstructionKind;
  title: string;
  certainty: ReconstructionCertainty;
  /** One sentence on what the object is based on, and what is guessed. */
  note: string;
  sources: string[];
  /** Outline in settlement metres (east, south); also the inspection shape on the map. */
  footprint: LocalPoint[];
  /** Render parameters; their fields depend on `shape.type` and are read only by UrbanScene and the overlay. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shape: Record<string, any>;
  time?: { start: { year: number }; end?: { year: number } };
  uncertaintyYears?: number;
  /** Why the object is shown at this date when its evidence comes from another one (undated find, later survey). */
  snap?: string;
}
/** Everything placed around the temples for one layout. Pure data: renderers and checks both read it. */
export interface ReconstructionSpec {
  seed: number;
  /** Longitude/latitude of the (0, 0) of the local frame. */
  origin: [number, number];
  sources: { id: string; title: string; url: string; licence?: string }[];
  streets: { id: string; width: number; points: LocalPoint[] }[];
  /** River the modern embankments took, as rings: water on the map and in the scene, with the ground cut down to the river bed. */
  waterExtra?: LocalPoint[][];
  objects: ReconstructionObject[];
  /** Open courtyards inside the blocks: ground treatment only, not mapped objects. */
  courts?: { offset: LocalPoint; width: number; depth: number; heading: number }[];
}
