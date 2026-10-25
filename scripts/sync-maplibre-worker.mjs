/**
 * Copy MapLibre's web worker into `public/` so it can be served as a static,
 * same-origin asset.
 *
 * Why this is needed: MapLibre GL JS resolves its worker URL from its own
 * `import.meta.url` using a *runtime-computed* filename (`./${devOrProd}.mjs`).
 * Turbopack (and other bundlers) cannot statically analyze that dynamic path,
 * so the worker chunk is never emitted and the map fails with "Worker failed to
 * load". We instead copy the self-contained worker here and point MapLibre at
 * it via `setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')` in GlobeView.
 *
 * Runs on `predev` / `prebuild`, so the copy always matches the installed
 * maplibre-gl version (no drift).
 */
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Resolve the worker from the installed package (robust to pnpm's layout).
const pkgJson = require.resolve("maplibre-gl/package.json");
const workerSrc = join(dirname(pkgJson), "dist", "maplibre-gl-worker.mjs");
const destDir = join(root, "public", "maplibre");
const dest = join(destDir, "maplibre-gl-worker.mjs");

await mkdir(destDir, { recursive: true });
await copyFile(workerSrc, dest);
console.log(`[sync-maplibre-worker] copied worker → public/maplibre/maplibre-gl-worker.mjs`);
