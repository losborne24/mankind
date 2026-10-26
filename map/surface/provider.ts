import { RESOLVE_ENVIRONMENTS } from './resolve';
import { materialWeights, sampleGround } from './materials';
import type { EnvironmentState } from '../environment/model';

export type SurfaceMode = 'natural' | 'resolve';
/** Rendering adapter only: terrain geometry and hydrology never belong to a surface provider. */
export interface NaturalSurfaceProvider {
  readonly mode: SurfaceMode;
  adapt(reference: EnvironmentState): EnvironmentState;
}
export const resolveSurfaceProvider: NaturalSurfaceProvider = {
  mode: 'resolve',
  adapt: (reference) => reference,
};
const root = (process.env.NEXT_PUBLIC_ENVIRONMENT_ASSET_BASE ?? '/geo/environment').replace(/\/$/, '');
// Adapter-owned priors; renderers never interpret RESOLVE classifications.
const priors = Object.fromEntries(Object.entries(RESOLVE_ENVIRONMENTS).map(([key, environment]) => [key, {
  canopy: environment!.canopy,
  normalStrength: sampleGround(materialWeights(environment!, {elevation:0,slope:0,aspect:0,ruggedness:0,curvature:0,normal:[0,1,0]}),0).normalStrength,
}]));
export const naturalSurfaceProvider: NaturalSurfaceProvider = {
  mode: 'natural',
  adapt: (reference) => ({
    ...reference,
    id: `${reference.id}:natural-v1`,
    reconstructed: false,
    notice: 'Natural ground materials · modern ecological fallback · Beyer and CHELSA unavailable · not reconstructed for the selected year',
    layers: reference.layers.map(layer => layer.classification === 'water' || layer.geography.kind !== 'raster' ? layer : ({
      ...layer,
      surface: priors[layer.classification] ? {
        ...priors[layer.classification],
        manifestUrl: `${root}/natural-v1/manifest.json`,
        propertyTileTemplate: `${root}/natural-v1/${layer.classification}-properties/{z}/{x}/{y}.png`,
      } : undefined,
      geography: { ...layer.geography, tileTemplate: `${root}/natural-v1/${layer.classification}/{z}/{x}/{y}.png` },
      provenance: {
        ...layer.provenance,
        version: `${layer.provenance.version}; natural-v1 material synthesis`,
        dataset: `${layer.provenance.dataset} + Terrarium-derived natural ground materials`,
      },
    })),
  }),
};
