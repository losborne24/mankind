// Paste into local DevTools, run streamingQA.run(), then close DevTools.
// All fixtures are fictional. Results are development-browser observations.
window.streamingQA = {
  results: [],
  async run() {
    const map=window.__globe.map,layer=map.getLayer('three-test-marker').implementation;
    const pause=ms=>new Promise(r=>setTimeout(r,ms));
    const check=(ok,message)=>{if(!ok)throw Error(message);};
    const record=(label,extra={})=>{
      const result={label,...layer.getStreamingStatus(),memory:{...layer.renderer.info.memory},render:{...layer.renderer.info.render},hidden:document.hidden,viewport:[map.getCanvas().width,map.getCanvas().height],...extra};
      this.results.push(result);console.log('STREAM_QA '+JSON.stringify(result));return result;
    };
    const jump=async(center,zoom,pitch=40)=>{map.jumpTo({center,zoom,pitch,bearing:-25});await pause(500);};
    const ready=async()=>{for(let i=0;i<300;i++){await pause(100);if(layer.settlement?.timing.stage==='ready')return;}throw Error('Scene timeout '+JSON.stringify(layer.getStreamingStatus()));};
    await pause(2500);
    layer.setSettlementLOD('auto');layer.useDevelopmentSettlements();
    await jump([12.57,41.85],3,0);const global=record('global');check(global.detailedScenes===0,'Global detail leak');
    const requests=global.cache.requests;
    await jump([12.55,41.85],14);const regional=record('regional');check(regional.lod==='regional'&&regional.detailedScenes===0&&regional.cache.requests===requests,'Regional must avoid GLBs');
    for(const [profile,origin] of [['hamlet',[12.55,41.85]],['village',[12.57,41.85]],['town',[12.59,41.85]],['hamlet-return',[12.55,41.85]]]) {
      const started=performance.now();await jump(origin,18.4,55);await ready();const loadMs=performance.now()-started;
      await pause(400);const frames=[];let previous;
      const frame=()=>{const now=performance.now();if(previous)frames.push(now-previous);previous=now;};
      map.on('render',frame);map.easeTo({bearing:0,duration:1200,easing:t=>t});await pause(1400);map.off('render',frame);frames.sort((a,b)=>a-b);
      record(profile,{loadMs,buildings:layer.settlement.loaded,scenery:layer.settlement.scenery.loaded,medianFrameMs:frames[Math.floor(frames.length*.5)],p95FrameMs:frames[Math.floor(frames.length*.95)],frames:frames.length,ambient:{...layer.settlement.ambientLife.status}});
      await jump(origin,14);const left=record(profile+'-left');check(left.detailedScenes===0&&left.cache.users===0,'Unreleased leases');
    }
    // Jump away during queued loading, then rapidly cross all fixtures.
    for(const center of [[12.55,41.85],[12.59,41.85],[12.57,41.85]]) {map.jumpTo({center,zoom:18.4});await pause(50);}
    await jump([0,0],3,0);await pause(1000);const rapid=record('rapid-global');check(rapid.detailedScenes===0&&rapid.cache.users===0,'Stale rapid-travel scene');
    let frames=0;const frame=()=>frames++;map.on('render',frame);await pause(1200);map.off('render',frame);record('idle-global',{frames});
    await jump([12.59,41.85],18.4,55);await ready();record('final-town');
    console.log('STREAM_QA_DONE '+this.results.length);
  },
  export() {
    const link=document.createElement('a');
    link.href=URL.createObjectURL(new Blob([JSON.stringify({note:'Visible development-browser observations; not production benchmarks.',results:this.results},null,2)],{type:'application/json'}));
    link.download='mankind-streaming-browser.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  }
};

// Optional reference/regression tour after the main run; then streamingQA.export().
window.streamingQA.referenceRegression = async function() {
  const map=window.__globe.map,layer=map.getLayer('three-test-marker').implementation;
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const record=(label,extra={})=>{const row={label,...layer.getStreamingStatus(),...extra};this.results.push(row);console.log('STREAM_REFERENCE '+JSON.stringify(row));};
  const ready=async()=>{for(let i=0;i<300;i++){await pause(100);if(layer.settlement?.timing.stage==='ready')return;}throw Error('Reference scene timeout');};
  layer.setSettlementLOD('auto');layer.visitSettlement();map.jumpTo({center:[12.55,41.85],zoom:18.4,pitch:55});await ready();
  record('authored',{buildings:layer.settlement.loaded});
  map.setTerrain({...map.getTerrain(),exaggeration:2});await pause(800);record('authored-2x',{terrainPending:layer.settlement.terrainPending});
  map.setTerrain({...map.getTerrain(),exaggeration:1});await pause(500);
  layer.visitSettlement([12.5515,41.851]);map.jumpTo({center:[12.5515,41.851],zoom:18.4});await ready();record('authored-relocated',{buildings:layer.settlement.loaded});
  map.jumpTo({center:[31.138,29.9795],zoom:18.4});
  for(let i=0;i<200&&layer.romanStatus.state!=='ready';i++)await pause(100);
  if(layer.romanStatus.state!=='ready')throw Error('Giza fixture failed');
  record('giza',{romanStatus:layer.romanStatus,romanInstances:layer.romans.length});
  map.jumpTo({center:[0,0],zoom:3,pitch:0});await pause(800);
  if(layer.romans.length||layer.getStreamingStatus().cache.users)throw Error('Giza live leases survived departure');
  record('giza-left',{romanInstances:layer.romans.length});layer.useDevelopmentSettlements();
};
