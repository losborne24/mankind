import type { HistoricalDate } from '@/lib/scenarios/schema';

/** Historical records describe the world; camera direction belongs to ScenarioDefinition. */
export interface Evidence {
  certainty: 'documented' | 'inferred' | 'illustrative' | 'unknown';
  sources: string[];
  note: string;
}
/** Inclusive precision-aware interval. No end means the period represented by start, not forever. */
export interface HistoricalPeriod {
  start: HistoricalDate;
  end?: HistoricalDate;
  uncertaintyYears?: number;
  /** Qualitative circa date; no invented numeric error margin. */
  approximate?: boolean;
}
export interface HistoricalSource {
  id: string;
  title: string;
  url: string;
  publisher: string;
  accessed: string;
  citation?: string;
}
export interface HistoricalPlace {
  id: string;
  title: string;
  kind: 'settlement' | 'landmark' | 'region';
  parentId?: string;
  period?: HistoricalPeriod;
  position: { coordinate: [number, number]; uncertaintyMeters?: number; evidence: Evidence };
  radiusMeters: number;
  evidence: Evidence;
}
/** Source reference geometry, never a dated layout or a reconstruction footprint. */
export interface HistoricalReferenceArea {
  id: string;
  title: string;
  placeId: string;
  kind: 'site-outline';
  geometry: { type: 'Polygon'; coordinates: [number, number][][] };
  licence: { title: string; url: string; attribution: string };
  evidence: Evidence;
}
/** Logical reference only. No URL is fetched and no architectural era is inferred. */
export interface HistoricalAsset {
  id: string;
  category: 'building' | 'infrastructure' | 'prop' | 'vegetation' | 'rock' | 'character';
  registryId?: string;
  licence?: { title: string; url: string };
  evidence: Evidence;
}
export interface HistoricalBuilding {
  id: string;
  assetId: string;
  offset: [number, number];
  headingRadians?: number;
  evidence: Evidence;
}
export interface HistoricalRoadNetwork {
  id: string;
  placeId: string;
  period: HistoricalPeriod;
  frame: 'local-east-south-metres';
  roads: { id: string; widthMeters: number; points: [number, number][]; accessTo?: string; evidence: Evidence }[];
  evidence: Evidence;
}
export interface HistoricalLayout {
  id: string;
  title: string;
  placeId: string;
  period: HistoricalPeriod;
  frame: 'local-east-south-metres';
  extentMeters: number;
  maxFoundationRiseMeters: number;
  roadNetworkId?: string;
  buildings: HistoricalBuilding[];
  evidence: Evidence;
}
export interface HistoricalEvent {
  id: string;
  title: string;
  description: string;
  period: HistoricalPeriod;
  locations: { placeId: string; role: string }[];
  evidence: Evidence;
}
export interface HistoricalRoute {
  id: string;
  title: string;
  period: HistoricalPeriod;
  coordinates: [number, number][];
  placeIds: string[];
  evidence: Evidence;
}
export interface HistoricalSceneRequirement {
  id: string;
  title: string;
  description: string;
  placeId: string;
  period: HistoricalPeriod;
  layoutIds: string[];
  assetIds: string[];
  required: boolean;
  fallback: 'map-only' | 'unavailable';
  evidence: Evidence;
}
export interface HistoricalWorldData {
  version: 1;
  id: string;
  title: string;
  coordinateSystem: 'WGS84';
  calendar: 'proleptic-gregorian';
  sources: HistoricalSource[];
  places: HistoricalPlace[];
  referenceAreas?: HistoricalReferenceArea[];
  assets: HistoricalAsset[];
  roadNetworks: HistoricalRoadNetwork[];
  layouts: HistoricalLayout[];
  events: HistoricalEvent[];
  routes: HistoricalRoute[];
  scenes: HistoricalSceneRequirement[];
}
