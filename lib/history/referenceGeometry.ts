/** Compact, single exterior rings only; no repairs or inferred coordinates. */
export function validateReferencePolygon(value: unknown, anchor: [number, number]): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Expected reference polygon');
  const geometry = value as Record<string, unknown>;
  if (Object.keys(geometry).some(key => !['type', 'coordinates'].includes(key)) || geometry.type !== 'Polygon' || !Array.isArray(geometry.coordinates) || geometry.coordinates.length !== 1) throw Error('Reference area needs one Polygon exterior ring');
  const ring = geometry.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4 || ring.length > 512) throw Error('Reference ring vertex budget');
  const points: [number, number][] = ring.map(point => {
    if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 85) throw Error('Invalid reference coordinate');
    const east = (point[0] - anchor[0]) * 111320 * Math.cos(anchor[1] * Math.PI / 180), north = (point[1] - anchor[1]) * 111320;
    if (Math.hypot(east, north) > 2000) throw Error('Reference point exceeds compact place boundary');
    return [east, north];
  });
  if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) throw Error('Reference ring must be closed');
  const cross = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const on = (a: number[], b: number[], c: number[]) => Math.abs(cross(a, b, c)) < 1e-8 && c.every((v, k) => v >= Math.min(a[k], b[k]) - 1e-8 && v <= Math.max(a[k], b[k]) + 1e-8);
  let area = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < .001) throw Error('Reference ring has duplicate adjacent vertices');
    area += a[0] * b[1] - b[0] * a[1];
    for (let j = i + 1; j < points.length - 1; j++) {
      const c = points[j], d = points[j + 1];
      if (j === i + 1 || (i === 0 && j === points.length - 2)) {
        // Adjacent edges may meet, but cannot reverse over each other.
        if (j === i + 1 ? on(a, b, d) || on(c, d, a) : on(a, b, c) || on(c, d, b)) throw Error('Reference ring has overlapping adjacent edges');
        continue;
      }
      if ((cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) || on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b)) throw Error('Reference ring self-intersects');
    }
  }
  if (Math.abs(area) / 2 < 1) throw Error('Reference ring has no usable area');
}
