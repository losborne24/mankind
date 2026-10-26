import type { EnvironmentClass } from '../environment/model';
import type { NaturalEnvironment } from './materials';

/** Broad modern ecological priors only. Not historical climate/cover measurements.
 * No tundra/snow inference: current rasters omit these source categories.
 */
export const RESOLVE_ENVIRONMENTS: Partial<Record<EnvironmentClass, NaturalEnvironment>> = {
  forest: { ground: { forestFloor: 0.7, moistSoil: 0.2, grass: 0.1 }, canopy: 0.75, grass: 0.15, snow: 0, reconstructed: false },
  grassland: { ground: { grass: 0.65, drySoil: 0.25, gravel: 0.1 }, canopy: 0.08, grass: 0.8, snow: 0, reconstructed: false },
  shrubland: { ground: { grass: 0.3, drySoil: 0.4, gravel: 0.3 }, canopy: 0.15, grass: 0.35, snow: 0, reconstructed: false },
  desert: { ground: { sand: 0.4, gravel: 0.3, drySoil: 0.2, rock: 0.1 }, canopy: 0, grass: 0.02, snow: 0, reconstructed: false },
  wetland: { ground: { moistSoil: 0.65, grass: 0.35 }, canopy: 0.2, grass: 0.65, snow: 0, reconstructed: false },
};
