// QA only. Paste into local app DevTools after selecting Visit settlement.
// Close DevTools while a capture/sample runs; keep the tab visible.
// groundQA.run('sample-name'); groundQA.views('review-name');
// Alternate original/final implementations with a fresh page load per sample.
// Do not compare different viewport sizes, origins, seeds or exaggerations.
window.groundQA = {
  save(name, value, type = 'application/json') {
    const link = document.createElement('a');
    const url = type === 'image/png' ? value : URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type }));
    link.download = name; link.href = url; link.click();
    if (type !== 'image/png') setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  async run(label) {
    const map = window.__globe.map;
    const layer = map.getLayer('three-test-marker').implementation;
    const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    await pause(6000);
    map.jumpTo({ center: [12.55, 41.85], zoom: 18.9, pitch: 55, bearing: -25 });
    await pause(3500);
    let previous;
    const rows = [];
    const frame = () => {
      const now = performance.now(), render = layer.renderer.info.render;
      if (previous !== undefined) rows.push([now - previous, render.calls, render.triangles, document.hidden]);
      previous = now;
    };
    map.on('render', frame);
    try {
      map.easeTo({ bearing: 0, duration: 2400, easing: (t) => t });
      await pause(2500);
    } finally { map.off('render', frame); }
    const q = (column, p) => rows.map((row) => row[column]).sort((a, b) => a - b)[Math.floor(rows.length * p)];
    this.save(`${label}.json`, { label, median: q(0, .5), p95: q(0, .95), calls: q(1, .5), triangles: q(2, .5),
      memory: { ...layer.renderer.info.memory }, viewport: [map.getCanvas().width, map.getCanvas().height], rows });
  },
  shot(name, camera = {}) {
    const map = window.__globe.map;
    map.jumpTo({ center: [12.55, 41.85], zoom: 20.5, pitch: 55, bearing: -25, ...camera });
    setTimeout(() => {
      map.once('render', () => this.save(`${name}.png`, map.getCanvas().toDataURL('image/png'), 'image/png'));
      map.triggerRepaint();
    }, 6500);
  },
  views(label) {
    this.shot(`${label}-overview`, { zoom: 18.9 });
    setTimeout(() => this.shot(`${label}-contact`), 14000);
    setTimeout(() => this.shot(`${label}-intersection`, { center: [12.55, 41.85004], zoom: 21.2 }), 28000);
    setTimeout(() => this.shot(`${label}-door`, { center: [12.54991, 41.85006], zoom: 21.4, bearing: -80 }), 42000);
    setTimeout(() => this.shot(`${label}-slope`, { bearing: 125, pitch: 65 }), 56000);
  },
};
