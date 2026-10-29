import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const modules=new Map();
async function load(path){if(modules.has(path))return modules.get(path);let {outputText}=ts.transpileModule(await readFile(`${path}.ts`,'utf8').catch(()=>readFile(`${path}.tsx`,'utf8')),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}});for(const match of [...outputText.matchAll(/from ['"]([^'"]+)['"]/g)]){const spec=match[1],url=spec.startsWith('@/')?await load(spec.slice(2)):import.meta.resolve(spec);outputText=outputText.replace(match[0],`from "${url}"`);}const url=`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;modules.set(path,url);return url;}
const {validateScenario}=await import(await load('lib/scenarios/schema'));
const {london2012:demo}=await import(await load('lib/scenarios/london2012'));
const {ScenarioPlayer}=await import(await load('lib/scenarios/player'));
const {directCamera,routePoint,distance,coordinateAt}=await import(await load('lib/scenarios/camera'));
const {attachScenarioInput,attachScenarioControls}=await import(await load('lib/scenarios/interruption'));
assert.equal(validateScenario(demo).version,1);
for(const mutate of [s=>s.version=2,s=>s.beats=[],s=>s.beats[0].actions[0].camera.type='unknown',s=>s.beats[0].actions[0].camera.transition='unknown',s=>s.beats[0].actions[0].camera.center=[181,0],s=>s.beats[0].actions[0].camera.pitch=66,s=>s.beats[0].actions[0].camera.center=[0,90],s=>s.beats[0].actions[0].camera.zoom=21,s=>s.beats[0].actions[0].camera.duration=Infinity,s=>s.beats[3].actions[0].camera.degrees=721,s=>s.beats[0].actions[0].camera.duration=0,s=>s.beats[0].actions[0].camera.duration=180001,s=>s.beats[0].actions[0].time={start:{year:2012,month:2,day:30}},s=>s.content.routes[0].coordinates=[[0,0]],s=>s.beats[0].actions[0].overlays=['missing'],s=>s.content.sources[0].url='javascript:alert(1)',s=>s.content.locations[0].coordinate=[NaN,0],s=>s.content.routes[0].certainty='verified']){const s=structuredClone(demo);mutate(s);assert.throws(()=>validateScenario(s));}
assert.throws(()=>validateScenario({...demo,callback:()=>{}}));
const unequal=[[0,0],[.001,0],[1,0]];assert.ok(Math.abs(routePoint(unequal,.5)[0]-.5)<1e-6);assert.ok(Math.abs(Math.abs(coordinateAt([179,0],[-179,0],.5)[0])-180)<1e-6);
assert.deepEqual(routePoint([[0,0],[0,0]],.5),[0,0]);
const start={center:[-.1,51.5],zoom:12,pitch:30,bearing:170};
const orbit=directCamera({type:'orbit',center:[0,51.5],zoom:15,pitch:50,degrees:180,duration:1000},start,demo);
for(let i=20;i<=100;i++)assert.deepEqual(orbit(i/100).center,[0,51.5]);assert.deepEqual(orbit(0),start);
const fly=directCamera({type:'flyTo',center:[0,52],zoom:15,pitch:50,bearing:-170,duration:1000},start,demo);assert.deepEqual(fly(0),start);
const cinematic=directCamera({type:'flyTo',center:[0,52],zoom:15,duration:1000,transition:'cinematic'},start,demo);assert.ok(cinematic(.5).zoom<fly(.5).zoom);
assert.ok(Math.abs(fly(.5).bearing-180)<1e-6);
// Zoom out at the origin, pan at a fixed scale, then zoom in at the destination.
const approachStart={center:[30,25],zoom:2.1,pitch:0,bearing:0};
const approachCommand=demo.beats[0].actions[0].camera;
assert.equal(approachCommand.transition,'zoomPanZoom');
const approach=directCamera(approachCommand,approachStart,demo);
assert.deepEqual(approach(0),approachStart);
for(const t of [0,.1,.2,.25])assert.deepEqual(approach(t).center,approachStart.center);
assert.ok(approach(.125).zoom<approachStart.zoom);
const cruiseZoom=approach(.25).zoom;
assert.ok(cruiseZoom<approachStart.zoom);
for(const t of [.25,.3,.4,.5,.6])assert.ok(Math.abs(approach(t).zoom-cruiseZoom)<1e-8);
assert.ok(distance(approach(.4).center,approachStart.center)>1000);
for(const t of [.6,.7,.8,1])assert.deepEqual(approach(t).center,approachCommand.center);
assert.ok(approach(.8).zoom>cruiseZoom);
assert.equal(approach(1).zoom,approachCommand.zoom);
assert.equal(approach(1).pitch,approachCommand.pitch);
for(const boundary of [.25,.6]){
 assert.ok(distance(approach(boundary-1e-9).center,approach(boundary).center)<.001);
 assert.ok(Math.abs(approach(boundary-1e-9).zoom-approach(boundary).zoom)<1e-6);
}
const localStart={center:[-.0754,51.5081],zoom:14.3,pitch:48,bearing:30};
const parkApproach=directCamera(demo.beats[2].actions[0].camera,localStart,demo);
assert.ok(parkApproach(.25).zoom<localStart.zoom);
assert.deepEqual(parkApproach(.25).center,localStart.center);
assert.deepEqual(parkApproach(.6).center,[-.0166,51.5387]);

let pose=structuredClone(start),frames=new Map(),frameId=0,now=0,writes=0,time,overlay,travel;
const player=new ScenarioPlayer({camera:{read:()=>structuredClone(pose),write:p=>{pose=structuredClone(p);writes++;},stop:()=>{}},timeline:t=>{time=t;},overlays:ids=>{overlay=ids;},streaming:i=>{travel=i;},frame:cb=>{frames.set(++frameId,cb);return frameId;},cancelFrame:id=>frames.delete(id)});
const tick=(ms=100)=>{now+=ms;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(f=>f(now));assert.ok(frames.size<=1,'Only one animation scheduled');};
const run=ms=>{for(let i=0;i<ms/100;i++)tick();};
const transitions=[];const unsubscribe=player.subscribe(()=>transitions.push(player.snapshot.state));
player.load(demo);assert.equal(player.snapshot.state,'idle');player.play();assert.equal(time.start.month,7);assert.equal(travel.detail,'map');run(1000);const elapsed=player.snapshot.elapsed,saved=structuredClone(pose);player.pause('Mouse navigation');assert.equal(player.snapshot.state,'paused');assert.equal(frames.size,0);pose.center=[10,10];const free=structuredClone(pose);run(1000);assert.deepEqual(pose,free);
player.resume();run(500);player.pause('Scroll zoom');assert.equal(player.snapshot.elapsed,elapsed);assert.deepEqual(player.snapshot.savedPose,saved);pose.center=[20,20];player.resume();run(1900);assert.equal(player.snapshot.returning,false);assert.ok(distance(pose.center,saved.center)<.01);run(200);assert.ok(player.snapshot.elapsed>elapsed);
player.skip();assert.equal(player.snapshot.beat,1);player.jump(3);assert.equal(time.start.day,27);player.restart();assert.equal(player.snapshot.beat,0);assert.equal(time.start.day,undefined);player.stop();assert.equal(frames.size,0);assert.deepEqual(overlay,[]);const count=writes;run(1000);assert.equal(writes,count);
// Full sequencing including multiple timed actions, cleanup, map-port failure.
const short=structuredClone(demo);short.beats.forEach(b=>b.actions.forEach(a=>a.camera.duration=100));short.beats[0].actions.push({...short.beats[0].actions[0]});player.load(short);player.play();run(1000);assert.equal(player.snapshot.state,'completed');assert.equal(player.snapshot.progress,1);assert.equal(travel,null);assert.ok(transitions.includes('preparing'));assert.ok(transitions.includes('paused'));assert.ok(transitions.includes('completed'));unsubscribe();
player.restart();player.dispose();player.dispose();run(1000);assert.equal(frames.size,0);assert.equal(player.snapshot.state,'idle');player.play();assert.equal(frames.size,0);
const bad=new ScenarioPlayer({camera:{read:()=>{throw Error('Map removed');},write:()=>{},stop:()=>{}},timeline:()=>{},overlays:()=>{},frame:()=>0,cancelFrame:()=>{}});bad.load(demo);bad.play();assert.equal(bad.snapshot.state,'error');
// Real EventTarget exercises raw input detection; no programmatic move event listener.
const target=new EventTarget(),reasons=[];const detach=attachScenarioInput(target,r=>reasons.push(r));for(const type of ['pointerdown','wheel','keydown','movestart']){const e=new Event(type);Object.defineProperty(e,'pointerType',{value:'touch'});Object.defineProperty(e,'key',{value:'ArrowUp'});target.dispatchEvent(e);}assert.deepEqual(reasons,['Touch navigation','Scroll zoom','Keyboard navigation']);detach();target.dispatchEvent(new Event('wheel'));assert.equal(reasons.length,3);
console.log('Scenario: schema bounds/references/JSON, great-circle interpolation, route distance, orbit stability, sequential actions, pause/free exploration, repeated resume interruption, skip/restart/stop/disposal, one scheduler and input detection passed.');

const {useExplorationStore:store}=await import(await load('state/explorationStore'));
const {formatHistoricalDate}=await import(await load('lib/historicalDate'));
store.getState().play();store.getState().setHistoricalTime({start:{year:2012,month:7,day:27}});assert.equal(store.getState().isPlaying,false);assert.equal(store.getState().year,2012);store.getState().setYear(0);assert.equal(store.getState().historicalTime,null);assert.equal(formatHistoricalDate({year:0}),'1 BCE');store.getState().setHistoricalTime({start:{year:-100,month:1},end:{year:-99}});assert.equal(store.getState().year,-100);store.getState().advanceYear(1);assert.equal(store.getState().historicalTime,null);assert.equal(store.getState().year,-99);
console.log('Timeline: one store authority, exact date, intervals, BCE and manual year clearing passed.');

// Context-sensitive presentation uses the same player snapshot and date store.
const {scenarioMarkers,timelinePresentation}=await import(await load('lib/scenarios/progress'));
const markers=scenarioMarkers(demo);
assert.equal(demo.beats[0].id,'london');
assert.deepEqual(demo.beats[0].actions[0].camera.center,[-0.116,51.507]);
assert.deepEqual(markers.map(m=>m.duration),[5000,11000,6000,9000,2000]);
assert.deepEqual(markers.map(m=>m.start),[0,5000,16000,22000,31000]);
assert.equal(markers[1].duration,11000);
assert.equal(markers[2].position,16000/33000);
let contextPose=structuredClone(start),contextFrames=new Map(),contextId=0,contextNow=0;
const context=new ScenarioPlayer({camera:{read:()=>structuredClone(contextPose),write:p=>contextPose=structuredClone(p),stop:()=>{}},timeline:t=>store.getState().setHistoricalTime(t),overlays:()=>{},frame:cb=>{contextFrames.set(++contextId,cb);return contextId;},cancelFrame:id=>contextFrames.delete(id)});
const advance=()=>{contextNow+=100;const callbacks=[...contextFrames.values()];contextFrames.clear();callbacks.forEach(cb=>cb(contextNow));assert.ok(contextFrames.size<=1);};
context.load(demo);assert.equal(timelinePresentation(context.snapshot),'explore');
context.play();assert.equal(context.snapshot.state,'preparing');assert.equal(timelinePresentation(context.snapshot),'scenario');
advance();assert.equal(context.snapshot.state,'playing');advance();
context.pause('Map gesture');const savedProgress=context.snapshot.progress;const savedTime=context.snapshot.intendedTime;
assert.equal(timelinePresentation(context.snapshot),'scenario');assert.equal(contextFrames.size,0);
context.exploreFreely();assert.equal(timelinePresentation(context.snapshot),'explore');assert.equal(context.snapshot.suspendedForExploration,true);
store.getState().setYear(-500);assert.equal(store.getState().year,-500);assert.equal(context.snapshot.progress,savedProgress);
context.resume();assert.equal(timelinePresentation(context.snapshot),'scenario');assert.deepEqual(store.getState().historicalTime,savedTime);assert.equal(context.snapshot.progress,savedProgress);
context.pause('Map gesture during return');assert.equal(contextFrames.size,0);assert.equal(timelinePresentation(context.snapshot),'scenario');
context.jump(3);assert.equal(context.snapshot.totalElapsed,22000);assert.equal(context.snapshot.progress,22000/33000);assert.equal(store.getState().historicalTime.start.day,27);
context.jump(1);assert.equal(context.snapshot.totalElapsed,5000);assert.equal(store.getState().historicalTime.start.day,undefined);assert.equal(context.snapshot.beat,1);assert.equal(context.snapshot.action,0);assert.equal(context.snapshot.elapsed,0);
context.restart();assert.equal(context.snapshot.progress,0);assert.equal(context.snapshot.totalElapsed,0);assert.equal(context.snapshot.suspendedForExploration,false);
context.load(short);context.play();for(let i=0;i<10;i++)advance();assert.equal(context.snapshot.state,'completed');assert.equal(timelinePresentation(context.snapshot),'scenario');assert.equal(contextFrames.size,0);
const finalPose=structuredClone(contextPose),finalTime=store.getState().historicalTime;
context.exploreFreely();assert.equal(timelinePresentation(context.snapshot),'explore');assert.deepEqual(contextPose,finalPose);assert.equal(store.getState().historicalTime,finalTime);
context.restart();assert.equal(context.snapshot.progress,0);assert.equal(timelinePresentation(context.snapshot),'scenario');context.stop();assert.equal(timelinePresentation(context.snapshot),'explore');assert.equal(contextFrames.size,0);context.dispose();
console.log('Context timeline: duration markers, preparation/playing/pause/completion, gesture presentation, suspended exploration, independent BCE date changes, resume restoration, beat temporal context, replay, exit and single RAF passed.');

const {renderToStaticMarkup}=await import('react-dom/server');
const {createElement}=await import('react');
const {ScenarioTimeline}=await import(await load('components/ScenarioTimeline'));
const {Timeline}=await import(await load('components/Timeline'));
const exploreMarkup=renderToStaticMarkup(createElement(Timeline));
assert.equal(exploreMarkup,'','No bottom bar without an active or suspended scenario');
const ui=new ScenarioPlayer({camera:{read:()=>start,write:()=>{},stop:()=>{}},timeline:()=>{},overlays:()=>{},frame:()=>1,cancelFrame:()=>{}});ui.load(demo);
for(const [state,label] of [['preparing','Preparing journey…'],['playing','Playing'],['paused','Resume'],['completed','Replay journey']]) {
  const markup=renderToStaticMarkup(createElement(ScenarioTimeline,{player:ui,snapshot:{...ui.snapshot,state,beat:1,progress:5000/33000}}));
  assert.ok(markup.includes(label),`${state} renders ${label}`);
  assert.ok(markup.includes('An illustrative torch journey'));
  assert.ok(markup.includes('aria-valuenow="15"'));
  assert.ok(markup.includes('Go to beat 3: Journey to Olympic Park'));
  assert.ok(!markup.includes('type="range"'),'Journey indicator must not promise arbitrary scrubbing');
  assert.ok(!markup.includes('Playback speed'));
  if(state==='completed')assert.ok(markup.includes('Continue exploring'));
}
ui.dispose();
console.log('Timeline render: no idle historical controls, preparing/playing/paused/completed labels, duration-derived progress, named keyboard buttons, read-only continuous progress and completion actions passed.');

// Untrusted director payloads must fail before recursion or execution grows unbounded.
const cyclic=structuredClone(demo);cyclic.extra=cyclic;
assert.throws(()=>validateScenario(cyclic),/acyclic/);
const deep=structuredClone(demo);let nested=deep;for(let i=0;i<40;i++)nested=nested.extra={};
assert.throws(()=>validateScenario(deep),/complexity/);
const long=structuredClone(demo);long.beats[0].actions=Array.from({length:21},()=>({...long.beats[0].actions[0],camera:{type:'hold',duration:180000}}));
assert.throws(()=>validateScenario(long),/one hour/);
const many=structuredClone(demo);many.beats[0].actions=Array.from({length:1001},()=>({camera:{type:'hold',duration:100},overlays:[]}));
assert.throws(()=>validateScenario(many),/1000 actions/);
const alias=structuredClone(demo);alias.extra=alias.scope.time;assert.equal(validateScenario(alias).version,1,'Shared acyclic JSON is valid');

// Real controller + event routing: fixture selection releases all directed work;
// merely opening diagnostics must not pause playback. Also verify listener teardown.
let selectedControl='',controlWrites=0,controlFrames=new Map(),controlFrame=0;
const controlPlayer=new ScenarioPlayer({camera:{read:()=>structuredClone(start),write:()=>controlWrites++,stop:()=>{}},timeline:()=>{},overlays:()=>{},frame:cb=>{controlFrames.set(++controlFrame,cb);return controlFrame;},cancelFrame:id=>controlFrames.delete(id)});
const controls=new EventTarget();controls.closest=selector=>selector===selectedControl?controls:null;
const detachControls=attachScenarioControls(controls,controlPlayer);
controlPlayer.load(demo);controlPlayer.play();
controls.dispatchEvent(new Event('click'));assert.equal(controlPlayer.snapshot.state,'preparing','Diagnostic inspection leaves playback alone');
selectedControl='[data-scenario-exit]';controls.dispatchEvent(new Event('pointerdown'));
assert.equal(controlPlayer.snapshot.state,'preparing','Do not shift fixture controls before activation');
controls.dispatchEvent(new Event('click'));
assert.equal(controlPlayer.snapshot.state,'idle');assert.equal(controlFrames.size,0);assert.equal(controlPlayer.snapshot.owner,'user');
controlPlayer.play();selectedControl='[aria-label="Historical timeline"]';controls.dispatchEvent(new Event('input'));assert.equal(controlPlayer.snapshot.state,'paused');
for(let i=0;i<30;i++){controlPlayer.resume();controlPlayer.resume();assert.equal(controlFrames.size,1);controlPlayer.pause();controlPlayer.pause();assert.equal(controlFrames.size,0);}
controlPlayer.resume();selectedControl='[data-scenario-exit]';controls.dispatchEvent(new Event('click'));assert.equal(controlPlayer.snapshot.state,'idle');assert.equal(controlFrames.size,0);
controlPlayer.play();detachControls();controls.dispatchEvent(new Event('click'));assert.equal(controlPlayer.snapshot.state,'preparing');
controlPlayer.dispose();assert.equal(controlFrames.size,0);assert.equal(controlWrites,0);
console.log('Integration: inert diagnostics, fixture ownership release, timeline interruption, 30 idempotent pause/resume cycles, return cancellation, control listener disposal and bounded director JSON passed.');

// Every command enters continuously from the prior command's exact terminal pose.
let boundary=structuredClone(approachStart);
for(const beat of demo.beats)for(const action of beat.actions){
 const sample=directCamera(action.camera,boundary,demo),entry=sample(0);
 assert.ok(distance(entry.center,boundary.center)<.001);
 for(const key of ['zoom','pitch','bearing'])assert.ok(Math.abs(entry[key]-boundary[key])<1e-8);
 for(let i=0;i<=100;i++){const p=sample(i/100);assert.ok([...p.center,p.zoom,p.pitch,p.bearing].every(Number.isFinite));}
 boundary=sample(1);
}
assert.ok(distance(boundary.center,[-.0166,51.5387])<.001);
console.log('London continuity: all five beat boundaries enter at the current pose, finite camera samples and final stadium position passed.');
