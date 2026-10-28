import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";
import ts from "typescript";

// Exercise the actual style with MapLibre's installed validator, without WebGL.
const source = await readFile(new URL("../map/mapStyle.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
const { createGlobeStyle } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const require = createRequire(import.meta.resolve("maplibre-gl"));
const { validateStyleMin, classifyRings } = require("@maplibre/maplibre-gl-style-spec");
const style = createGlobeStyle();
assert.deepEqual(validateStyleMin(style), [], "MapLibre style must validate");
assert.equal(style.projection.type, "globe");
assert.ok(!style.glyphs && !style.sprite);
assert.deepEqual(style.terrain, { source: "physical-elevation", exaggeration: 1 });
assert.equal(style.sources[style.terrain.source].encoding, "terrarium");
assert.equal(style.sources[style.terrain.source].tileSize, 512);
assert.equal(style.sources[style.terrain.source].maxzoom, 12);
assert.equal(style.sources[style.terrain.source].type, "raster-dem");
assert.deepEqual(style.sources[style.terrain.source].tiles, ["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"]);
// MapLibre 6 queries include exaggeration. Future object placement must be
// able to distinguish physical metres from the displayed surface height.
const terrainModule = ts.transpileModule(await readFile(new URL("../map/terrain.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
const { queryTerrainHeights } = await import(`data:text/javascript;base64,${Buffer.from(terrainModule.outputText.replace('from "maplibre-gl"', `from "${import.meta.resolve("maplibre-gl")}"`)).toString("base64")}`);
for (const exaggeration of [1, 1.5, 2, 2.5]) {
  const sampleMap = {
    getTerrain: () => ({ exaggeration }),
    queryTerrainElevation: () => 1234 * exaggeration,
  };
  assert.deepEqual(queryTerrainHeights(sampleMap, [7, 46]), {
    elevationMeters: 1234, displayMeters: 1234 * exaggeration,
  });
}
assert.equal(queryTerrainHeights({ getTerrain: () => null, queryTerrainElevation: () => null }, [0, 0]), null);
assert.ok(!JSON.stringify(style).includes("demotiles"));
assert.ok(style.layers.every((layer) => layer.type !== "symbol"));
assert.equal(style.layers.find(({ id }) => id === "coastline").source, "physical-land");
assert.equal(style.layers.find(({ id }) => id === "land").source, "physical-land");

let bytes = 0;
let compressed = 0;
for (const [id, source] of Object.entries(style.sources)) {
  if (id === style.terrain.source) continue;
  if (id === "physical-land-regional") continue;
  assert.equal(source.type, "geojson");
  if (id === "graticule") continue;
  assert.ok(source.data.startsWith("/geo/natural-earth-v5.1.2/"));
  const raw = await readFile(new URL(`../public${source.data}`, import.meta.url));
  const data = JSON.parse(raw);
  bytes += raw.length;
  compressed += gzipSync(raw).length;
  assert.equal(data.type, "FeatureCollection");
  assert.ok(data.features.length > 300);
  for (const feature of data.features) {
    const polygon = id !== "physical-rivers";
    assert.ok((polygon ? ["Polygon", "MultiPolygon"] : ["LineString", "MultiLineString"]).includes(feature.geometry.type));
    assert.ok(Object.keys(feature.properties).every((key) => key === "min_zoom"));
    if (id !== "physical-land") assert.ok(Number.isFinite(feature.properties.min_zoom));
    const inspect = (coordinates) => {
      if (typeof coordinates[0] === "number") {
        assert.equal(coordinates.length, 2);
        assert.ok(Number.isFinite(coordinates[0]) && Math.abs(coordinates[0]) <= 180);
        assert.ok(Number.isFinite(coordinates[1]) && Math.abs(coordinates[1]) <= 90);
      } else {
        coordinates.forEach(inspect);
      }
    };
    inspect(feature.geometry.coordinates);
    if (polygon) {
      const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
      for (const rings of polygons) for (const ring of rings) {
        assert.ok(ring.length >= 4);
        assert.deepEqual(ring[0], ring.at(-1), "Polygon rings must be closed");
      }
    }
  }
  console.log(`${id}: ${data.features.length} valid physical features`);
}

const grid = style.sources.graticule.data.features;
assert.equal(grid.filter(({ properties }) => properties.kind === "meridian").length, 12);
assert.equal(grid.filter(({ properties }) => properties.kind === "parallel").length, 5);
assert.ok(grid.every(({ properties }) => properties.degrees % 30 === 0));
for (const id of ["graticule", "graticule-major"]) {
  const layer = style.layers.find((layer) => layer.id === id);
  assert.equal(layer.maxzoom, 5);
  assert.equal(layer.paint["line-opacity"].at(-1), 0);
}
assert.ok(bytes < 3_000_000, "Keep GeoJSON reasonable for a global base");
console.log(`Style valid; 30° grid valid; geography ${bytes} bytes (${compressed} gzip bytes).`);

// Decode every regional tile: shared vertices, complementary masks, no clip-edge outlines.
const { VectorTile } = await import(require.resolve("@mapbox/vector-tile"));
const { PbfReader } = await import(require.resolve("pbf"));
const { default: earcut, deviation } = await import(require.resolve("earcut"));
const regional = style.sources["physical-land-regional"];
assert.equal(regional.type, "vector");
assert.equal(regional.minzoom, 4);
assert.equal(regional.maxzoom, 4);
assert.deepEqual(regional.tiles, ["/geo/natural-earth-v5.1.2/land-10m/{z}/{x}/{y}.pbf"]);
for (const [id, theme] of [["regional-land", "land"], ["regional-ocean", "ocean"], ["regional-coastline", "coastline"]]) {
  const layer = style.layers.find((layer) => layer.id === id);
  assert.equal(layer.source, "physical-land-regional");
  assert.equal(layer["source-layer"], theme);
}
function inside(rings, x, y) {
  let result = false;
  for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}
let tileBytes = 0;
let tileGzip = 0;
let franceVertices = 0;
for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
  const path = regional.tiles[0].replace("{z}", "4").replace("{x}", x).replace("{y}", y);
  const raw = await readFile(new URL(`../public${path}`, import.meta.url));
  tileBytes += raw.length;
  tileGzip += gzipSync(raw).length;
  const tile = new VectorTile(new PbfReader(raw));
  const geometries = {};
  for (const [name, layer] of Object.entries(tile.layers)) {
    assert.equal(layer.extent, 8192);
    geometries[name] = [];
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      assert.equal(feature.type, name === "coastline" ? 2 : 3);
      assert.equal(Object.keys(feature.properties).length, 0);
      geometries[name].push(...feature.loadGeometry());
    }
  }
  const land = geometries.land ?? [];
  const ocean = geometries.ocean;
  const coast = geometries.coastline ?? [];
  // Use the renderer's own polygon grouping/ring limit and triangulator.
  // In particular, masks must tessellate even where continents fill a tile.
  for (const polygon of classifyRings(ocean, 500)) {
    const coordinates = [], holes = [];
    for (let i = 0; i < polygon.length; i++) {
      if (i) holes.push(coordinates.length / 2);
      for (const point of polygon[i]) coordinates.push(point.x, point.y);
    }
    const triangles = earcut(coordinates, holes, 2);
    // Permit sub-0.1% slivers from integer quantisation of Natural Earth rings.
    assert.ok(deviation(coordinates, holes, 2, triangles) < 0.001, `Ocean mask must tessellate at ${x}/${y}`);
  }
  const vertices = new Set(land.flat().map(({ x, y }) => `${x},${y}`));
  for (const ring of coast) for (const point of ring) {
    if (point.x > -32 && point.x < 8224 && point.y > -32 && point.y < 8224) {
      assert.ok(vertices.has(`${point.x},${point.y}`), `Coast must match land at tile ${x}/${y}`);
    }
  }
  for (const ring of coast) for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i];
    if (a.x === b.x && a.y === b.y) continue;
    assert.ok(!((a.x === b.x && [-32, 8224].includes(a.x)) ||
      (a.y === b.y && [-32, 8224].includes(a.y))) || Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < 32,
    `No artificial coastline along tile clips: ${x}/${y} ${JSON.stringify([a, b])}`);
  }
  for (let px = 512.37; px < 8192; px += 1536) for (let py = 512.73; py < 8192; py += 1536) {
    assert.notEqual(inside(land, px, py), inside(ocean, px, py), `Land/ocean coverage at ${x}/${y}`);
  }
  if ((x === 7 || x === 8) && y === 5) franceVertices += coast.flat().length;
}
assert.ok(franceVertices > 5000, "Retain regional coastline detail around France");
assert.ok(tileBytes < 3_500_000, "Keep the entire tiled regional base small");
console.log(`256 regional tiles valid: ${tileBytes} bytes (${tileGzip} gzip); France-area vertices: ${franceVertices}.`);

// Exercise loading gates, bidirectional zoom, restored cameras and event cleanup.
const detailSource = await readFile(new URL("../map/coastlineDetail.ts", import.meta.url), "utf8");
const detailJs = ts.transpileModule(detailSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText.replace('from "./mapStyle"', `from "data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}"`);
const { attachCoastlineDetail } = await import(`data:text/javascript;base64,${Buffer.from(detailJs).toString("base64")}`);
let zoom = 2, loaded = false;
const changes = [];
const handlers = new Map();
const mock = {
  getSource: () => regional,
  getZoom: () => zoom,
  isSourceLoaded: () => loaded,
  setGlobalStateProperty: (name, value) => changes.push([name, value]),
  on: (name, handler) => handlers.set(name, handler),
  off: (name) => handlers.delete(name),
};
const detach = attachCoastlineDetail(mock);
handlers.get("style.load")();
assert.equal(changes.length, 0);
zoom = 6;
handlers.get("zoom")();
assert.equal(changes.length, 0, "Keep the base until detail is loaded");
loaded = true;
handlers.get("sourcedata")();
assert.deepEqual(changes.at(-1), ["coast-detail", 1]);
zoom = 5;
handlers.get("zoom")();
assert.deepEqual(changes.at(-1), ["coast-detail", 0.5]);
loaded = false;
zoom = 2;
handlers.get("zoom")();
assert.deepEqual(changes.at(-1), ["coast-detail", 0]);
detach();
assert.equal(handlers.size, 0);
zoom = 6;
loaded = true;
const detachRestored = attachCoastlineDetail(mock);
handlers.get("style.load")();
assert.deepEqual(changes.at(-1), ["coast-detail", 1], "Restored regional cameras also fade after loading");
detachRestored();
console.log("Coastline loading gate, zoom fade and lifecycle valid.");
