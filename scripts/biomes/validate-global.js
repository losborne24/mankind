// QA only, not imported by the application. Paste into the local app's DevTools
// console after load, or run it through an automation driver.
//
// Measures what the globe actually does with the global biome pyramid: tile
// requests, transfer bytes, load timing, frame intervals and heap usage at a
// fixed set of camera positions. Reports real Resource Timing entries rather
// than estimates.

window.GLOBE_VIEWS = {
  global: { center: [10, 20], zoom: 1.3, pitch: 0, bearing: 0 },
  europe: { center: [8, 45], zoom: 4.3, pitch: 15, bearing: 0 },
  mediterranean: { center: [8, 37], zoom: 4.3, pitch: 15, bearing: 0 },
  sahara: { center: [10, 23], zoom: 4.5, pitch: 15, bearing: 0 },
  amazon: { center: [-60, -3], zoom: 4.5, pitch: 15, bearing: 0 },
  centralAsia: { center: [65, 45], zoom: 4.2, pitch: 15, bearing: 0 },
  himalayas: { center: [86.9, 28], zoom: 7.8, pitch: 40, bearing: 0 },
  alps: { center: [7.6, 46], zoom: 7.8, pitch: 40, bearing: 0 },
  australia: { center: [134, -25], zoom: 4, pitch: 15, bearing: 0 },
  greenland: { center: [-42, 72], zoom: 3.6, pitch: 0, bearing: 0 },
  antarctica: { center: [0, -72], zoom: 2.6, pitch: 0, bearing: 0 },
  dateline: { center: [180, 20], zoom: 3, pitch: 0, bearing: 0 },
  datelineNorth: { center: [-179, 65], zoom: 6, pitch: 20, bearing: 0 },
  fiji: { center: [179, -17], zoom: 6, pitch: 0, bearing: 0 },
};

const map = () => window.__globe.map;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Wait for idle plus the existing 300 ms coast gate and raster/paint fades. */
async function settle(extra = 1200) {
  await new Promise((resolve) => {
    if (map().loaded() && !map().isMoving()) return resolve();
    map().once("idle", resolve);
    map().triggerRepaint();
  });
  await sleep(extra);
}

function biomeRequests(since = 0) {
  const base = map().getSource("natural-biomes")?.serialize().tiles?.[0] ?? "";
  const prefix = base.slice(0, base.indexOf("{"));
  return performance
    .getEntriesByType("resource")
    .filter((entry) => entry.startTime >= since && entry.name.startsWith(prefix) && !entry.name.endsWith(".json"));
}

/** Frame intervals over N animation frames, with the camera held still. */
async function frames(count = 120) {
  const samples = [];
  let last = performance.now();
  await new Promise((resolve) => {
    const tick = () => {
      const now = performance.now();
      samples.push(now - last);
      last = now;
      if (samples.length >= count) return resolve();
      map().triggerRepaint();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  samples.sort((a, b) => a - b);
  return {
    median: +samples[Math.floor(count / 2)].toFixed(2),
    p95: +samples[Math.floor(count * 0.95)].toFixed(2),
    mean: +(samples.reduce((a, b) => a + b, 0) / count).toFixed(2),
  };
}

/**
 * Load one view as a genuine cold load.
 *
 * Two things make naive measurement read zero. MapLibre keeps its own tile
 * cache, so revisiting a view issues no requests at all; and the HTTP cache
 * serves repeats. A fresh query token on the tile template invalidates both, so
 * what is counted is exactly the tiles this viewport needs.
 *
 * The tile server must send `Timing-Allow-Origin`, or a cross-origin tile
 * reports transferSize 0 and the byte totals are meaningless.
 */
window.measureView = async (name, options = {}) => {
  const camera = window.GLOBE_VIEWS[name] ?? options.camera;
  const source = map().getSource("natural-biomes");
  window.__baseTiles ??= source.serialize().tiles[0];
  map().jumpTo(camera);
  await settle(400);
  if (options.cold !== false) source.setTiles([`${window.__baseTiles}?cold=${Date.now()}`]);
  performance.clearResourceTimings();
  const start = performance.now();
  await settle(options.extra ?? 1400);
  const requests = biomeRequests();
  let bytes = 0, empty = 0, biggest = 0, slowest = 0;
  for (const entry of requests) {
    const size = entry.encodedBodySize || 0;
    bytes += size;
    if (size === 0) empty += 1;
    if (size > biggest) biggest = size;
    if (entry.duration > slowest) slowest = entry.duration;
  }
  const result = {
    view: name,
    zoom: +map().getZoom().toFixed(2),
    center: [+map().getCenter().lng.toFixed(2), +map().getCenter().lat.toFixed(2)],
    settleMs: Math.round(performance.now() - start),
    biomeTileRequests: requests.length,
    emptyResponses: empty,
    transferBytes: bytes,
    largestTileBytes: biggest,
    slowestTileMs: +slowest.toFixed(1),
    heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
    terrainExaggeration: map().getTerrain()?.exaggeration ?? null,
  };
  console.log(JSON.stringify(result));
  return result;
};

/** Put the real tile template back after cold measurements. */
window.restoreTiles = () => {
  if (window.__baseTiles) map().getSource("natural-biomes").setTiles([window.__baseTiles]);
};

/** Requests caused purely by rotating, after the view is already warm. */
window.measureRotation = async (name, degrees = 60, steps = 30) => {
  await window.measureView(name);
  performance.clearResourceTimings();
  const started = performance.now();
  const from = map().getBearing();
  for (let step = 1; step <= steps; step++) {
    map().setBearing(from + (degrees * step) / steps);
    await sleep(16);
  }
  await settle(800);
  const requests = biomeRequests();
  const result = {
    view: name,
    rotatedDegrees: degrees,
    ms: Math.round(performance.now() - started),
    biomeTileRequests: requests.length,
    transferBytes: requests.reduce((t, e) => t + (e.transferSize || e.encodedBodySize || 0), 0),
    frames: await frames(120),
    heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
  };
  map().setBearing(from);
  console.log(JSON.stringify(result));
  return result;
};

/** Requests caused by zooming in from a global view to a regional one. */
window.measureZoom = async (name, toZoom = 8, steps = 24) => {
  await window.measureView(name);
  performance.clearResourceTimings();
  const started = performance.now();
  const from = map().getZoom();
  for (let step = 1; step <= steps; step++) {
    map().setZoom(from + ((toZoom - from) * step) / steps);
    await sleep(16);
  }
  await settle(1200);
  const requests = biomeRequests();
  const result = {
    view: name,
    zoomedFrom: +from.toFixed(2),
    zoomedTo: +map().getZoom().toFixed(2),
    ms: Math.round(performance.now() - started),
    biomeTileRequests: requests.length,
    transferBytes: requests.reduce((t, e) => t + (e.transferSize || e.encodedBodySize || 0), 0),
    heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
  };
  console.log(JSON.stringify(result));
  return result;
};

/**
 * Sample the rendered canvas, to confirm colour actually reached the globe.
 * The read must happen inside the render callback: the WebGL drawing buffer is
 * not preserved, so a later drawImage() returns a cleared, all-black surface.
 */
window.sampleCanvas = (points) =>
  new Promise((resolve) => {
    const canvas = map().getCanvas();
    map().once("render", () => {
      const scratch = document.createElement("canvas");
      scratch.width = canvas.width;
      scratch.height = canvas.height;
      const context = scratch.getContext("2d");
      context.drawImage(canvas, 0, 0);
      resolve(points.map(([lng, lat, label]) => {
        const point = map().project([lng, lat]);
        const x = Math.round(point.x * (canvas.width / canvas.clientWidth));
        const y = Math.round(point.y * (canvas.height / canvas.clientHeight));
        const inside = x >= 0 && y >= 0 && x < canvas.width && y < canvas.height;
        const [r, g, b] = inside ? context.getImageData(x, y, 1, 1).data : [null, null, null];
        return { label, lng, lat, inside, rgb: inside ? `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}` : null };
      }));
    });
    map().triggerRepaint();
  });

window.runGlobalValidation = async (names = Object.keys(window.GLOBE_VIEWS)) => {
  const results = [];
  for (const name of names) results.push(await window.measureView(name));
  console.table(results);
  return results;
};

console.log("Global biome QA helpers ready: measureView, measureRotation, measureZoom, sampleCanvas, runGlobalValidation.");
