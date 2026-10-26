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
const { validateStyleMin } = require("@maplibre/maplibre-gl-style-spec");
const style = createGlobeStyle();
assert.deepEqual(validateStyleMin(style), [], "MapLibre style must validate");
assert.equal(style.projection.type, "globe");
assert.ok(!style.terrain && !style.glyphs && !style.sprite);
assert.ok(!JSON.stringify(style).includes("demotiles"));
assert.ok(style.layers.every((layer) => layer.type !== "symbol" && !layer["source-layer"]));
assert.equal(style.layers.find(({ id }) => id === "coastline").source, "physical-land");
assert.equal(style.layers.find(({ id }) => id === "land").source, "physical-land");

let bytes = 0;
let compressed = 0;
for (const [id, source] of Object.entries(style.sources)) {
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
