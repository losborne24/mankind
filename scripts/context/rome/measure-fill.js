// Browser QA for the Rome fill (Stage 3): frame time, draw calls and memory at the overview and close-up beats.
// Paste this file into the console right after a reload and call installGpuTally() before the map is created; start the journey,
// pause it, then run fillQA.run('label') (the close-up needs the two-temples beat visited once so its scene is loaded), and
// fillQA.settledHeap() at a view for the heap once garbage collection has caught up (performance.json in docs/previews/rome-fill).
// Frames are forced with map.redraw() and timed through gl.finish(), so the numbers hold even when the tab is in the background.
// A hidden pane gives no animation frames at all, so installGpuTally() also swaps requestAnimationFrame for a 16 ms timer, or the
// map never loads. Draw calls are counted on the shared WebGL context (MapLibre and the Three scene).
window.installGpuTally = () => {
  window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16); window.cancelAnimationFrame = id => clearTimeout(id);
  const P = WebGL2RenderingContext.prototype, sizes = new Map(), bound = new Map();
  window.gpuTally = { draws: 0, bytes: () => [...sizes.values()].reduce((a, b) => a + b, 0), textures: new Map(), textureBytes: () => [...window.gpuTally.textures.values()].reduce((a, b) => a + b, 0) };
  for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) { const f = P[name]; P[name] = function (...a) { window.gpuTally.draws++; return f.apply(this, a); }; }
  const bind = P.bindBuffer; P.bindBuffer = function (t, b) { bound.set(t, b); return bind.call(this, t, b); };
  const data = P.bufferData; P.bufferData = function (t, s, u) { const b = bound.get(t); if (b) sizes.set(b, typeof s === 'number' ? s : s?.byteLength ?? 0); return data.call(this, t, s, u); };
  const del = P.deleteBuffer; P.deleteBuffer = function (b) { sizes.delete(b); return del.call(this, b); };
  const tex = new Map(), bindTex = P.bindTexture; P.bindTexture = function (t, x) { tex.set(t, x); return bindTex.call(this, t, x); };
  const img = P.texImage2D; P.texImage2D = function (...a) { const x = tex.get(a[0]); if (x && a[1] === 0) { const w = a.length >= 9 ? a[3] : a[5]?.width ?? 0, h = a.length >= 9 ? a[4] : a[5]?.height ?? 0; window.gpuTally.textures.set(x, w * h * 4); } return img.apply(this, a); };
  const delTex = P.deleteTexture; P.deleteTexture = function (x) { window.gpuTally.textures.delete(x); return delTex.call(this, x); };
};
window.fillQA = {
  results: [],
  pause: ms => new Promise(r => setTimeout(r, ms)),
  /** Drives the map (camera flights, tile loads, the local scene) with forced redraws until it settles or `ms` runs out. */
  async pump(ms) { const map = window.__globe.map, end = performance.now() + ms; while (performance.now() < end) { map.redraw(); await this.pause(40); } },
  async settle(ms = 60000) { const map = window.__globe.map, end = performance.now() + ms; while (performance.now() < end) { map.redraw(); await this.pause(60); if (!map.isMoving() && map.areTilesLoaded()) { await this.pump(1500); if (map.areTilesLoaded()) return true; } } return false; },
  frames(n = 40) {
    const map = window.__globe.map, gl = map.painter.context.gl, rows = [];
    for (let i = 0; i < n; i++) { const d0 = window.gpuTally?.draws ?? 0, t0 = performance.now(); map.redraw(); gl.finish(); rows.push([performance.now() - t0, (window.gpuTally?.draws ?? 0) - d0]); }
    const q = (c, p) => rows.map(r => r[c]).sort((a, b) => a - b)[Math.floor(rows.length * p)];
    return { medianMs: +q(0, .5).toFixed(2), p95Ms: +q(0, .95).toFixed(2), drawCalls: q(1, .5) };
  },
  async measure(label, camera, waitForLocal) {
    const map = window.__globe.map, layer = map.getLayer('three-test-marker').implementation;
    map.jumpTo(camera);
    const settled = await this.settle();
    if (waitForLocal) { for (let i = 0; i < 400 && !(layer.settlement?.urban && layer.groundFadeShown >= 1); i++) { map.redraw(); await this.pause(100); } await this.settle(20000); }
    const frame = this.frames();
    const style = map.style, fill = style.sourceCaches?.['rome-fill'] ?? style.tileManagers?.['rome-fill'];
    const result = { label, settled, viewport: [map.getCanvas().width, map.getCanvas().height], ...frame, jsHeapMB: +(performance.memory.usedJSHeapSize / 2 ** 20).toFixed(1),
      gpuBufferMB: window.gpuTally ? +(window.gpuTally.bytes() / 2 ** 20).toFixed(1) : null, gpuTextureMB: window.gpuTally ? +(window.gpuTally.textureBytes() / 2 ** 20).toFixed(1) : null,
      three: { ...layer.renderer.info.memory, calls: layer.renderer.info.render.calls }, localScene: !!layer.settlement?.urban, fillTiles: fill ? Object.keys(fill._tiles ?? {}).length : 0 };
    this.results.push(result); console.log('FILL_QA ' + JSON.stringify(result)); return result;
  },
  /** The main-thread heap once it stops changing between readings 8 s apart. */
  async settledHeap() { let last = 0; for (let i = 0; i < 10; i++) { await this.pause(8000); const now = +(performance.memory.usedJSHeapSize / 2 ** 20).toFixed(1); if (now === last) return now; last = now; } return last; },
  async run(tag) {
    const forum = [12.4808935, 41.888853], pair = [12.48082325, 41.889033274];
    await this.measure(`${tag} overview`, { center: forum, zoom: 14.7, pitch: 40, bearing: 200 }, false);
    await this.measure(`${tag} regional`, { center: [12.485, 41.893], zoom: 12.6, pitch: 30, bearing: 0 }, false);
    await this.measure(`${tag} close-up`, { center: pair, zoom: 18.3, pitch: 58, bearing: 165 }, true);
    return this.results;
  },
};
