// QA only. Paste into the local app console, run proceduralQA.run(), then close
// DevTools within 5 seconds. Uses the existing matched camera/orbit methodology.
// Logs one JSON record per run; no production hooks or renderer changes.
window.proceduralQA = {
  async run() {
    const map=window.__globe.map, layer=map.getLayer('three-test-marker').implementation;
    const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const results=[];
    await pause(5000);
    for(const seed of ['reference',7,42,2026,7,42,2026]) {
      const started=performance.now();
      if(seed==='reference') layer.previewRomanVariants(false);
      else layer.visitProceduralSettlement(seed);
      map.jumpTo({center:[12.55,41.85],zoom:18.9,pitch:55,bearing:-25});
      let loadMs;
      for(let i=0;i<300;i++) {
        await pause(100);
        const scene=layer.settlement;
        if(scene && scene.loaded===scene.definition.buildings.length && scene.entries.every(e=>e.heights) && scene.scenery.loaded===scene.environment?.scenery.length) {loadMs=performance.now()-started;break;}
        if(layer.committedProcedural?.state==='unsuitable') break;
      }
      if(loadMs===undefined) throw new Error(`Scene did not become ready: ${seed}`);
      await pause(3500);
      let previous; const rows=[];
      const frame=()=>{const now=performance.now(),r=layer.renderer.info.render;if(previous!==undefined)rows.push([now-previous,r.calls,r.triangles,document.hidden]);previous=now;};
      map.on('render',frame);
      map.easeTo({bearing:0,duration:2400,easing:t=>t});
      await pause(2500);map.off('render',frame);
      const q=(column,p)=>rows.map(r=>r[column]).sort((a,b)=>a-b)[Math.floor(rows.length*p)];
      const result={seed,loadMs,frames:rows.length,medianMs:q(0,.5),p95Ms:q(0,.95),calls:q(1,.5),triangles:q(2,.5),
        hiddenFrames:rows.filter(r=>r[3]).length,viewport:[map.getCanvas().width,map.getCanvas().height],memory:{...layer.renderer.info.memory},
        buildings:layer.settlement.loaded,scenery:layer.settlement.scenery.loaded,
        generation:layer.committedProcedural?{state:layer.committedProcedural.state,accepted:layer.committedProcedural.accepted,rejected:layer.committedProcedural.rejected}:null,rows};
      results.push(result);console.log('PROCEDURAL_QA '+JSON.stringify(result));
    }
    layer.setSettlementEnabled(false);map.triggerRepaint();await pause(500);
    console.log('PROCEDURAL_QA_UNLOADED '+JSON.stringify({...layer.renderer.info.memory}));
    window.proceduralQA.results=results;
    return results;
  },
};

window.proceduralQA.sites = async function () {
  const map=window.__globe.map,layer=map.getLayer('three-test-marker').implementation;
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),results=[];
  await pause(5000);
  for(const [label,origin,exaggeration] of [
    ['nearby Rome',[12.5515,41.851],1],
    ['Tivoli hillside',[12.8,41.96],1],
    ['Alpine slope',[7.75,45.98],1],
    ['Rome exaggerated',[12.55,41.85],2],
    ['Rome restored',[12.55,41.85],1],
  ]) {
    map.setTerrain({...map.getTerrain(),exaggeration});
    layer.visitProceduralSettlement(2026,origin);
    map.jumpTo({center:origin,zoom:18.4,pitch:55,bearing:-25});
    await pause(6000);
    const r=layer.committedProcedural;
    results.push({label,origin,exaggeration,state:r?.state,accepted:r?.accepted,rejected:r?.rejected,terrainReady:r?.terrainReady,message:r?.message,
      rendered:layer.settlement?.loaded??0,steepHidden:layer.settlement?.steepSites??0,
      terrainSpanMeters:[[-.0003,-.0003],[.0003,-.0003],[-.0003,.0003],[.0003,.0003]].map(([x,y])=>map.queryTerrainElevation([origin[0]+x,origin[1]+y]))});
    console.log('PROCEDURAL_SITE '+JSON.stringify(results.at(-1)));
  }
  return results;
};
