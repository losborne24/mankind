/** Deterministic, project-authored prototype botanical meshes. No AI service or external geometry. */
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { mkdir, writeFile } from "node:fs/promises";

globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((value) => { this.result = value; this.onloadend?.(); }); }
};
let seed = 73;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const between = (a, b) => a + (b - a) * random();
const colorize = (geometry, hex, variation = 0.15) => {
  const base = new THREE.Color(hex), p = geometry.getAttribute("position"), colors = [];
  for (let i = 0; i < p.count; i++) colors.push(...base.clone().multiplyScalar(between(1 - variation, 1 + variation)).toArray());
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
};
const material = (double = false) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, side: double ? THREE.DoubleSide : THREE.FrontSide });
function branch(a, b, radius, geometries) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), direction = end.clone().sub(start);
  const geo = new THREE.CylinderGeometry(radius * 0.48, radius, direction.length(), 9, 4).toNonIndexed();
  const p = geo.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i); const ripple = 1 + 0.08 * Math.sin(y * 27 + p.getX(i) * 15);
    p.setXYZ(i, p.getX(i) * ripple, y, p.getZ(i) * ripple);
  }
  geo.computeVertexNormals();
  geo.applyMatrix4(new THREE.Matrix4().compose(start.add(end).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()), new THREE.Vector3(1, 1, 1)));
  geometries.push(colorize(geo, 0x665342));
}
function leaf(position, length, hex, geometries, narrow = false) {
  const width = length * (narrow ? 0.10 : 0.26);
  const vertices = [0,0,0, width,0.012,length*0.45, 0,0.02,length, 0,0,0, 0,0.02,length, -width,0.012,length*0.45];
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3)); geo.computeVertexNormals();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(between(-Math.PI, Math.PI), between(0, Math.PI * 2), between(-1.2, 1.2)));
  geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position), q, new THREE.Vector3(1,1,1)));
  geometries.push(colorize(geo, hex, 0.18));
}
function mesh(group, geometries, double = false) {
  const merged = mergeGeometries(geometries.map((g) => g.index ? g.toNonIndexed() : g));
  group.add(new THREE.Mesh(merged, material(double)));
}
function olive() {
  const group = new THREE.Group(), wood = [], leaves = [];
  branch([0,0,0], [0.15,2.8,-0.1],0.23,wood);
  for (let i=0;i<9;i++) {
    const a=i/9*Math.PI*2, r=between(1.2,2.3), tip=[Math.cos(a)*r,between(3.4,5.2),Math.sin(a)*r];
    branch([0.1,between(1.5,2.6),0],tip,0.09,wood);
    for (let j=0;j<500;j++) {
      const angle=between(0,Math.PI*2), u=between(-1,1), rr=Math.cbrt(random())*1.05;
      leaf([tip[0]+Math.sqrt(1-u*u)*Math.cos(angle)*rr,tip[1]+u*rr*0.65,tip[2]+Math.sqrt(1-u*u)*Math.sin(angle)*rr],between(0.24,0.38),0x6d7952,leaves,true);
    }
  }
  mesh(group,wood); mesh(group,leaves,true); return group;
}
function cypress() {
  const group=new THREE.Group(), wood=[], leaves=[];
  branch([0,0,0],[0.03,7.4,0],0.16,wood);
  for(let i=0;i<3200;i++) {
    const y=between(0.7,7.7), t=(y-0.7)/7, a=between(0,Math.PI*2);
    const r=(0.16+0.8*Math.pow(Math.sin(Math.PI*t),0.75))*Math.sqrt(random());
    leaf([Math.cos(a)*r,y,Math.sin(a)*r],between(0.22,0.42),0x3d5237,leaves,false);
  }
  mesh(group,wood);mesh(group,leaves,true);return group;
}
function shrub() {
  const group=new THREE.Group(), wood=[], leaves=[];
  for(let k=0;k<7;k++) { const a=k*2.4; branch([0,0,0],[Math.cos(a)*0.35,0.65,Math.sin(a)*0.35],0.025,wood); }
  for(let i=0;i<620;i++) { const a=between(0,Math.PI*2), r=Math.sqrt(random())*0.7; leaf([Math.cos(a)*r,between(0.15,0.8)*(1-r*0.35),Math.sin(a)*r],between(0.1,0.19),0x65704b,leaves); }
  mesh(group,wood);mesh(group,leaves,true);return group;
}
function rock() {
  const group=new THREE.Group(), geo=new THREE.IcosahedronGeometry(0.75,3), p=geo.getAttribute("position");
  for(let i=0;i<p.count;i++) { const x=p.getX(i),y=p.getY(i),z=p.getZ(i); const n=1+0.14*Math.sin(x*8+z*4)*Math.cos(y*9); p.setXYZ(i,x*n*1.2,Math.max(0,y*n*0.64+0.34),z*n*0.8); }
  geo.computeVertexNormals();group.add(new THREE.Mesh(colorize(geo,0x8d897a,0.1),material()));return group;
}
function grass() {
  const group=new THREE.Group(), geometries=[];
  for(let i=0;i<36;i++) {
    const a=between(0,Math.PI*2),r=between(0,0.22),h=between(0.18,0.48),w=between(0.009,0.022),bend=between(0.06,0.18);
    const vertices=[];
    for(let j=0;j<3;j++) { const t=j/3,u=(j+1)/3; vertices.push(-w*(1-t),h*t,bend*t*t,w*(1-t),h*t,bend*t*t,-w*(1-u),h*u,bend*u*u); if (u < 1) vertices.push(w*(1-t),h*t,bend*t*t,w*(1-u),h*u,bend*u*u,-w*(1-u),h*u,bend*u*u); }
    const geo=new THREE.BufferGeometry();geo.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));geo.computeVertexNormals();geo.rotateY(a);geo.translate(Math.cos(a)*r,0,Math.sin(a)*r);geometries.push(colorize(geo,i%3===0?0x9c9563:0x74794c));
  }
  mesh(group,geometries,true);return group;
}
// Small modular world-building props, not architectural or botanical reconstructions.
function boundary() {
  const group = new THREE.Group(), stones = [];
  for (let row=0;row<2;row++) for(let i=0;i<5;i++) {
    const g=new THREE.IcosahedronGeometry(1,1);
    g.scale(between(0.17,0.21),between(0.13,0.16),between(0.18,0.23));
    g.rotateY(between(-0.2,0.2));g.translate((i-2)*0.34+(row?0.05:0),0.14+row*0.23,between(-0.025,0.025));
    stones.push(colorize(g,0x9e9784,0.1));
  }
  mesh(group,stones);return group;
}
function crate() {
  const group=new THREE.Group(), wood=[];
  const box=(x,y,z,w,h,d)=>{const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);wood.push(colorize(g,0x79654c,0.07));};
  for(let i=0;i<5;i++) { const x=-0.36+i*0.18;box(x,0.66,0,0.17,0.08,0.72); }
  for(let i=0;i<4;i++) { const y=0.1+i*0.16;box(0,y,-0.34,0.9,0.145,0.06);box(0,y,0.34,0.9,0.145,0.06);box(-0.42,y,0,0.06,0.145,0.62);box(0.42,y,0,0.06,0.145,0.62); }
  for(const x of [-0.34,0.34]) {box(x,0.35,-0.38,0.065,0.7,0.045);box(x,0.35,0.38,0.065,0.7,0.045);}
  mesh(group,wood);return group;
}
function gardenPlant() {
  const group=new THREE.Group(), leaves=[];
  for(let i=0;i<34;i++) {
    const a=i*2.4, r=between(0.04,0.18);
    leaf([Math.cos(a)*r,between(0.08,0.22),Math.sin(a)*r],between(0.17,0.3),i%3?0x647648:0x88925e,leaves);
  }
  mesh(group,leaves,true);return group;
}
function grain() {
  const group=new THREE.Group(), parts=[];
  for(let i=0;i<23;i++) {
    const a=i*2.4,r=between(0.05,0.42),h=between(0.6,0.95),x=Math.cos(a)*r,z=Math.sin(a)*r;
    const stalk=new THREE.CylinderGeometry(0.008,0.012,h,5);stalk.translate(x,h/2,z);parts.push(colorize(stalk,0xb8a36a,0.06));
    const ear=new THREE.SphereGeometry(1,5,4);ear.scale(0.032,0.12,0.035);ear.translate(x,h,z);parts.push(colorize(ear,0xc4ad70,0.08));
  }
  mesh(group,parts);return group;
}
const output=new URL("../public/assets/environment/",import.meta.url);await mkdir(output,{recursive:true});
const manifest={};
for(const [name,create] of Object.entries({"olive-tree":olive,"italian-cypress":cypress,"mediterranean-shrub":shrub,"limestone-rock":rock,"dry-grass-tuft":grass,"low-stone-boundary":boundary,"wooden-crate":crate,"garden-plant":gardenPlant,"grain-clump":grain})) {
  const group=create();group.name=name;
  const bounds=new THREE.Box3().setFromObject(group);group.position.y=-bounds.min.y;
  const buffer=await new GLTFExporter().parseAsync(group,{binary:true});
  await writeFile(new URL(`${name}.glb`,output),Buffer.from(buffer));
  manifest[name]={bytes:buffer.byteLength,dimensionsMeters:bounds.getSize(new THREE.Vector3()).toArray()};
}
await writeFile(new URL("manifest.json",output),JSON.stringify(manifest,null,2)+"\n");
console.log(manifest);
