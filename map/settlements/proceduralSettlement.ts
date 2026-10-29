import { assetRegistry, type AssetDefinition } from "@/lib/assets/registry";
import { selectRomanVariants, type RomanArchetype } from "@/map/settlements/romanVariation";
import { offsetCoordinate, type Coordinate, type LocalPoint, type SettlementDefinition } from "@/map/settlements/romanSettlement";
import { buildingContacts, populateSettlementEnvironment, footprintDistance, localToSettlement, type ContactFootprint } from "@/map/settlements/settlementEnvironment";
import type { TerrainSample } from "@/map/terrain";
import { settlementEnvironmentConfig } from "@/map/settlements/environmentConfig";

export type SettlementProfile = "hamlet" | "village" | "small-town";
export interface ProceduralSettlementConfig {
  /** Omit only for the preserved eight-building benchmark. */
  profile?: SettlementProfile;
  origin: Coordinate;
  seed: number;
  archetype: "roman-roadside-village";
  targetBuildingCount: number;
  buildingWeights: Record<RomanArchetype, number>;
  /** Local site extent; scene coverage expands explicitly with the profile. */
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
  attempts?: number;
  terrainSamples?: number;
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
/** Prototype capacities, independent of historical population. Small town is experimental. */
export const SETTLEMENT_PROFILES = {
  hamlet: { label: "Hamlet", range: [4, 8], target: 6, extent: 72, lanes: 0, spacing: 1.8, vegetation: 110, farmland: 2, courtyard: 0, villagers: 2, weights: { house: 5, workshop: 1, farmhouse: 3 } },
  village: { label: "Village", range: [12, 25], target: 22, extent: 104, lanes: 2, spacing: 1.8, vegetation: 160, farmland: 4, courtyard: 9, villagers: 4, weights: { house: 7, workshop: 3, farmhouse: 2 } },
  "small-town": { label: "Small town (experimental)", range: [30, 60], target: 40, extent: 164, lanes: 4, spacing: 1.8, vegetation: 180, farmland: 5, courtyard: 12, villagers: 5, weights: { house: 8, workshop: 4, farmhouse: 1 } },
} as const;
export function settlementProfileConfig(profile: SettlementProfile): ProceduralSettlementConfig {
  const p = SETTLEMENT_PROFILES[profile];
  return { ...DEFAULT_PROCEDURAL_CONFIG, profile, targetBuildingCount: p.target, extentMeters: p.extent,
    buildingWeights: { ...p.weights }, road: { ...DEFAULT_PROCEDURAL_CONFIG.road },
    terrain: { ...DEFAULT_PROCEDURAL_CONFIG.terrain, maxRoadGrade: profile === "small-town" ? 0.12 : 0.16 } };
}
const distance = (a: LocalPoint, b: LocalPoint) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const emptyGraph = (): NavigationGraph => ({ nodes: [], edges: [] });
const PENDING = Symbol("pending terrain");

function validateConfig(c: ProceduralSettlementConfig) {
  if (c.profile && !Object.hasOwn(SETTLEMENT_PROFILES,c.profile)) throw new Error("Unknown settlement profile.");
  if (!Number.isSafeInteger(c.seed)) throw new Error("Seed must be a safe integer.");
  if (c.archetype !== "roman-roadside-village") throw new Error("Unsupported settlement archetype.");
  if (!Number.isInteger(c.targetBuildingCount) || c.targetBuildingCount < (c.profile ? SETTLEMENT_PROFILES[c.profile].range[0] : 5) || c.targetBuildingCount > (c.profile ? SETTLEMENT_PROFILES[c.profile].range[1] : 12)) throw new Error(c.profile ? "Building count outside profile capacity range." : "Request 5–12 buildings.");
  const positive = [c.extentMeters, c.road.widthMeters, c.road.setbackMeters, ...Object.values(c.terrain)];
  if (positive.some((v) => !Number.isFinite(v) || v <= 0) || c.extentMeters < 36 || c.extentMeters > (c.profile ? 180 : 80) || c.road.widthMeters > 6 ||
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
  let rejected = 0, attempts = 0, adaptedToTerrain = false;
  const profile = config.profile ? SETTLEMENT_PROFILES[config.profile] : undefined;
  const result = (state: GenerationResult["state"], message: string, definition?: SettlementDefinition): GenerationResult => ({
    state, seed: config.seed, attempts, terrainSamples: heights.size, requested: config.targetBuildingCount, accepted: definition?.buildings.length ?? 0, rejected,
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
    const transform = (p: LocalPoint) => localToSettlement(p, [0, 0], heading);
    // Every lane crosses the main street; additional town streets cross both lanes.
    const laneOffset = config.extentMeters * (profile ? 0.21 + random() * 0.04 : 0.23);
    if (profile?.lanes) {
      const candidates = [-laneOffset, laneOffset].map((z, i) => ({ id: `lane-${i}`, widthMeters: 3, points: [transform([-half, z]), transform([half, z])] }));
      for (const lane of candidates) {
        if (roadFits(lane, height, config.terrain.maxRoadGrade)) roads.push(lane);
        else adaptedToTerrain = true;
      }
      if (profile.lanes === 4 && roads.length === 3) for (const x of [-laneOffset, laneOffset]) {
        const lane = { id: `street-${x}`, widthMeters: 3, points: [transform([x, -half]), transform([x, half])] };
        if (roadFits(lane, height, config.terrain.maxRoadGrade)) roads.push(lane);
        else adaptedToTerrain = true;
      }
    }
    const streets = [...roads];
    let court = profile?.courtyard ? { id: "shared-court", kind: "courtyard" as const, offset: transform([profile.courtyard / 2 + config.road.widthMeters / 2, 0]), widthMeters: profile.courtyard, depthMeters: profile.courtyard, headingRadians: heading } : undefined;
    if (court && !roadFits({id:"court-suitability",widthMeters:court.widthMeters,points:[transform([config.road.widthMeters/2+court.widthMeters/2,-court.depthMeters/2]),transform([config.road.widthMeters/2+court.widthMeters/2,court.depthMeters/2])]},height,config.terrain.maxRoadGrade)) {
      court=undefined;adaptedToTerrain=true;
    }
    const buildings: SettlementDefinition["buildings"][number][] = [];
    const weights = Object.entries(config.buildingWeights) as [RomanArchetype, number][];
    for (let attempt = 0; attempt < (profile ? Math.min(960, config.targetBuildingCount * 24) : 160) && buildings.length < config.targetBuildingCount; attempt++) {
      if (heights.size > 16000) break; // Hard coverage budget, independent of requested capacity.
      attempts++;
      const street = profile ? streets[attempt % streets.length] : streets[0];
      const streetHeading = heading + (street.id.startsWith("lane-") ? Math.PI / 2 : 0);
      const centre: LocalPoint = [(street.points[0][0] + street.points[1][0]) / 2, (street.points[0][1] + street.points[1][1]) / 2];
      let cursor = random() * weights.reduce((s, [, w]) => s + w, 0);
      let archetype = (weights.find(([, w]) => (cursor -= w) < 0) ?? weights.at(-1)!)[0];
      // Agriculture occupies outer frontage; important central frontage favours workshops.
      const frontage = profile ? (random() - 0.5) * (half * 2 - 14) : 0;
      if (profile && street.id === "main-road" && archetype === "house" && Math.abs(frontage) < half * 0.5 && random() < 0.45) archetype = "workshop";
      if (profile && archetype === "farmhouse" && Math.abs(frontage) < half * 0.5) archetype = "house";
      const assetId = selectRomanVariants((config.seed ^ attempt), [archetype])[0];
      const asset: AssetDefinition & {dimensionsMeters: readonly [number,number,number]} = assetRegistry[assetId], side = random() < 0.5 ? -1 : 1;
      const [w,,d] = asset.dimensionsMeters;
      const z = profile ? frontage : (random() - 0.5) * (half * 2 - w - 4);
      const x = side * (street.widthMeters / 2 + config.road.setbackMeters + d / 2 + random() * 4);
      const building = { id: `plot-${buildings.length + 1}`, assetId, offset: localToSettlement([x, z], centre, streetHeading), headingRadians: streetHeading - side * Math.PI / 2 + (random() - 0.5) * 0.18 };
      const f = footprint(building), radius = Math.hypot(w, d) / 2;
      const entrance = asset.grounding?.entrance;
      if (!entrance) { rejected++; continue; }
      const door = localToSettlement(entrance, building.offset, building.headingRadians);
      const frameDoor = localToSettlement([door[0]-centre[0], door[1]-centre[1]], [0, 0], -streetHeading);
      const access = {id: `access-${building.id}`, widthMeters: 1.4, points: [localToSettlement([0, frameDoor[1]], centre, streetHeading), door], accessTo: building.id};
      if ((profile ? Math.max(Math.abs(building.offset[0]), Math.abs(building.offset[1])) + radius > config.extentMeters / 2 : Math.abs(x) + radius > config.extentMeters / 2 || Math.abs(z) + radius > config.extentMeters / 2) ||
        court && footprintDistance(building.offset, {offset:court.offset,width:court.widthMeters,depth:court.depthMeters,heading}) < radius + 1 ||
        buildings.some((b) => distance(b.offset, building.offset) < radius + Math.hypot(assetRegistry[b.assetId].dimensionsMeters[0], assetRegistry[b.assetId].dimensionsMeters[2]) / 2 + (profile?.spacing ?? 1.8)) ||
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
      profile: config.profile, groundSizeMeters: profile ? config.extentMeters * 1.45 + 16 : undefined,
      roadFrameHeadingRadians: heading, groundAreas: court ? [court] : [], maxFoundationRiseMeters: config.terrain.maxFoundationRiseMeters, scenery: []};
    // Populate layout candidates through the shared environment module. The existing
    // scenery lifecycle retains traffic filtering, wall plants and instancing.
    populateSettlementEnvironment(definition, config.extentMeters, profile);
    return result(buildings.length === config.targetBuildingCount ? "ready" : "partial", buildings.length === config.targetBuildingCount ? `Fictional Roman ${config.profile ?? "roadside village"}.` : `Safe partial layout: ${buildings.length}/${config.targetBuildingCount} plots after ${attempts} candidates; ${heights.size > 16000 ? "terrain sampling budget reached" : "terrain/clearance or bounded search capacity reached"}.`, definition);
  } catch (error) {
    if (error === PENDING) return result("waiting-terrain", "Waiting for confirmed DEM coverage; no layout committed.");
    throw error;
  }
}

/** Split bounded straight segments at crossings and projected shared endpoints. */
export function navigationGraph(definition: SettlementDefinition): NavigationGraph {
  const graph = emptyGraph();
  const segments = definition.roads.flatMap(r => r.points.slice(1).map((b,i) => ({a:r.points[i], b, road:r, cuts:[0,1]})));
  const cross = (a: LocalPoint,b: LocalPoint) => a[0]*b[1]-a[1]*b[0];
  const sub = (a: LocalPoint,b: LocalPoint): LocalPoint => [a[0]-b[0],a[1]-b[1]];
  const at = (s: typeof segments[number],t:number): LocalPoint => [s.a[0]+(s.b[0]-s.a[0])*t,s.a[1]+(s.b[1]-s.a[1])*t];
  for(let i=0;i<segments.length;i++) for(let j=i+1;j<segments.length;j++) {
    const a=segments[i],b=segments[j],u=sub(a.b,a.a),v=sub(b.b,b.a),w=sub(b.a,a.a),den=cross(u,v);
    if(Math.abs(den)>1e-8) {
      const t=cross(w,v)/den,q=cross(w,u)/den;
      if(t>=-1e-8&&t<=1+1e-8&&q>=-1e-8&&q<=1+1e-8) {a.cuts.push(Math.max(0,Math.min(1,t)));b.cuts.push(Math.max(0,Math.min(1,q)));}
    } else if(Math.abs(cross(w,u))<1e-8) {
      for(const [source,target] of [[a,b],[b,a]]) for(const p of [source.a,source.b]) {
        const d=sub(target.b,target.a),t=((p[0]-target.a[0])*d[0]+(p[1]-target.a[1])*d[1])/(d[0]*d[0]+d[1]*d[1]);
        if(t>=0&&t<=1) target.cuts.push(t);
      }
    }
  }
  const node = (point:LocalPoint) => {
    let n=graph.nodes.find(n=>distance(n.point,point)<1e-6);
    if(!n) {n={id:`road-${graph.nodes.length}`,point,kind:"road"};graph.nodes.push(n);}
    return n;
  };
  for(const s of segments) {
    const cuts=[...new Set(s.cuts)].sort((a,b)=>a-b);
    for(let i=1;i<cuts.length;i++) {
      const a=node(at(s,cuts[i-1])),b=node(at(s,cuts[i]));
      if(distance(a.point,b.point)>1e-6&&!graph.edges.some(e=>(e.from===a.id&&e.to===b.id)||(e.to===a.id&&e.from===b.id)))
        graph.edges.push({from:a.id,to:b.id,lengthMeters:distance(a.point,b.point),roadId:s.road.id});
    }
  }
  for(const r of definition.roads) if(r.accessTo) {
    const n=node(r.points.at(-1)!);n.kind="entrance";n.buildingId=r.accessTo;
  }
  for(const n of graph.nodes) if(n.kind!=="entrance"&&graph.edges.filter(e=>e.from===n.id||e.to===n.id).length>2) n.kind="intersection";
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
