/** Run the app and its local biome tiles together, without extra dependencies. */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));

/** Next reads .env.local itself; this script runs outside it, so read the one key. */
function tileUrlFromEnvFile() {
  for (const name of [".env.local", ".env"]) {
    try {
      const match = readFileSync(new URL(`../${name}`, import.meta.url), "utf8")
        .match(/^\s*NEXT_PUBLIC_BIOME_TILE_URL\s*=\s*(.*)$/m);
      if (match) return match[1].trim().replace(/^["']|["']$/g, "");
    } catch {}
  }
  return undefined;
}

// Matches the development default in map/biomes.ts; override both with
// NEXT_PUBLIC_BIOME_TILE_URL to serve a different generated version.
const tileBase = process.env.NEXT_PUBLIC_BIOME_TILE_URL ?? tileUrlFromEnvFile() ??
  "http://localhost:8766/pnv-v4-global";
// A remote pyramid needs no local server; only localhost bases are served here.
const local = /^https?:\/\/(localhost|127\.0\.0\.1)\b/.test(tileBase);
const metadataUrl = `${tileBase.replace(/\/$/, "").replace("//localhost", "//127.0.0.1")}/tilejson.json`;
const children = new Set();
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
}

function run(command, args) {
  const child = spawn(command, args, { cwd: root, stdio: "inherit" });
  children.add(child);
  child.on("error", (error) => {
    console.error(error.message);
    children.delete(child);
    stop(1);
  });
  child.on("exit", (code, signal) => {
    children.delete(child);
    stop(code ?? (signal ? 1 : 0));
  });
  return child;
}

async function tilesReady() {
  try {
    const response = await fetch(metadataUrl, { signal: AbortSignal.timeout(500) });
    return response.ok && Array.isArray((await response.json()).bounds);
  } catch {
    return false;
  }
}

process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

if (!local) {
  console.log(`Using remote biome tiles at ${tileBase}`);
} else if (await tilesReady()) {
  console.log("Using biome tile server already running on http://localhost:8766");
} else if (!stopping) {
  run("python3", ["scripts/biomes/serve.py"]);
  let ready = false;
  for (let attempt = 0; attempt < 50 && !stopping; attempt++) {
    if (await tilesReady()) { ready = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready && !stopping) {
    console.error(`Biome tiles unavailable. Check ${metadataUrl} and port 8766.`);
    stop(1);
  }
}

if (!stopping) {
  run(process.execPath, [require.resolve("next/dist/bin/next"), "dev", ...process.argv.slice(2)]);
}
