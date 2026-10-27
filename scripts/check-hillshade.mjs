import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const asModule = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const compile = async (path) => ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const styleModule = asModule(await compile("../map/mapStyle.ts"));
const { createGlobeStyle } = await import(styleModule);
const { attachDiagnosticHillshade } = await import(asModule(
  (await compile("../map/hillshade.ts")).replace('from "./mapStyle"', `from "${styleModule}"`),
));
const require = createRequire(import.meta.resolve("maplibre-gl"));
const { validateStyleMin, createPropertyExpression, latest, classifyRings } = require("@maplibre/maplibre-gl-style-spec");
const style = createGlobeStyle();
const handlers = new Map();
let zoom = 2, detail = 0, loaded = false, coarseLoaded = false;
const mock = {
  addSource: (id, source) => { style.sources[id] = source; },
  addLayer: (layer, before) => { style.layers.splice(style.layers.findIndex(({ id }) => id === before), 0, layer); },
  getLayer: (id) => style.layers.find((layer) => layer.id === id),
  getSource: (id) => style.sources[id],
  removeLayer: (id) => { style.layers = style.layers.filter((layer) => layer.id !== id); },
  removeSource: (id) => { delete style.sources[id]; },
  getZoom: () => zoom,
  getGlobalState: () => ({ "coast-detail": detail }),
  isSourceLoaded: (id) => id === "hillshade-ocean" ? coarseLoaded : loaded,
  setLayoutProperty: (id, name, value) => { (mock.getLayer(id).layout ??= {})[name] = value; },
  on: (name, handler) => handlers.set(name, handler),
  off: (name) => handlers.delete(name),
};
const maskVisibility = () => mock.getLayer("hillshade-ocean-mask").layout?.visibility ?? "visible";
const visibility = () => mock.getLayer("terrain-diagnostic").layout.visibility;
const sourceEvent = { sourceId: "physical-land-regional" };
const settle = () => new Promise((resolve) => setTimeout(resolve, 330));
const detach = attachDiagnosticHillshade(mock);
assert.deepEqual(validateStyleMin(style), []);
const strength = { "global-hillshade-strength": 0.55, "local-hillshade-strength": 0.25 };
const expression = createPropertyExpression(mock.getLayer("terrain-diagnostic").paint["hillshade-exaggeration"],
  "hillshade-exaggeration", latest.paint_hillshade["hillshade-exaggeration"], strength);
assert.equal(expression.result, "success");
const intensity = (zoom) => expression.value.evaluate({ zoom });
for (const zoom of [0, 1.3, 3.5, 4]) assert.equal(intensity(zoom), 0.55);
for (const zoom of [6, 8, 12]) assert.equal(intensity(zoom), 0.25);
assert.ok(Math.abs(intensity(5) - 0.4) < 1e-6);
for (let zoom = 4.01; zoom <= 6; zoom += 0.01) {
  assert.ok(intensity(zoom) <= intensity(zoom - 0.01));
  assert.ok(Math.abs(intensity(zoom) - intensity(zoom - 0.01)) < 0.003);
}
strength["global-hillshade-strength"] = 0;
assert.equal(intensity(2), 0, "Debug global strength can disable orbital shading");
assert.equal(intensity(8), 0.25, "Global debug strength preserves local shading");

const order = style.layers.map(({ id }) => id);
for (const [below, above] of [["regional-land", "terrain-diagnostic"], ["terrain-diagnostic", "regional-ocean"], ["regional-ocean", "regional-coastline"], ["terrain-diagnostic", "lakes"]]) {
  assert.ok(order.indexOf(below) < order.indexOf(above), `${above} must cover ${below}`);
}
assert.equal(visibility(), "none", "Wait for an opaque ocean mask");
coarseLoaded = true;
handlers.get("sourcedata")({ sourceId: "hillshade-ocean" });
assert.equal(visibility(), "visible", "Native relief visible on globe at z2");
assert.equal(maskVisibility(), "visible");
assert.equal(mock.getLayer("terrain-diagnostic").minzoom, undefined);
coarseLoaded = false;
zoom = 11;
handlers.get("zoom")();
assert.equal(visibility(), "none", "Wait for geography loading and fade");
loaded = true;
detail = 0.5;
handlers.get("sourcedata")(sourceEvent);
await settle();
assert.equal(visibility(), "none", "Translucent ocean masks must never expose shading");
detail = 1;
handlers.get("sourcedata")(sourceEvent);
assert.equal(visibility(), "none", "Do not show through the 300 ms ocean fade");
await settle();
assert.equal(visibility(), "visible");
assert.equal(maskVisibility(), "none", "Detailed mask takes over only after its fade");
handlers.get("sourcedataloading")(sourceEvent);
assert.equal(visibility(), "none", "Hide immediately when new coast tiles load");
loaded = false;
handlers.get("sourcedata")(sourceEvent);
await settle();
assert.equal(visibility(), "none");
loaded = true;
handlers.get("sourcedata")(sourceEvent);
zoom = 5;
detail = 0.5;
handlers.get("zoom")();
await settle();
assert.equal(visibility(), "none", "Loading masks must hide shading");
coarseLoaded = true;
handlers.get("sourcedata")({ sourceId: "hillshade-ocean" });
assert.equal(visibility(), "visible", "Low zoom retains masked relief during coast blend");
assert.equal(maskVisibility(), "visible");
detach();
assert.equal(handlers.size, 0);
assert.equal(mock.getLayer("terrain-diagnostic"), undefined);
assert.equal(mock.getSource("elevation-diagnostic"), undefined);
assert.equal(mock.getLayer("hillshade-ocean-mask"), undefined);
assert.equal(mock.getSource("hillshade-ocean"), undefined);
assert.deepEqual(style.terrain, { source: "physical-elevation", exaggeration: 1 });
console.log("Hillshade ordering, global relief, opaque-mask handover, loading and cleanup valid.");

// Check the actual ocean masks at the requested coasts, independently of WebGL.
const { VectorTile } = await import(require.resolve("@mapbox/vector-tile"));
const { PbfReader } = await import(require.resolve("pbf"));
function contains(rings, x, y) {
  let inside = false;
  for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
for (const [region, land, sea] of [
  ["Spain / Biscay", [-2, 43], [-2, 43.7]],
  ["Corsica", [9, 42.3], [8.6, 42.3]],
  ["Greece / Crete", [24.9, 35.2], [24.9, 35.6]],
]) {
  for (const [point, expectOcean] of [[land, false], [sea, true]]) {
    const tx = (point[0] + 180) / 360 * 16;
    const ty = (1 - Math.asinh(Math.tan(point[1] * Math.PI / 180)) / Math.PI) / 2 * 16;
    const x = Math.floor(tx), y = Math.floor(ty);
    const tile = new VectorTile(new PbfReader(await readFile(new URL(`../public/geo/natural-earth-v5.1.2/land-10m/4/${x}/${y}.pbf`, import.meta.url))));
    const rings = [];
    for (let i = 0; i < tile.layers.ocean.length; i++) rings.push(...tile.layers.ocean.feature(i).loadGeometry());
    assert.equal(contains(rings, (tx - x) * 8192, (ty - y) * 8192), expectOcean, `${region}: mask must cover sea and preserve land`);
  }
  console.log(`${region}: ocean mask covers sea and leaves land exposed for hillshade.`);
}
assert.equal(style.layers.find(({ id }) => id === "regional-ocean").paint["fill-color"], "#0a1622");

// Every global tile must decode; mountain land and ocean remain complementary
// at each LOD, including both sides of the dateline and Mercator polar limits.
for (let z = 0; z <= 3; z++) {
  const tiles = new Map();
  for (let x = 0; x < 2 ** z; x++) for (let y = 0; y < 2 ** z; y++) {
    const tile = new VectorTile(new PbfReader(await readFile(new URL(
      `../public/geo/natural-earth-v5.1.2/ocean-50m/${z}/${x}/${y}.pbf`, import.meta.url))));
    assert.equal(tile.layers.ocean.extent, 8192);
    assert.equal(tile.layers.ocean.length, 1);
    tiles.set(`${x}/${y}`, tile.layers.ocean.feature(0).loadGeometry());
  }
  for (const [lng, lat, ocean] of [
    [8, 46, false], [-5, 31, false], [86, 28, false], [-70, -30, false],
    [9, 40, false], [40, -80, false], [18, 35, true], [-30, 30, true],
    [179.9, 0, true], [-179.9, 0, true], [0, 84, true],
  ]) {
    const tx = (lng + 180) / 360 * 2 ** z;
    const ty = (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z;
    assert.equal(contains(tiles.get(`${Math.floor(tx)}/${Math.floor(ty)}`),
      tx % 1 * 8192, ty % 1 * 8192), ocean, `Global ocean z${z}: ${lng},${lat}`);
  }
}
console.log("85 global mask tiles decode; four ranges, islands, oceans, dateline and polar samples valid.");

// Exercise the installed MapLibre 6 overzoom clipper and the renderer's ring
// classification/triangulation, rather than only querying geographic parity.
const pointModule = pathToFileURL(require.resolve("@mapbox/point-geometry")).href;
const clipModule = asModule((await compile("../node_modules/maplibre-gl/src/symbol/clip_line.ts"))
  .replaceAll("'@mapbox/point-geometry'", JSON.stringify(pointModule)));
const { sliceVectorTileLayer } = await import(asModule(
  (await compile("../node_modules/maplibre-gl/src/source/vector_tile_overzoomed.ts"))
    .replaceAll("'@mapbox/point-geometry'", JSON.stringify(pointModule))
    .replace("'../symbol/clip_line.ts'", JSON.stringify(clipModule))));
const { default: earcut, flatten } = await import(require.resolve("earcut"));
for (const [lng, lat, expectOcean] of [[12, 52, false], [8, 46, false], [18, 35, true], [-30, 30, true]]) {
  const tx = (lng + 180) / 360 * 32;
  const ty = (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * 32;
  const parent = { z: 3, x: Math.floor(tx / 4), y: Math.floor(ty / 4) };
  const target = { z: 5, x: Math.floor(tx), y: Math.floor(ty) };
  const tile = new VectorTile(new PbfReader(await readFile(new URL(
    `../public/geo/natural-earth-v5.1.2/ocean-50m/3/${parent.x}/${parent.y}.pbf`, import.meta.url))));
  const sliced = sliceVectorTileLayer(tile.layers.ocean, parent, target);
  let covered = false;
  for (let i = 0; i < sliced.length; i++) for (const polygon of classifyRings(sliced.feature(i).loadGeometry(), 500)) {
    const { vertices, holes, dimensions } = flatten(polygon.map(ring => ring.map(p => [p.x, p.y])));
    const indices = earcut(vertices, holes, dimensions);
    for (let j = 0; j < indices.length; j += 3) {
      const ring = indices.slice(j, j + 3).map(k => ({ x: vertices[k * 2], y: vertices[k * 2 + 1] }));
      covered ||= contains([ring], tx % 1 * 8192, ty % 1 * 8192);
    }
  }
  assert.equal(covered, expectOcean, `Rendered overzoom mask at ${lng},${lat}`);
}
console.log("Installed MapLibre overzoom + triangulation preserves Germany, Alps and ocean coverage at z5.");
