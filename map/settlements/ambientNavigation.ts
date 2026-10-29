import { navigationGraph, type NavigationGraph } from "@/map/settlements/proceduralSettlement";
import type { LocalPoint, SettlementDefinition } from "@/map/settlements/romanSettlement";

/** The procedural graph is authoritative. Authored fixture joins are projected across the main road width,
 * with each approach bend retained; garden/scenery paths are deliberately excluded. */
export function ambientNavigation(definition: SettlementDefinition): NavigationGraph {
  if (definition.id === "fictional-procedural-roman-village") return navigationGraph(definition);
  const graph: NavigationGraph = { nodes: [], edges: [] }, main = definition.roads[0];
  if (!main || main.points.length !== 2) return graph;
  const [a, b] = main.points, dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  if (!l2) return graph;
  const node = (point: LocalPoint, kind: NavigationGraph["nodes"][number]["kind"], buildingId?: string) => {
    let n = graph.nodes.find(n => Math.hypot(n.point[0]-point[0], n.point[1]-point[1]) < 1e-6);
    if (!n) { n = { id: `ambient-node-${graph.nodes.length}`, point, kind, buildingId }; graph.nodes.push(n); }
    return n;
  };
  const edge = (from: ReturnType<typeof node>, to: ReturnType<typeof node>, roadId: string) => {
    const lengthMeters = Math.hypot(from.point[0]-to.point[0], from.point[1]-to.point[1]);
    if (lengthMeters > 1e-6) graph.edges.push({ from: from.id, to: to.id, lengthMeters, roadId });
  };
  const joins = [node(a, "road"), node(b, "road")];
  for (const road of definition.roads.slice(1).filter(r => r.accessTo)) {
    const p = road.points[0], t = Math.max(0, Math.min(1, ((p[0]-a[0])*dx+(p[1]-a[1])*dz)/l2));
    const q: LocalPoint = [a[0]+dx*t, a[1]+dz*t];
    if (Math.hypot(q[0]-p[0], q[1]-p[1]) > main.widthMeters/2 + .01) continue;
    let previous = node(q, "intersection"); joins.push(previous);
    road.points.forEach((point, i) => {
      const next = node(point, i === road.points.length-1 ? "entrance" : "road", i === road.points.length-1 ? road.accessTo : undefined);
      edge(previous, next, road.id); previous = next;
    });
  }
  const sorted = [...new Set(joins)].sort((p,q) => (p.point[0]-q.point[0])*dx+(p.point[1]-q.point[1])*dz);
  for (let i=1; i<sorted.length; i++) edge(sorted[i-1], sorted[i], main.id);
  return graph;
}
