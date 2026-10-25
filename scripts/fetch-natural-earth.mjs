// @ts-check
/**
 * Reproducible fetch of the globe's geographic foundation: Natural Earth
 * *physical* land polygons, self-hosted as bundled GeoJSON.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The globe must render real landmasses, coastlines and islands without a
 * runtime dependency on any external or paid tile service. This script pulls a
 * pinned, public-domain copy of Natural Earth's physical `land` theme at the two
 * scales the globe uses (1:50 m global + 1:10 m regional) and writes compact
 * GeoJSON into `public/geo/`, which Next.js serves as static assets from our own
 * origin. Run it only when refreshing the data:
 *
 *     node scripts/fetch-natural-earth.mjs
 *
 * The output files are committed, so a normal `pnpm install && pnpm build`
 * never touches the network.
 *
 * DATA PROVENANCE / LICENSE  (see public/geo/PROVENANCE.md for the full note)
 * ──────────────────────────────────────────────────────────────────────────
 *   • Underlying data: Natural Earth (https://www.naturalearthdata.com/),
 *     released into the PUBLIC DOMAIN. No permission, no attribution, and no
 *     redistribution restriction. We attribute by courtesy only.
 *   • Source of the GeoJSON conversion: martynafford/natural-earth-geojson,
 *     pinned to the commit below (conversion scripts are MIT; the data they
 *     emit remains Natural Earth public domain).
 *   • We intentionally take only PHYSICAL themes (land → coastline/islands).
 *     No political boundaries are fetched: the historical globe must not show
 *     modern borders as a default.
 */

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Pinned mirror commit — bump deliberately, never float on a branch. */
const MIRROR_COMMIT = "0b9a6ceb0a7032713abd9460ac1e995a9c60cd1e";
const MIRROR_BASE = `https://raw.githubusercontent.com/martynafford/natural-earth-geojson/${MIRROR_COMMIT}`;

/**
 * The land theme at the two scales the globe uses (global + regional). Each
 * Natural Earth `land` polygon set already includes major islands; we derive
 * the coastline by stroking the land outline in the style, so no separate
 * coastline/ocean download is needed.
 *
 * 1:10 m is large (~16 MB compact, ~5.0 MB gzip) but is fetched lazily and only
 * once per session (see map/regionalGeo.ts), then browser-cached — a user who
 * stays at a continental view never downloads it. See PROVENANCE.md for the
 * cost analysis and the vector-tile (PMTiles) upgrade path for close-up
 * fidelity beyond a single whole-planet GeoJSON.
 */
const DATASETS = [
  {
    out: "ne_50m_land.json",
    url: `${MIRROR_BASE}/50m/physical/ne_50m_land.json`,
    scale: "1:50m",
    note: "global view",
  },
  {
    out: "ne_10m_land.json",
    url: `${MIRROR_BASE}/10m/physical/ne_10m_land.json`,
    scale: "1:10m",
    note: "regional view",
  },
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "geo");

/** Drop per-feature properties: the globe renders geometry only. */
function stripProperties(geojson) {
  for (const f of geojson.features) f.properties = {};
  return geojson;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const manifest = [];

  for (const ds of DATASETS) {
    process.stdout.write(`Fetching ${ds.scale} land … `);
    const res = await fetch(ds.url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${ds.url}`);
    const source = await res.text();

    const compact = JSON.stringify(stripProperties(JSON.parse(source)));
    const outPath = join(OUT_DIR, ds.out);
    await writeFile(outPath, compact);

    const bytes = Buffer.byteLength(compact);
    const sha256 = createHash("sha256").update(compact).digest("hex");
    console.log(`${(bytes / 1024).toFixed(0)} KB`);

    manifest.push({ ...ds, bytes, sha256 });
  }

  const summary = manifest
    .map(
      (m) =>
        `  ${m.out.padEnd(20)} ${m.scale.padEnd(8)} ${(m.bytes / 1024)
          .toFixed(0)
          .padStart(6)} KB  sha256:${m.sha256.slice(0, 16)}…`,
    )
    .join("\n");
  console.log(`\nWrote ${manifest.length} file(s) to public/geo/:\n${summary}`);
  console.log(`\nMirror commit: ${MIRROR_COMMIT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
