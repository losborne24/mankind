/** Dataset-independent material parameters. Albedos are sRGB; non-metallic PBR. */
export const GROUND_MATERIALS = {
  rock: { albedo: [115, 111, 101], roughness: 0.92, normalStrength: 0.8 },
  scree: { albedo: [132, 124, 110], roughness: 0.97, normalStrength: 0.9 },
  sand: { albedo: [185, 161, 117], roughness: 0.95, normalStrength: 0.25 },
  gravel: { albedo: [139, 128, 108], roughness: 0.96, normalStrength: 0.65 },
  drySoil: { albedo: [123, 101, 73], roughness: 0.94, normalStrength: 0.4 },
  moistSoil: { albedo: [71, 65, 47], roughness: 0.82, normalStrength: 0.3 },
  forestFloor: { albedo: [83, 68, 45], roughness: 0.98, normalStrength: 0.6 },
  grass: { albedo: [111, 119, 63], roughness: 0.96, normalStrength: 0.45 },
  snow: { albedo: [226, 232, 234], roughness: 0.83, normalStrength: 0.15 },
  ice: { albedo: [169, 193, 199], roughness: 0.28, normalStrength: 0.2 },
} as const;
/** Distant potential canopy tint; coverage comes from the shared environment. */
export const NATURAL_CANOPY_ALBEDO = [48, 76, 43] as const;
/** Shared by cached PBR shading and its native raster appearance. */
export const GROUND_LIGHTING = { sunDirection: [-.45,.82,-.35], irradiance: 1.9, ambient: .40, sky: .16 } as const;
export type GroundMaterial = keyof typeof GROUND_MATERIALS;
export type MaterialWeights = Record<GroundMaterial, number>;

export interface TerrainProperties {
  elevation: number;
  /** Radians, physical (unexaggerated) DEM. */
  slope: number;
  /** Downhill bearing clockwise from north, radians. Flat terrain = 0. */
  aspect: number;
  /** RMS neighbour height difference, metres; not geology or soil depth. */
  ruggedness: number;
  /** Laplacian, 1/metres; diagnostic only, not inferred hydrology. */
  curvature: number;
  /** Local east / up / south. */
  normal: readonly [number, number, number];
}

/** Shared material/vegetation contract. Suitabilities are visual priors, not observations. */
export interface NaturalEnvironment {
  ground: Partial<MaterialWeights>;
  canopy: number;
  grass: number;
  snow: number;
  reconstructed: boolean;
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));
export function materialWeights(environment: NaturalEnvironment, terrain: TerrainProperties): MaterialWeights {
  const weights = Object.fromEntries(Object.keys(GROUND_MATERIALS).map(k => [k, environment.ground[k as GroundMaterial] ?? 0])) as MaterialWeights;
  // Steepness supports exposed rock; ruggedness modulates debris only where steep.
  const exposed = clamp((terrain.slope - 0.22) / 0.65);
  for (const key of Object.keys(weights) as GroundMaterial[]) weights[key] *= 1 - exposed;
  const debris = clamp(terrain.ruggedness / 250) * 0.4;
  weights.rock += exposed * (1 - debris);
  weights.scree += exposed * debris;
  // No elevation snowline, aspect-based invented climate, or depression = wetland rule.
  weights.snow += clamp(environment.snow);
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (!sum) weights.rock = 1;
  else for (const key of Object.keys(weights) as GroundMaterial[]) weights[key] /= sum;
  return weights;
}

/** Periodic geographic noise. No tile/date seed; equal coordinates always agree. */
export function geographicVariation(lon: number, lat: number): number {
  const p = Math.PI / 180;
  const x = Math.cos(lat * p) * Math.cos(lon * p);
  const y = Math.cos(lat * p) * Math.sin(lon * p);
  const z = Math.sin(lat * p);
  return (Math.sin(x * 73 + Math.sin(z * 41)) * Math.cos(y * 67 + z * 17) * 0.6
    + Math.sin(x * 293 + y * 163) * Math.cos(z * 277 - y * 71) * 0.3
    + Math.sin(x * 997 + z * 811) * Math.cos(y * 953) * 0.1);
}

const linear = (v: number) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const srgb = (v: number) => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
const linearAlbedos = Object.fromEntries(Object.entries(GROUND_MATERIALS).map(([k, v]) => [k, v.albedo.map(linear)])) as Record<GroundMaterial, number[]>;

/** Blend in linear light. Variation is artistic detail, never a new ecological class. */
export function sampleGround(weights: MaterialWeights, variation: number) {
  const color = [0, 0, 0];
  let roughness = 0, normalStrength = 0;
  for (const key of Object.keys(GROUND_MATERIALS) as GroundMaterial[]) {
    const w = weights[key];
    if (!w) continue;
    const material = GROUND_MATERIALS[key];
    for (let c = 0; c < 3; c++) color[c] += linearAlbedos[key][c] * w;
    roughness += material.roughness * w;
    normalStrength += material.normalStrength * w;
  }
  return { albedo: color.map(c => Math.round(srgb(clamp(c * (1 + variation * 0.18))))), roughness, normalStrength };
}
