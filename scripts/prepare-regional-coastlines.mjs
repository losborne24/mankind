/** Offline build using MapLibre's existing tilers; adds no dependencies. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.resolve("maplibre-gl"));
// require.resolve selects the UMD build; use its adjacent ESM entry for Node.
const { GeoJSONVT } = await import(new URL("geojson-vt.mjs", pathToFileURL(require.resolve("@maplibre/geojson-vt"))));
const { fromGeojsonVt } = await import(require.resolve("@maplibre/vt-pbf"));
const revision = "f1890d9f152c896d250a77557a5751a93d494776"; // Natural Earth v5.1.2
const url = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${revision}/geojson/ne_10m_land.geojson`;
const original = process.argv[2]
  ? await readFile(process.argv[2])
  : Buffer.from(await (await fetch(url).then((response) => {
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return response;
  })).arrayBuffer());
assert.equal(createHash("sha256").update(original).digest("hex"),
  "1ac90796408bc6ad6911d69448485d3c4dbf2190370080368a09976e1c9f7416");
const land = JSON.parse(original);
const coast = { type: "FeatureCollection", features: [] };
for (const feature of land.features) {
  feature.properties = {};
  const polygons = feature.geometry.type === "Polygon"
    ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  // Convert BEFORE clipping: tile boundaries must never become coastlines.
  for (const coordinates of polygons) coast.features.push({
    type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates },
  });
}
const zoom = 4;
const extent = 8192; // MapLibre's native extent; ~306 m at the equator at z4.
const buffer = 32;
const options = { maxZoom: zoom, indexMaxZoom: zoom, tolerance: 0, extent, buffer };
const landIndex = new GeoJSONVT(land, options);
const coastIndex = new GeoJSONVT(coast, options);
const output = new URL("../public/geo/natural-earth-v5.1.2/land-10m/4/", import.meta.url);
// Enclose the clipped rings with a one-unit margin: holes touching the outer
// mask edge produce degenerate polygons in the renderer's triangulator.
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
let bytes = 0;
for (let x = 0; x < 2 ** zoom; x++) {
  await mkdir(new URL(`${x}/`, output), { recursive: true });
  for (let y = 0; y < 2 ** zoom; y++) {
    const landTile = landIndex.getTile(zoom, x, y) ?? { features: [] };
    const coastTile = coastIndex.getTile(zoom, x, y) ?? { features: [] };
    // Complementary ocean mask removes the old 50m shoreline during the fade.
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
    const oceanTile = { features: [{ type: 3, tags: {}, geometry: polygons.flatMap(({ ring, holes }) => [ring, ...holes]) }] };
    const data = fromGeojsonVt({ land: landTile, ocean: oceanTile, coastline: coastTile }, { extent, version: 2 });
    await writeFile(new URL(`${x}/${y}.pbf`, output), data);
    bytes += data.length;
  }
}
console.log(`Natural Earth 10m: 256 regional tiles, ${bytes} bytes; no global 10m download.`);
