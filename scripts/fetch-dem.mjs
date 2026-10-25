// @ts-check
/**
 * Reproducible fetch of the globe's ELEVATION foundation: a bounded, low-zoom
 * pyramid of Terrarium-encoded DEM tiles, self-hosted as bundled PNGs.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Phase 2 renders a *stylised* relief hillshade so the world reads like a
 * strategy-game terrain map rather than a GIS product. MapLibre's native
 * `hillshade` layer derives that shading from a `raster-dem` source at runtime,
 * which lets us tune sun angle, exaggeration and colour without baking anything.
 * It needs real elevation as its physical input.
 *
 * As with the Natural Earth land polygons (see scripts/fetch-natural-earth.mjs),
 * the elevation must render with **no runtime dependency on any external or paid
 * tile service**. This script pulls a *bounded* pyramid (z0…{@link MAX_ZOOM}) of
 * public-domain Terrarium DEM tiles once and writes them under
 * `public/geo/dem/{z}/{x}/{y}.png`, which Next.js serves as static assets from
 * our own origin. MapLibre then requests only the handful of tiles the current
 * viewport needs, and *overzooms* past {@link MAX_ZOOM} for closer views — which
 * is exactly what gives the hillshade its soft, painterly, non-noisy character.
 *
 *     node scripts/fetch-dem.mjs
 *
 * The output tiles are committed, so a normal `pnpm install && pnpm build`
 * never touches the network.
 *
 * WHY SO COARSE (z0…4)
 * ────────────────────
 * The terrain is deliberately *stylised*, not detailed. A coarse DEM (max native
 * ≈4096 px around the equator) overzoomed by MapLibre yields smooth, legible
 * landforms — lowlands, uplands and mountains separate cleanly — without the
 * harsh, noisy micro-relief of a full-resolution scientific hillshade. It also
 * keeps the bundled payload bounded (~tens of MB, in the same ballpark as the
 * 1:10 m land GeoJSON) and the runtime transfer tiny (only visible tiles load).
 *
 * DATA PROVENANCE / LICENSE  (see public/geo/dem/PROVENANCE.md for the full note)
 * ──────────────────────────────────────────────────────────────────────────
 *   • Source: the AWS "Terrain Tiles" open dataset (Terrarium PNG encoding),
 *     a public composite of SRTM, GMTED2010, ETOPO1, and other public-domain
 *     national DEMs. The composite is distributed as open data with attribution
 *     to the underlying sources; it carries no paid or per-request dependency.
 *   • Terrarium encoding: elevation(m) = (R*256 + G + B/256) - 32768.
 *
 * OCEAN IS CLAMPED TO SEA LEVEL
 * ─────────────────────────────
 * The raw tiles carry bathymetry (negative elevation under the sea). For 3D
 * terrain that is a problem: under vertical exaggeration the sea floor sinks
 * below the land, cutting a cliff at every shoreline that draped layers (the
 * coastline stroke especially) trace as ugly vertical walls. A stylised,
 * Civilization-like map wants flat water, so at fetch time we clamp every
 * below-sea-level pixel to exactly 0 m (Terrarium RGB 128,0,0). The result:
 * oceans are a flat plane, coastlines lie flat at the shore, and the land rises
 * cleanly out of the water. It also makes the 2D hillshade's ocean naturally
 * flat (no submarine shading). Land elevation is left untouched.
 */

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/** Pinned tile endpoint — the AWS Open Data Terrain Tiles mirror. */
const TILE_BASE = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";

/**
 * Deepest native zoom to bundle. MapLibre overzooms past this for closer views,
 * which produces the intended soft stylisation. Bump deliberately (each extra
 * level ~4× the tiles) — it trades repo weight for mountain detail at regional
 * zoom, not world-view quality.
 */
const MAX_ZOOM = 4;

/** Parallel request budget. Kept modest to stay polite to the open mirror. */
const CONCURRENCY = 24;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "geo", "dem");

/** Every (z,x,y) in the bounded pyramid, in a stable order. */
function* tileCoords() {
  for (let z = 0; z <= MAX_ZOOM; z++) {
    const n = 2 ** z;
    for (let x = 0; x < n; x++) {
      for (let y = 0; y < n; y++) yield { z, x, y };
    }
  }
}

/**
 * Clamp every below-sea-level pixel of a Terrarium tile to exactly 0 m so the
 * ocean becomes a flat plane under 3D terrain (see the header note). Terrarium
 * 0 m is RGB (128, 0, 0): (128*256 + 0 + 0/256) − 32768 = 0. Land is untouched.
 * Idempotent — re-clamping already-clamped tiles is a no-op.
 */
async function clampOceanToSeaLevel(buf) {
  const { data, info } = await sharp(buf)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels; // 3 (RGB) for these tiles
  for (let i = 0; i < data.length; i += ch) {
    // height = R*256 + G + B/256 − 32768 ; below sea level ⇔ R < 128
    // (R=128,G=0,B=0 is exactly 0 m; any R<128, or R==128 with G==B==0 already 0).
    const height = data[i] * 256 + data[i + 1] + data[i + 2] / 256 - 32768;
    if (height < 0) {
      data[i] = 128;
      data[i + 1] = 0;
      data[i + 2] = 0;
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: ch } })
    .png()
    .toBuffer();
}

/** Fetch one tile with a few retries; returns its bytes. */
async function fetchTile({ z, x, y }) {
  const url = `${TILE_BASE}/${z}/${x}/${y}.png`;
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
  }
  throw new Error(`Failed ${url}: ${lastErr}`);
}

/** Run `worker` over `items` with a fixed-size concurrency pool. */
async function pool(items, size, worker) {
  let i = 0;
  const runners = Array.from({ length: size }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

async function main() {
  const coords = [...tileCoords()];
  await mkdir(OUT_DIR, { recursive: true });

  let bytes = 0;
  let done = 0;
  const hash = createHash("sha256");

  // Hash in a deterministic order so the manifest checksum is reproducible,
  // regardless of the (concurrent) download order.
  const buffers = new Array(coords.length);

  await pool(coords, CONCURRENCY, async (c, idx) => {
    const raw = await fetchTile(c);
    const buf = await clampOceanToSeaLevel(raw);
    const dir = join(OUT_DIR, String(c.z), String(c.x));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${c.y}.png`), buf);
    buffers[idx] = buf;
    bytes += buf.byteLength;
    done++;
    if (done % 50 === 0 || done === coords.length) {
      process.stdout.write(
        `\r  ${done}/${coords.length} tiles  ${(bytes / 1024 / 1024).toFixed(1)} MB   `,
      );
    }
  });

  for (const buf of buffers) hash.update(buf);

  console.log(
    `\n\nWrote ${coords.length} DEM tiles (z0–${MAX_ZOOM}) to public/geo/dem/:` +
      `\n  total ${(bytes / 1024 / 1024).toFixed(1)} MB` +
      `\n  pyramid sha256:${hash.digest("hex").slice(0, 16)}…` +
      `\n  source: ${TILE_BASE}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
