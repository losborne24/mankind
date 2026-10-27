/** Coarse ocean complements from the exact existing 50m land rings. No new dataset. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.resolve("maplibre-gl"));
const { GeoJSONVT } = await import(new URL("geojson-vt.mjs", pathToFileURL(require.resolve("@maplibre/geojson-vt"))));
const { fromGeojsonVt } = await import(require.resolve("@maplibre/vt-pbf"));
const { default: earcut, flatten } = await import(require.resolve("earcut"));
const land = JSON.parse(await readFile(new URL("../public/geo/natural-earth-v5.1.2/ne_50m_land.geojson", import.meta.url), "utf8"));
const extent = 8192, buffer = 32;
const lo = -buffer - 1, hi = extent + buffer + 1;
const rectangle = [[lo, lo], [hi, lo], [hi, hi], [lo, hi], [lo, lo]];
function area(ring) {
  return ring.reduce((sum, point, i) => {
    const next = ring[(i + 1) % ring.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0);
}
function contains(ring, [x, y]) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}
for (let zoom = 0; zoom <= 3; zoom++) {
  const landIndex = new GeoJSONVT(land, { maxZoom: zoom, indexMaxZoom: zoom, tolerance: 0, extent, buffer });
  const output = new URL(`../public/geo/natural-earth-v5.1.2/ocean-50m/${zoom}/`, import.meta.url);
  let bytes = 0;
  for (let x = 0; x < 2 ** zoom; x++) {
    await mkdir(new URL(`${x}/`, output), { recursive: true });
    for (let y = 0; y < 2 ** zoom; y++) {
      const landTile = landIndex.getTile(zoom, x, y) ?? { features: [] };

      // Complementary mask matches the existing 50m shoreline exactly.
      // Reverse the rings, grouping islands with the water polygon containing
      // them (e.g. islands inside the Caspian Sea), rather than nesting holes.
      const rings = landTile.features.flatMap((feature) => feature.geometry);
      const holes = rings.filter((ring) => area(ring) > 0).map((ring) => [...ring].reverse());
      const islands = rings.filter((ring) => area(ring) < 0).map((ring) => [...ring].reverse());
      const polygons = [rectangle, ...islands].map((ring) => ({ ring, area: area(ring), holes: [] }));
      for (const hole of holes) {
        let parent = polygons[0];
        for (const polygon of polygons.slice(1)) {
          if (polygon.area < parent.area && contains(polygon.ring, hole[0])) parent = polygon;
        }
        parent.holes.push(hole);
      }
      // MapLibre 6 clips overzoomed vector polygons into new subtiles. A land
      // hole can then touch the outer tile ring and triangulate as a solid sea
      // rectangle. Clip simple triangles instead: coverage is identical, with
      // no holes for the overzoom tiler to collapse (notably Germany at z5).
      const geometry = zoom < 3 ? polygons.flatMap(({ ring, holes }) => [ring, ...holes]) : polygons.flatMap(({ ring, holes }) => {
        const { vertices, holes: holeIndices, dimensions } = flatten([ring, ...holes]);
        const indices = earcut(vertices, holeIndices, dimensions);
        const result = [];
        for (let i = 0; i < indices.length; i += 3) {
          const triangle = indices.slice(i, i + 3).map((j) => [vertices[j * 2], vertices[j * 2 + 1]]);
          if (area(triangle) < 0) triangle.reverse();
          triangle.push(triangle[0]);
          result.push(triangle);
        }
        return result;
      });
      const oceanTile = { features: [{ type: 3, tags: {}, geometry }] };
      const data = fromGeojsonVt({ ocean: oceanTile }, { extent, version: 2 });
      await writeFile(new URL(`${x}/${y}.pbf`, output), data);
      bytes += data.length;
    }
  }
  console.log(`Global ocean z${zoom}: ${bytes} bytes`);
}
