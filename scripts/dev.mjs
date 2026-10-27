/** Run the app and its local biome tiles together, without extra dependencies. */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const metadataUrl = "http://127.0.0.1:8766/pnv-v4/tilejson.json";
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

if (await tilesReady()) {
  console.log("Using biome tile server already running on http://localhost:8766");
} else if (!stopping) {
  run("python3", ["scripts/biomes/serve.py"]);
  let ready = false;
  for (let attempt = 0; attempt < 50 && !stopping; attempt++) {
    if (await tilesReady()) { ready = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready && !stopping) {
    console.error("Biome tiles unavailable. Check .biome-data/tiles/pnv-v4/tilejson.json and port 8766.");
    stop(1);
  }
}

if (!stopping) {
  run(process.execPath, [require.resolve("next/dist/bin/next"), "dev", ...process.argv.slice(2)]);
}
