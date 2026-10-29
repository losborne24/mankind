// Local DevTools QA only: paste this file, run ambientQA.run(), close DevTools within 5s.
// Instruments the existing layer; creates no renderer and changes no production UI.
window.ambientQA = {
  results: [],
  async run() {
    const map=window.__globe.map,layer=map.getLayer('three-test-marker').implementation;
    const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    await pause(5000);
    for(const seed of [7,42,2026,7]) {
      layer.configureAmbientLife({enabled:true,count:3,paths:false});
      layer.visitProceduralSettlement(seed);
      map.jumpTo({center:[12.55,41.85],zoom:19.5,pitch:55,bearing:-25});
      for(let i=0;i<200;i++) {
        await pause(100);
        if(layer.settlement?.ambientLife.status.active===3&&layer.settlement?.loaded===8)break;
        if(i===199)throw new Error(`Seed ${seed} not ready`);
      }
      // Let view-dependent DEM refinement finish before measuring a stable scene.
      await pause(3500);
      const life=layer.settlement.ambientLife,original=life.update,rows=[],cpu=[];
      let last,walking=false,idle=false;
      const frame=()=>{
        const now=performance.now();if(last)rows.push(now-last);last=now;
        walking ||= life.status.walking>0;idle ||= life.status.idle>0;
      };
      life.update=function(...args){const t=performance.now();const value=original.apply(this,args);cpu.push(performance.now()-t);return value;};
      const before=life.simulation.villagers.map(v=>v.distance);
      map.on('render',frame);
      map.easeTo({bearing:0,duration:3000,easing:t=>t});await pause(4000);map.off('render',frame);life.update=original;
      const sorted=xs=>xs.slice().sort((a,b)=>a-b),q=(xs,p)=>sorted(xs)[Math.floor(xs.length*p)];
      const active={frames:rows.length,medianMs:q(rows,.5),p95Ms:q(rows,.95),lifeMedianCpuMs:q(cpu,.5),lifeP95CpuMs:q(cpu,.95),
        calls:layer.renderer.info.render.calls,triangles:layer.renderer.info.render.triangles,memory:{...layer.renderer.info.memory},sceneReplaced:layer.settlement.ambientLife!==life,walking,idle,
        moved:life.simulation.villagers.map((v,i)=>v.distance-before[i])};
      layer.configureAmbientLife({enabled:false,count:3,paths:false});await pause(1500);
      let frames=0;const count=()=>frames++;map.on('render',count);await pause(1500);map.off('render',count);
      const disabled={frames,calls:layer.renderer.info.render.calls,memory:{...layer.renderer.info.memory}};
      const result={seed,viewport:[map.getCanvas().width,map.getCanvas().height],active,disabled};
      this.results.push(result);console.log('AMBIENT_QA '+JSON.stringify(result));
    }
    layer.setSettlementEnabled(false);map.triggerRepaint();await pause(500);
    console.log('AMBIENT_QA_UNLOADED '+JSON.stringify(layer.renderer.info.memory));
    layer.configureAmbientLife({enabled:true,count:3,paths:false});layer.visitProceduralSettlement(7);
    map.jumpTo({center:[12.55,41.85],zoom:19.7,pitch:55,bearing:-25});
    return this.results;
  },
  async record() {
    const map=window.__globe.map,layer=map.getLayer('three-test-marker').implementation;
    await new Promise(r=>setTimeout(r,5000));
    layer.visitProceduralSettlement(7);map.jumpTo({center:[12.55,41.85],zoom:20,pitch:55,bearing:-25});
    await new Promise(r=>setTimeout(r,1500));
    const stream=map.getCanvas().captureStream(30),chunks=[];
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:4000000});
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    recorder.onstop=()=>{
      stream.getTracks().forEach(t=>t.stop());
      const url=URL.createObjectURL(new Blob(chunks,{type:'video/webm'}));
      const a=document.createElement('a');a.href=url;a.download='ambient-life-seed-7.webm';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
    };
    recorder.start();setTimeout(()=>recorder.stop(),12000);
  }
};
