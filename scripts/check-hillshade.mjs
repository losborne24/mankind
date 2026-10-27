import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
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
const { validateStyleMin } = require("@maplibre/maplibre-gl-style-spec");
const style = createGlobeStyle();
const handlers = new Map();
let zoom = 2, detail = 0, loaded = false;
const mock = {
  addSource: (id, source) => { style.sources[id] = source; },
  addLayer: (layer, before) => { style.layers.splice(style.layers.findIndex(({ id }) => id === before), 0, layer); },
  getLayer: (id) => style.layers.find((layer) => layer.id === id),
  getSource: (id) => style.sources[id],
  removeLayer: (id) => { style.layers = style.layers.filter((layer) => layer.id !== id); },
  removeSource: (id) => { delete style.sources[id]; },
  getZoom: () => zoom,
  getGlobalState: () => ({ "coast-detail": detail }),
  isSourceLoaded: () => loaded,
  setLayoutProperty: (id, name, value) => { mock.getLayer(id).layout[name] = value; },
  on: (name, handler) => handlers.set(name, handler),
  off: (name) => handlers.delete(name),
};
const visibility = () => mock.getLayer("terrain-diagnostic").layout.visibility;
const sourceEvent = { sourceId: "physical-land-regional" };
const settle = () => new Promise((resolve) => setTimeout(resolve, 330));
const detach = attachDiagnosticHillshade(mock);
assert.deepEqual(validateStyleMin(style), []);
const order = style.layers.map(({ id }) => id);
for (const [below, above] of [["regional-land", "terrain-diagnostic"], ["terrain-diagnostic", "regional-ocean"], ["regional-ocean", "regional-coastline"], ["terrain-diagnostic", "lakes"]]) {
  assert.ok(order.indexOf(below) < order.indexOf(above), `${above} must cover ${below}`);
}
assert.equal(visibility(), "none", "No unmasked global shading");
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
handlers.get("sourcedataloading")(sourceEvent);
assert.equal(visibility(), "none", "Hide immediately when new coast tiles load");
loaded = false;
handlers.get("sourcedata")(sourceEvent);
await settle();
assert.equal(visibility(), "none");
loaded = true;
handlers.get("sourcedata")(sourceEvent);
zoom = 5;
handlers.get("zoom")();
await settle();
assert.equal(visibility(), "none", "Zoom-out cancels pending shading");
detach();
assert.equal(handlers.size, 0);
assert.equal(mock.getLayer("terrain-diagnostic"), undefined);
assert.equal(mock.getSource("elevation-diagnostic"), undefined);
assert.deepEqual(style.terrain, { source: "physical-elevation", exaggeration: 1 });
console.log("Hillshade ordering, opaque-mask loading/fade gate, zoom-out and cleanup valid.");

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
