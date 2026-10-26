/** Rebuild the vendored physical base. Node only; never runs in the browser/build. */
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";

const revision = "f1890d9f152c896d250a77557a5751a93d494776"; // v5.1.2
const hashes = {
  land: "e874b27a51d146452be360cafb3cc50c86001074a67d534113e6534682f9826b",
  lakes: "d350b75978b26fe839b797c2c529b2fb8f47fb3983c03f4964e36d5df9378a52",
  rivers_lake_centerlines: "f286e0ce978fde999ca2d7a78c764be08542e19b63cded52b05c12d5173ccc51",
};
const output = new URL("../public/geo/natural-earth-v5.1.2/", import.meta.url);
// Optional directory of ne_50m_*.geojson originals for an offline rebuild.
const inputDirectory = process.argv[2];
await mkdir(output, { recursive: true });

for (const dataset of ["land", "lakes", "rivers_lake_centerlines"]) {
  const filename = `ne_50m_${dataset}.geojson`;
  const url = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${revision}/geojson/${filename}`;
  let original;
  if (inputDirectory) {
    original = await readFile(`${inputDirectory}/${filename}`);
  } else {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    original = Buffer.from(await response.arrayBuffer());
  }
  assert.equal(createHash("sha256").update(original).digest("hex"), hashes[dataset], `${filename}: unexpected upstream bytes`);
  const collection = JSON.parse(original);
  const features = collection.features
    // Natural lakes only; omit modern reservoirs and redundant lake centerlines.
    .filter(({ properties }) => dataset === "land" ||
      (dataset === "lakes" ? properties.featurecla !== "Reservoir" : properties.featurecla === "River"))
    .map(({ geometry, properties }) => ({
      type: "Feature",
      properties: dataset === "land" ? {} : {
        min_zoom: properties.min_zoom ?? 0,
      },
      geometry,
    }));
  const data = JSON.stringify({ type: "FeatureCollection", features }) + "\n";
  await writeFile(new URL(filename, output), data);
  console.log(`${filename}: ${features.length} features, ${Buffer.byteLength(data)} bytes; upstream sha256 ${createHash("sha256").update(original).digest("hex")}`);
}
