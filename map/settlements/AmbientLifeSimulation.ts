import type { NavigationGraph } from "@/map/settlements/proceduralSettlement";

export interface VillagerState {
  id: string;
  node: string;
  edge: NavigationGraph["edges"][number] | null;
  destination: string;
  route: string[];
  progress: number;
  speed: number;
  state: "idle" | "walking";
  idleRemaining: number;
  facing: number;
  x: number;
  z: number;
  distance: number;
  random: number;
}
export const LIFE_STEP = 1 / 30;

/** Pure metre-space simulation. RNG belongs to each inhabitant, never to a render frame. */
export class AmbientLifeSimulation {
  readonly villagers: VillagerState[] = [];
  readonly nodes: Map<string, NavigationGraph["nodes"][number]>;
  private readonly adjacency = new Map<string, Array<{ id: string; edge: NavigationGraph["edges"][number] }>>();
  private readonly routes = new Map<string, string[]>();
  private remainder = 0;
  private readonly destinations = new Map<string, string[]>();
  constructor(readonly graph: NavigationGraph, readonly seed: number, count = 3) {
    this.nodes = new Map(graph.nodes.map(n => [n.id, n]));
    for (const n of graph.nodes) this.adjacency.set(n.id, []);
    for (const e of graph.edges) {
      if (!this.nodes.has(e.from) || !this.nodes.has(e.to) || e.lengthMeters <= 0) continue;
      this.adjacency.get(e.from)!.push({ id: e.to, edge: e });
      this.adjacency.get(e.to)!.push({ id: e.from, edge: e });
    }
    // Small, static graph: precompute Dijkstra once, so route decisions allocate nothing per tick.
    for (const start of graph.nodes) {
      const distances = new Map<string, number>([[start.id, 0]]), previous = new Map<string, string>(), visited = new Set<string>();
      while (true) {
        let current: string | undefined, best = Infinity;
        for (const [id, d] of distances) if (!visited.has(id) && d < best) { current = id; best = d; }
        if (current === undefined) break;
        visited.add(current);
        for (const next of this.adjacency.get(current)!) if (best + next.edge.lengthMeters < (distances.get(next.id) ?? Infinity)) {
          distances.set(next.id, best + next.edge.lengthMeters); previous.set(next.id, current);
        }
      }
      for (const end of distances.keys()) {
        const path = [end];
        while (path[0] !== start.id) path.unshift(previous.get(path[0])!);
        this.routes.set(`${start.id}|${end}`, path);
      }
    }
    for (const n of graph.nodes) this.destinations.set(n.id, graph.nodes.filter(end => end.id !== n.id && this.routes.has(`${n.id}|${end.id}`)).map(end => end.id));
    this.setCount(count);
  }
  setCount(count: number): void {
    count = Number.isFinite(count) ? Math.max(0, Math.min(5, Math.floor(count))) : 0;
    this.villagers.length = Math.min(this.villagers.length, count);
    const connected = this.graph.nodes.filter(n => this.adjacency.get(n.id)!.length);
    if (!connected.length) return;
    while (this.villagers.length < count) {
      const index = this.villagers.length;
      const v: VillagerState = { id: `villager-${this.seed}-${index}`, node: "", edge: null, destination: "", route: [], progress: 0,
        speed: 0, state: "idle", idleRemaining: 0, facing: 0, x: 0, z: 0, distance: 0,
        random: ((this.seed >>> 0) ^ Math.imul(Math.trunc(this.seed / 4294967296), 0x9e3779b9) ^ Math.imul(index + 1, 0x85ebca6b)) >>> 0 };
      const node = connected[Math.floor(this.random(v) * connected.length)];
      v.node = v.destination = node.id; v.x = node.point[0]; v.z = node.point[1];
      v.speed = .85 + this.random(v) * .45; v.idleRemaining = .4 + this.random(v) * 2.5;
      this.villagers.push(v);
    }
  }
  reset(): void { this.remainder = 0; const count = this.villagers.length; this.setCount(0); this.setCount(count); }
  private random(v: VillagerState): number {
    v.random = (Math.imul(v.random, 1664525) + 1013904223) >>> 0;
    return v.random / 4294967296;
  }
  /** Caller supplies traversability/placement readiness, independent of any geometry API. */
  advance(seconds: number, canPlace: (v: VillagerState, x: number, z: number) => boolean = () => true): void {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    this.remainder += seconds;
    while (this.remainder + 1e-9 >= LIFE_STEP) {
      this.remainder -= LIFE_STEP;
      for (const v of this.villagers) {
        if (v.state === "idle") {
          if (!canPlace(v, v.x, v.z)) continue;
          v.idleRemaining -= LIFE_STEP;
          if (v.idleRemaining > 0) continue;
          const options = this.destinations.get(v.node)!;
          if (!options.length) continue;
          v.destination = options[Math.floor(this.random(v) * options.length)];
          v.route = this.routes.get(`${v.node}|${v.destination}`)!;
          v.state = "walking";
        }
        const nextId = v.route[v.route.indexOf(v.node) + 1];
        const next = this.nodes.get(nextId)!;
        const edge = this.adjacency.get(v.node)!.find(e => e.id === nextId)!.edge;
        const start = this.nodes.get(v.node)!;
        const progress = Math.min(1, v.progress + v.speed * LIFE_STEP / edge.lengthMeters);
        const x = start.point[0] + (next.point[0] - start.point[0]) * progress;
        const z = start.point[1] + (next.point[1] - start.point[1]) * progress;
        if (!canPlace(v, x, z)) continue;
        v.edge = edge; v.distance += (progress - v.progress) * edge.lengthMeters;
        v.progress = progress; v.x = x; v.z = z;
        v.facing = Math.atan2(next.point[0] - start.point[0], next.point[1] - start.point[1]);
        if (progress === 1) {
          v.node = nextId; v.progress = 0; v.edge = null;
          if (v.node === v.destination) { v.state = "idle"; v.idleRemaining = 1.5 + this.random(v) * 6; }
        }
      }
    }
  }
}
