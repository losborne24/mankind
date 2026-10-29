import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const modules=new Map();
async function load(path){if(modules.has(path))return modules.get(path);let {outputText}=ts.transpileModule(await readFile(`${path}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}});for(const match of [...outputText.matchAll(/from ['"]([^'"]+)['"]/g)]){const spec=match[1],url=spec.startsWith('@/')?await load(spec.slice(2)):import.meta.resolve(spec);outputText=outputText.replace(match[0],`from "${url}"`);}const url=`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;modules.set(path,url);return url;}
const {validateScenario}=await import(await load('lib/scenarios/schema'));
const {london2012:demo}=await import(await load('lib/scenarios/london2012'));
const {ScenarioPlayer}=await import(await load('lib/scenarios/player'));
const {directCamera,routePoint,distance,coordinateAt}=await import(await load('lib/scenarios/camera'));
const {attachScenarioInput}=await import(await load('lib/scenarios/interruption'));
assert.equal(validateScenario(demo).version,1);
for(const mutate of [s=>s.version=2,s=>s.beats=[],s=>s.beats[0].actions[0].camera.type='unknown',s=>s.beats[0].actions[0].camera.center=[181,0],s=>s.beats[0].actions[0].camera.pitch=66,s=>s.beats[0].actions[0].camera.center=[0,90],s=>s.beats[0].actions[0].camera.zoom=21,s=>s.beats[0].actions[0].camera.duration=Infinity,s=>s.beats[4].actions[0].camera.degrees=721,s=>s.beats[0].actions[0].camera.duration=0,s=>s.beats[0].actions[0].camera.duration=180001,s=>s.beats[0].actions[0].time={start:{year:2012,month:2,day:30}},s=>s.content.routes[0].coordinates=[[0,0]],s=>s.beats[0].actions[0].overlays=['missing'],s=>s.content.sources[0].url='javascript:alert(1)',s=>s.content.locations[0].coordinate=[NaN,0],s=>s.content.routes[0].certainty='verified']){const s=structuredClone(demo);mutate(s);assert.throws(()=>validateScenario(s));}
assert.throws(()=>validateScenario({...demo,callback:()=>{}}));
const unequal=[[0,0],[.001,0],[1,0]];assert.ok(Math.abs(routePoint(unequal,.5)[0]-.5)<1e-6);assert.ok(Math.abs(Math.abs(coordinateAt([179,0],[-179,0],.5)[0])-180)<1e-6);
assert.deepEqual(routePoint([[0,0],[0,0]],.5),[0,0]);
const start={center:[-.1,51.5],zoom:12,pitch:30,bearing:170};
const orbit=directCamera({type:'orbit',center:[0,51.5],zoom:15,pitch:50,degrees:180,duration:1000},start,demo);
for(let i=20;i<=100;i++)assert.deepEqual(orbit(i/100).center,[0,51.5]);assert.deepEqual(orbit(0),start);
const fly=directCamera({type:'flyTo',center:[0,52],zoom:15,pitch:50,bearing:-170,duration:1000},start,demo);assert.deepEqual(fly(0),start);
const cinematic=directCamera({type:'flyTo',center:[0,52],zoom:15,duration:1000,transition:'cinematic'},start,demo);assert.ok(cinematic(.5).zoom<fly(.5).zoom);
assert.ok(Math.abs(fly(.5).bearing-180)<1e-6);
let pose=structuredClone(start),frames=new Map(),frameId=0,now=0,writes=0,time,overlay,travel;
const player=new ScenarioPlayer({camera:{read:()=>structuredClone(pose),write:p=>{pose=structuredClone(p);writes++;},stop:()=>{}},timeline:t=>{time=t;},overlays:ids=>{overlay=ids;},streaming:i=>{travel=i;},frame:cb=>{frames.set(++frameId,cb);return frameId;},cancelFrame:id=>frames.delete(id)});
const tick=(ms=100)=>{now+=ms;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(f=>f(now));assert.ok(frames.size<=1,'Only one animation scheduled');};
const run=ms=>{for(let i=0;i<ms/100;i++)tick();};
const transitions=[];const unsubscribe=player.subscribe(()=>transitions.push(player.snapshot.state));
player.load(demo);assert.equal(player.snapshot.state,'idle');player.play();assert.equal(time.start.month,7);assert.equal(travel.detail,'map');run(1000);const elapsed=player.snapshot.elapsed,saved=structuredClone(pose);player.pause('Mouse navigation');assert.equal(player.snapshot.state,'paused');assert.equal(frames.size,0);pose.center=[10,10];const free=structuredClone(pose);run(1000);assert.deepEqual(pose,free);
player.resume();run(500);player.pause('Scroll zoom');assert.equal(player.snapshot.elapsed,elapsed);assert.deepEqual(player.snapshot.savedPose,saved);pose.center=[20,20];player.resume();run(1900);assert.equal(player.snapshot.returning,false);assert.ok(distance(pose.center,saved.center)<.01);run(200);assert.ok(player.snapshot.elapsed>elapsed);
player.skip();assert.equal(player.snapshot.beat,1);player.jump(4);assert.equal(time.start.day,27);player.restart();assert.equal(player.snapshot.beat,0);assert.equal(time.start.day,undefined);player.stop();assert.equal(frames.size,0);assert.deepEqual(overlay,[]);const count=writes;run(1000);assert.equal(writes,count);
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
