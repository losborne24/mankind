import styles from "./styles.json";
import type { GeoJSONSourceSpecification } from "maplibre-gl";

export type EnvironmentClass = keyof typeof styles;

export interface EnvironmentProvenance {
  dataset: string;
  version: string;
  url: string;
  licence: string;
  temporalBasis: "reconstruction" | "modern-reference" | "provisional-proxy";
  /** Astronomical years. Null means UNKNOWN, never an infinite validity claim. */
  validity: { start: number; end: number } | null;
  uncertainty: { spatial: string; temporal: string };
}

/** Feature and raster adapters share metadata, independent of terrain/style. */
export interface EnvironmentalRecord {
  id: string;
  classification: EnvironmentClass;
  geography:
    | { kind: "feature"; geometry: Extract<GeoJSONSourceSpecification["data"], { type: "Feature" }>["geometry"] }
    | { kind: "raster"; tileTemplate: string; tileSize: 256 | 512; minzoom: number; maxzoom: number };
  provenance: EnvironmentProvenance;
  style: EnvironmentClass;
  /** Optional dataset-independent material inputs supplied by the surface adapter. */
  surface?: {
    propertyTileTemplate: string;
    /** Visible native drape while optional PBR inputs load or are unavailable. */
    fallbackTileTemplate?: string;
    manifestUrl: string;
    normalStrength: number;
    canopy: number;
  };
}

export interface EnvironmentState {
  id: string;
  requestedYear: number;
  reconstructed: boolean;
  notice: string;
  layers: readonly EnvironmentalRecord[];
}
