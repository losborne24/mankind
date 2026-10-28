// QA only: paste into the local app's DevTools. Close DevTools after invocation.
// Existing seven-plot layout: layer.previewRomanVariants(false).
// Original assets in the same layout: layer.previewRomanVariants('baseline').
// Full library + 3 repeats: layer.previewRomanVariants(true).
window.romanReview = {
  layer: () => window.__globe.map.getLayer('three-test-marker').implementation,
  fixture(mode = true) { this.layer().previewRomanVariants(mode); },
  capture(name, camera = {}) {
    const map = window.__globe.map;
    map.jumpTo({ center:[12.55,41.85], zoom:18.9, pitch:55, bearing:-25, ...camera });
    const capture = () => {
      if (map.getCanvas().width < window.outerWidth * devicePixelRatio - 64) {
        setTimeout(capture, 500); return;
      }
      map.once('render', () => {
        const a = document.createElement('a'); a.download = `${name}.png`;
        a.href = map.getCanvas().toDataURL('image/png'); a.click();
      });
      map.triggerRepaint();
    };
    setTimeout(capture, 5000);
  },
  benchmark(name) {
    const map = window.__globe.map, layer = this.layer();
    map.jumpTo({ center:[12.55,41.85],zoom:18.9,pitch:55,bearing:-25 });
    setTimeout(() => {
      let previous;
      const rows = [];
      const frame = () => {
        const now = performance.now(), render = layer.renderer.info.render;
        if (previous !== undefined) rows.push([now-previous, render.calls, render.triangles]);
        previous = now;
      };
      map.on('render', frame);
      map.easeTo({bearing:0,duration:2400,easing:t=>t});
      setTimeout(() => {
        map.off('render',frame);
        const quantile = (column, p) => rows.map(row=>row[column]).sort((a,b)=>a-b)[Math.floor(rows.length*p)];
        const result = {name,frames:rows.length,medianMs:quantile(0,.5),p95Ms:quantile(0,.95),
          medianCalls:quantile(1,.5),medianTriangles:quantile(2,.5),
          viewport:[map.getCanvas().width,map.getCanvas().height],
          camera:{center:[12.55,41.85],zoom:18.9,pitch:55,bearing:[-25,0],duration:2400},
          memory:layer.renderer.info.memory,rows};
        const a = document.createElement('a'); a.download = `${name}.json`;
        a.href=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));a.click();
        console.log('Roman benchmark',JSON.stringify({...result,rows:undefined}));
      },2500);
    },5000);
  },
};

// Six alternating matched samples. Keep the project tab visible and close DevTools.
window.romanReview.compare = async function () {
  const map = window.__globe.map, layer = this.layer(), results = [];
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  for (let run=0;run<6;run++) {
    const mode = run % 2 ? 'variants' : 'baseline';
    layer.previewRomanVariants(mode === 'baseline' ? 'baseline' : false);
    map.jumpTo({center:[12.55,41.85],zoom:18.9,pitch:55,bearing:-25});
    await pause(5000);
    let previous;
    const rows=[];
    const frame=()=>{
      const now=performance.now(), render=layer.renderer.info.render;
      if (previous !== undefined) rows.push([now-previous,render.calls,render.triangles,document.hidden]);
      previous=now;
    };
    map.on('render',frame);map.easeTo({bearing:0,duration:2400,easing:t=>t});
    await pause(2500);map.off('render',frame);
    const q=(column,p)=>rows.map(row=>row[column]).sort((a,b)=>a-b)[Math.floor(rows.length*p)];
    results.push({mode,run,frames:rows.length,medianMs:q(0,.5),p95Ms:q(0,.95),calls:q(1,.5),triangles:q(2,.5),
      hiddenFrames:rows.filter(row=>row[3]).length,viewport:[map.getCanvas().width,map.getCanvas().height],
      memory:{...layer.renderer.info.memory},rows});
  }
  const a=document.createElement('a');a.download='roman-variants-comparison.json';
  a.href=URL.createObjectURL(new Blob([JSON.stringify(results,null,2)],{type:'application/json'}));a.click();
  console.log('Roman comparison',JSON.stringify(results.map(result=>({...result,rows:undefined}))));
};
