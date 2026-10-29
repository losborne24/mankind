import { assetRegistry, type AssetDefinition } from "@/lib/assets/registry";
import { selectRomanVariants, type RomanArchetype } from "@/map/settlements/romanVariation";
import { offsetCoordinate, type Coordinate, type LocalPoint, type SettlementDefinition } from "@/map/settlements/romanSettlement";
import { buildingContacts, populateSettlementEnvironment, footprintDistance, localToSettlement, type ContactFootprint } from "@/map/settlements/settlementEnvironment";
import type { TerrainSample } from "@/map/terrain";
import { settlementEnvironmentConfig } from "@/map/settlements/environmentConfig";

export interface ProceduralSettlementConfig {
  origin: Coordinate;
  seed: number;
  archetype: "roman-roadside-village";
  targetBuildingCount: number;
  buildingWeights: Record<RomanArchetype, number>;
  /** Bounded by the existing 96 × 128 m material/shadow footprint. */
  extentMeters: number;
  road: { headingRadians: number; alignmentVariationRadians: number; widthMeters: number; setbackMeters: number };
  terrain: { maxRoadGrade: number; maxPlotGrade: number; maxFoundationRiseMeters: number };
}
export interface NavigationGraph {
  nodes: { id: string; point: LocalPoint; kind: "road" | "intersection" | "entrance"; buildingId?: string }[];
  edges: { from: string; to: string; lengthMeters: number; roadId: string }[];
}
export interface GenerationResult {
  state: "waiting-terrain" | "ready" | "partial" | "unsuitable";
  seed: number;
  requested: number;
  accepted: number;
  rejected: number;
  terrainReady: boolean;
  message: string;
  definition?: SettlementDefinition;
  navigation: NavigationGraph;
}
export type GenerationSampler = (coordinate: Coordinate) => TerrainSample;
export const DEFAULT_PROCEDURAL_CONFIG: ProceduralSettlementConfig = {
  origin: [12.55, 41.85], seed: 7, archetype: "roman-roadside-village", targetBuildingCount: 8,
  buildingWeights: { house: 5, workshop: 2, farmhouse: 2 }, extentMeters: 72,
  road: { headingRadians: 0, alignmentVariationRadians: 0.22, widthMeters: 4, setbackMeters: 3 },
  terrain: { maxRoadGrade: 0.16, maxPlotGrade: 0.2, maxFoundationRiseMeters: 1.4 },
};
const distance = (a: LocalPoint, b: LocalPoint) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const emptyGraph = (): NavigationGraph => ({ nodes: [], edges: [] });
const PENDING = Symbol("pending terrain");

function validateConfig(c: ProceduralSettlementConfig) {
  if (!Number.isSafeInteger(c.seed)) throw new Error("Seed must be a safe integer.");
  if (c.archetype !== "roman-roadside-village") throw new Error("Unsupported settlement archetype.");
  if (!Number.isInteger(c.targetBuildingCount) || c.targetBuildingCount < 5 || c.targetBuildingCount > 12) throw new Error("Request 5–12 buildings.");
  const positive = [c.extentMeters, c.road.widthMeters, c.road.setbackMeters, ...Object.values(c.terrain)];
  if (positive.some((v) => !Number.isFinite(v) || v <= 0) || c.extentMeters < 36 || c.extentMeters > 80 || c.road.widthMeters > 6 ||
    !Number.isFinite(c.road.headingRadians) || !Number.isFinite(c.road.alignmentVariationRadians) || c.road.alignmentVariationRadians < 0 || c.road.alignmentVariationRadians > 0.5)
    throw new Error("Invalid extent, road or terrain constraints.");
  if (Object.values(c.buildingWeights).some((w) => !Number.isFinite(w) || w < 0) || Object.values(c.buildingWeights).reduce((a, b) => a + b, 0) <= 0) throw new Error("Building weights must be nonnegative with a positive total.");
  if (c.origin.some((v) => !Number.isFinite(v)) || Math.abs(c.origin[1]) > 85 || Math.abs(c.origin[0]) > 180) throw new Error("Unsupported geographic origin.");
  offsetCoordinate(c.origin, [0, 0]);
}

/** Exact support lattice used by the assembler's ≤2 m foundation subdivision, including complex feet. */
export function plotSupportSamples(building: SettlementDefinition["buildings"][number]) {
  return buildingContacts(building).flatMap((f) => {
    const nx = Math.ceil(f.width / 2), nz = Math.ceil(f.depth / 2);
    return Array.from({ length: (nx + 1) * (nz + 1) }, (_, i) => ({
      point: localToSettlement([f.width * (i % (nx + 1) / nx - 0.5), f.depth * (Math.floor(i / (nx + 1)) / nz - 0.5)], f.offset, f.heading), base: f.base ?? 0,
    }));
  });
}
function plotFits(building: SettlementDefinition["buildings"][number], height: (p: LocalPoint) => number, config: ProceduralSettlementConfig) {
  const samples = plotSupportSamples(building);
  const heights = samples.map((s) => height(s.point));
  const rise = Math.max(...heights.map((h, i) => h - samples[i].base)) + settlementEnvironmentConfig.seatingClearance - Math.min(...heights);
  const [w,,d] = assetRegistry[building.assetId].dimensionsMeters;
  return rise <= config.terrain.maxFoundationRiseMeters && (Math.max(...heights) - Math.min(...heights)) / Math.min(w, d) <= config.terrain.maxPlotGrade;
}
/** Sample both margins and centre at ≤1 m, checking longitudinal and cross grades. */
function roadFits(road: SettlementDefinition["roads"][number], height: (p: LocalPoint) => number, grade: number) {
  for (let s = 1; s < road.points.length; s++) {
    const a = road.points[s - 1], b = road.points[s], length = distance(a, b), steps = Math.ceil(length);
    if (length < 0.01) return false;
    const nx = -(b[1] - a[1]) / length, nz = (b[0] - a[0]) / length;
    let previous: number[] | undefined;
    for (let i = 0; i <= steps; i++) {
      const row = [-0.5, 0, 0.5].map((t) => height([a[0] + (b[0] - a[0]) * i / steps + nx * road.widthMeters * t, a[1] + (b[1] - a[1]) * i / steps + nz * road.widthMeters * t]));
      if (Math.abs(row[0] - row[2]) / road.widthMeters > grade || previous && row.some((h, j) => Math.abs(h - previous![j]) / (length / steps) > grade)) return false;
      previous = row;
    }
  }
  return true;
}
/** Check the same smooth entrance lift applied by SettlementScene.updateAccessPaths. */
function entranceRampFits(path: SettlementDefinition["roads"][number], floor: number, height: (p: LocalPoint) => number, maxGrade: number) {
  const a = path.points[0], b = path.points.at(-1)!, length = distance(a,b), steps = Math.ceil(length / 0.25);
  let previous = height(a) + 0.08;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, smooth = t*t*(3-2*t);
    const ground = height([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);
    const y = (ground + 0.08)*(1-smooth)+floor*smooth;
    if (Math.abs(y-previous)/(length/steps) > maxGrade) return false;
    previous = y;
  }
  return true;
}
function footprint(building: SettlementDefinition["buildings"][number]): ContactFootprint {
  const [width,,depth] = assetRegistry[building.assetId].dimensionsMeters;
  return { offset: building.offset, width, depth, heading: building.headingRadians ?? 0 };
}
function roadClears(road: SettlementDefinition["roads"][number], f: ContactFootprint, clearance = 0.7) {
  return road.points.slice(1).every((b, i) => {
    const a = road.points[i], steps = Math.ceil(distance(a, b) / 0.25);
    return Array.from({length: steps + 1}, (_, j) => footprintDistance([a[0] + (b[0] - a[0]) * j / steps, a[1] + (b[1] - a[1]) * j / steps], f))
      .every((d) => d > road.widthMeters / 2 + clearance);
  });
}

/** Pure bounded search. Missing samples abort the transaction; no provisional layouts escape. */
export function generateSettlement(config: ProceduralSettlementConfig, sample: GenerationSampler): GenerationResult {
  validateConfig(config);
  // Fold the high bits too: safe-integer seeds separated by 2^32 must vary.
  let randomState = (config.seed >>> 0) ^ Math.imul(Math.trunc(config.seed / 4294967296), 0x9e3779b9);
  const random = () => { randomState += 0x6d2b79f5; let n = Math.imul(randomState ^ randomState >>> 15, 1 | randomState); n ^= n + Math.imul(n ^ n >>> 7, 61 | n); return ((n ^ n >>> 14) >>> 0) / 4294967296; };
  const heights = new Map<string, number>();
  const height = (p: LocalPoint): number => {
    const key = p.join(",");
    if (heights.has(key)) return heights.get(key)!;
    const value = sample(offsetCoordinate(config.origin, p));
    if (value.readiness !== "confirmed" || value.displayMeters === null || !Number.isFinite(value.displayMeters)) throw PENDING;
    heights.set(key, value.displayMeters); return value.displayMeters;
  };
  let rejected = 0, adaptedToTerrain = false;
  const result = (state: GenerationResult["state"], message: string, definition?: SettlementDefinition): GenerationResult => ({
    state, seed: config.seed, requested: config.targetBuildingCount, accepted: definition?.buildings.length ?? 0, rejected,
    terrainReady: state !== "waiting-terrain", message: adaptedToTerrain && definition ? `${message} Layout adapted around unsuitable terrain.` : message, definition, navigation: definition ? navigationGraph(definition) : emptyGraph(),
  });
  try {
    const variation = (random() - 0.5) * 2 * config.road.alignmentVariationRadians;
    const headings = [config.road.headingRadians + variation, config.road.headingRadians + variation + Math.PI / 2];
    const half = config.extentMeters * 0.43;
    const roads: SettlementDefinition["roads"][number][] = [];
    let heading = headings[0];
    for (const candidate of headings) {
      const road = {id: "main-road", widthMeters: config.road.widthMeters, points: ([[0, -half], [0, half]] as LocalPoint[]).map((p) => localToSettlement(p, [0, 0], candidate))};
      if (roadFits(road, height, config.terrain.maxRoadGrade)) { roads.push(road); heading = candidate; break; }
      adaptedToTerrain = true;
    }
    if (!roads.length) return result("unsuitable", "No safe principal road alignment within the site.");
    const buildings: SettlementDefinition["buildings"][number][] = [];
    const weights = Object.entries(config.buildingWeights) as [RomanArchetype, number][];
    for (let attempt = 0; attempt < 160 && buildings.length < config.targetBuildingCount; attempt++) {
      let cursor = random() * weights.reduce((s, [, w]) => s + w, 0);
      const archetype = (weights.find(([, w]) => (cursor -= w) < 0) ?? weights.at(-1)!)[0];
      const assetId = selectRomanVariants((config.seed ^ attempt), [archetype])[0];
      const asset: AssetDefinition & {dimensionsMeters: readonly [number,number,number]} = assetRegistry[assetId], side = random() < 0.5 ? -1 : 1;
      const [w,,d] = asset.dimensionsMeters;
      const z = (random() - 0.5) * (half * 2 - w - 4);
      const x = side * (config.road.widthMeters / 2 + config.road.setbackMeters + d / 2 + random() * 4);
      const building = { id: `plot-${buildings.length + 1}`, assetId, offset: localToSettlement([x, z], [0, 0], heading), headingRadians: heading - side * Math.PI / 2 + (random() - 0.5) * 0.18 };
      const f = footprint(building), radius = Math.hypot(w, d) / 2;
      const entrance = asset.grounding?.entrance;
      if (!entrance) { rejected++; continue; }
      const door = localToSettlement(entrance, building.offset, building.headingRadians);
      const frameDoor = localToSettlement(door, [0, 0], -heading);
      const access = {id: `access-${building.id}`, widthMeters: 1.4, points: [localToSettlement([0, frameDoor[1]], [0, 0], heading), door], accessTo: building.id};
      if (Math.abs(x) + radius > config.extentMeters / 2 || Math.abs(z) + radius > config.extentMeters / 2 ||
        buildings.some((b) => distance(b.offset, building.offset) < radius + Math.hypot(assetRegistry[b.assetId].dimensionsMeters[0], assetRegistry[b.assetId].dimensionsMeters[2]) / 2 + 1.8) ||
        roads.some((r) => !roadClears(r, f)) || buildings.some((b) => !roadClears(access, footprint(b))) ||
        Math.abs(frameDoor[1]) >= half - 1) { rejected++; continue; }
      if (!plotFits(building, height, config) || !roadFits(access, height, config.terrain.maxRoadGrade)) { rejected++; adaptedToTerrain = true; continue; }
      // Match the assembler's level entrance ramp; the final approach must remain walkable.
      const support = plotSupportSamples(building);
      const floor = Math.max(...support.map((p) => height(p.point) - p.base)) + settlementEnvironmentConfig.seatingClearance;
      if (!entranceRampFits(access, floor, height, config.terrain.maxRoadGrade)) { rejected++; adaptedToTerrain = true; continue; }
      buildings.push(building); roads.push(access);
    }
    if (!buildings.length) return result("unsuitable", "Road fits, but no safe building plots could be accommodated.");
    const definition: SettlementDefinition = {id: "fictional-procedural-roman-village", seed: config.seed, origin: config.origin, buildings, roads,
      roadFrameHeadingRadians: heading, groundAreas: [], maxFoundationRiseMeters: config.terrain.maxFoundationRiseMeters, scenery: []};
    // Populate layout candidates through the shared environment module. The existing
    // scenery lifecycle retains traffic filtering, wall plants and instancing.
    populateSettlementEnvironment(definition, config.extentMeters);
    return result(buildings.length === config.targetBuildingCount ? "ready" : "partial", buildings.length === config.targetBuildingCount ? "Fictional Roman roadside village." : "Site capacity reached; safe partial layout retained.", definition);
  } catch (error) {
    if (error === PENDING) return result("waiting-terrain", "Waiting for confirmed DEM coverage; no layout committed.");
    throw error;
  }
}

/** Main-road junctions are split explicitly; no graph dependency on Three.js. */
export function navigationGraph(definition: SettlementDefinition): NavigationGraph {
  const graph = emptyGraph(), main = definition.roads[0];
  if (!main) return graph;
  const points = [main.points[0], ...definition.roads.slice(1).map((r) => r.points[0]), main.points.at(-1)!]
    .sort((a,b) => distance(a,main.points[0])-distance(b,main.points[0]));
  for (const point of points) if (!graph.nodes.some((n) => distance(n.point,point) < 1e-8)) graph.nodes.push({id:`road-${graph.nodes.length}`,point,kind:"road"});
  const edge = (a: NavigationGraph["nodes"][number], b: NavigationGraph["nodes"][number], roadId: string) => graph.edges.push({from:a.id,to:b.id,lengthMeters:distance(a.point,b.point),roadId});
  for (let i=1;i<graph.nodes.length;i++) edge(graph.nodes[i-1],graph.nodes[i],main.id);
  for (const access of definition.roads.slice(1)) {
    const start = graph.nodes.find((n) => distance(n.point,access.points[0]) < 1e-8)!;
    start.kind = "intersection";
    const end: NavigationGraph["nodes"][number] = {id:`entrance-${access.accessTo}`,point:access.points.at(-1)!,kind:"entrance",buildingId:access.accessTo};
    graph.nodes.push(end); edge(start,end,access.id);
  }
  return graph;
}

/** Validate accepted geometry only. Missing new coverage retains the previous valid layout. */
export function layoutStillSuitable(result: GenerationResult, config: ProceduralSettlementConfig, sample: GenerationSampler): boolean {
  if (!result.definition) return true;
  const height = (p: LocalPoint) => { const s = sample(offsetCoordinate(config.origin,p)); if (s.readiness !== "confirmed" || s.displayMeters === null || !Number.isFinite(s.displayMeters)) throw PENDING; return s.displayMeters; };
  try {
    return result.definition.buildings.every((b) => plotFits(b,height,config)) && result.definition.roads.every((r) => roadFits(r,height,config.terrain.maxRoadGrade)) && result.definition.buildings.every((b) => {
      const path = result.definition!.roads.find((r) => r.accessTo === b.id)!;
      const floor = Math.max(...plotSupportSamples(b).map((p) => height(p.point)-p.base))+settlementEnvironmentConfig.seatingClearance;
      return entranceRampFits(path,floor,height,config.terrain.maxRoadGrade);
    });
  } catch (error) { if (error === PENDING) return true; throw error; }
}
