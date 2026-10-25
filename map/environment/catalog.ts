import type { EnvironmentalRecord, EnvironmentClass, EnvironmentProvenance, EnvironmentState } from "./model";
import styles from "./styles.json";

export const ENVIRONMENT_VERSION = "reference-v1";
const root = (process.env.NEXT_PUBLIC_ENVIRONMENT_ASSET_BASE ?? "/geo/environment").replace(/\/$/, "");

const vegetation: EnvironmentProvenance = {
  dataset: "RESOLVE Ecoregions 2017 (Dinerstein et al.)",
  version: "2017; ArcGIS export 2026-10-25; simplified 0.025°",
  url: "https://ecoregions.world/",
  licence: "CC-BY-4.0; reclassified, simplified and rasterised by MANKIND",
  temporalBasis: "provisional-proxy",
  validity: null,
  uncertainty: {
    spatial: "Regional ecological units, not vegetation stands; boundaries approximate. Raster z0–4, 512px; ~4.9km at equator at z4.",
    temporal: "Modern biogeographic reference, NOT 3000 BCE. Ancient clearance, African Humid Period retreat and wetland changes unresolved.",
  },
};
const hydrography: EnvironmentProvenance = {
  dataset: "Natural Earth 1:50m rivers and natural lakes",
  version: "repository v5.1.2",
  url: "https://www.naturalearthdata.com/downloads/50m-physical-vectors/",
  licence: "Public domain; reservoirs excluded; rasterised by MANKIND",
  temporalBasis: "modern-reference",
  validity: null,
  uncertainty: {
    spatial: "Generalised 1:50 million; major rivers only. Raster width cartographically exaggerated; small channels absent.",
    temporal: "Modern reference courses and lake levels, not a historical reconstruction. Reservoir exclusion cannot restore pre-dam hydrology.",
  },
};

const layers: EnvironmentalRecord[] = (Object.keys(styles) as EnvironmentClass[])
  .filter((key) => key !== "ice")
  .map((key) => ({
    id: `environment-${key}`,
    classification: key,
    geography: { kind: "raster", tileTemplate: `${root}/${ENVIRONMENT_VERSION}/${key}/{z}/{x}/{y}.png`, tileSize: 512, minzoom: 0, maxzoom: 4 },
    provenance: key === "water" ? hydrography : vegetation,
    style: key,
  }));

/** Same honest baseline at every year. No invented historical snapshots. */
export function getEnvironmentForYear(year: number): EnvironmentState {
  if (!Number.isFinite(year)) throw new RangeError("Environment year must be finite");
  return {
    id: ENVIRONMENT_VERSION,
    requestedYear: year,
    reconstructed: false,
    notice: "Provisional biome reference · modern rivers · not reconstructed for the selected year",
    layers,
  };
}
