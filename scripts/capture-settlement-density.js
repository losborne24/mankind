// Local DevTools QA, extending capture-procedural-settlements.js's matched orbit.
// Paste into the local app console. Start densityQA.run(), then close DevTools.
window.densityQA = {
  results: [],
  async show(profile='village',seed=7,elevated=false) {
    const map=window.__globe.map,layer=map.getLayer('three-test-marker').implementation;
    if(profile==='reference') layer.previewRomanVariants(false);
    else layer.visitProceduralSettlement(seed,undefined,profile==='benchmark'?undefined:{profile});
    map.jumpTo({center:[12.55,41.85],zoom:elevated?18.1:18.9,pitch:elevated?30:55,bearing:-25});
  },
  async run() {
    const map=window.__globe.map,layer=map.getLayer('three-test-marker').implementation;
    const pause=ms=>new Promise(r=>setTimeout(r,ms));
    await pause(5000);
    for(const [profile,seed] of [['reference',7],['benchmark',7],['hamlet',7],['village',7],['village',42],['small-town',7],['village',7]]) {
      const started=performance.now();await this.show(profile,seed);
      let ready=false;
      for(let i=0;i<300;i++) {
        await pause(100);const s=layer.settlement;
        if(s&&s.loaded===s.definition.buildings.length&&s.entries.every(e=>e.heights)&&s.scenery.loaded===s.environment?.scenery.length){ready=true;break;}
        if(layer.committedProcedural?.state==='unsuitable')break;
      }
      if(!ready)throw Error('Scene failed: '+profile);
      const loadMs=performance.now()-started;
      await pause(1000);
      let prev;const rows=[];
      const frame=()=>{const now=performance.now(),r=layer.renderer.info.render;if(prev!==undefined)rows.push([now-prev,r.calls,r.triangles,document.hidden]);prev=now;};
      map.on('render',frame);map.easeTo({bearing:0,duration:2400,easing:t=>t});await pause(2500);map.off('render',frame);
      const q=(c,p)=>rows.map(r=>r[c]).sort((a,b)=>a-b)[Math.floor(rows.length*p)];
      const r=layer.committedProcedural,s=layer.settlement;
      const result={profile,seed,loadMs,frames:rows.length,medianMs:q(0,.5),p95Ms:q(0,.95),calls:q(1,.5),triangles:q(2,.5),hiddenFrames:rows.filter(r=>r[3]).length,viewport:[map.getCanvas().width,map.getCanvas().height],memory:{...layer.renderer.info.memory},accepted:s.loaded,scenery:s.scenery.loaded,state:r?.state,requested:r?.requested,rejected:r?.rejected,attempts:r?.attempts,terrainSamples:r?.terrainSamples,nodes:r?.navigation.nodes.length,edges:r?.navigation.edges.length,ambient:{...s.ambientLife.status},rows};
      this.results.push(result);console.log('DENSITY_QA '+JSON.stringify(result));
    }
    layer.setSettlementEnabled(false);map.triggerRepaint();await pause(500);
    console.log('DENSITY_UNLOADED '+JSON.stringify(layer.renderer.info.memory));
    await this.show('village',7);
  },
};
