import * as THREE from "three";
import { assetRegistry } from "@/lib/assets/registry";
import { offsetCoordinate, type Coordinate, type SettlementDefinition } from "@/map/settlements/romanSettlement";
import { romanSilhouettes } from "@/lib/assets/romanSilhouettes";
import { localToSettlement } from "@/map/settlements/settlementEnvironment";
import type { SettlementDescriptor } from "@/map/settlements/settlementStreaming";

/** Shared boxes and gables. No roof tiles, props, lights, textures or GLBs.
 * Before first visit these are representative clusters; after generation use the actual
 * source-generated silhouette metadata, including the farmhouse's separate service wing.
 */
export class RegionalSettlement {
  readonly scene = new THREE.Scene();
  private readonly walls: THREE.InstancedMesh;
  private readonly roofs: THREE.InstancedMesh;
  private readonly plots: {offset: readonly [number,number];width:number;depth:number;heading:number;height:number;roofRise:number}[];
  private dirty = true;
  constructor(readonly descriptor: SettlementDescriptor, definition?: SettlementDefinition) {
    if (definition) {
      this.plots = definition.buildings.flatMap(building => {
        const asset = assetRegistry[building.assetId];
        const key = "nodeName" in asset ? asset.nodeName! : asset.path.split("/").at(-1)!.replace(".glb", "");
        const parts = romanSilhouettes[key as keyof typeof romanSilhouettes] ?? [{
          offset: [0,0] as const, width: asset.dimensionsMeters[0], depth: asset.dimensionsMeters[2],
          height: Math.max(2,asset.dimensionsMeters[1]-1), roofRise:1,
        }];
        const heading = building.headingRadians ?? 0;
        return parts.map(part => ({...part,offset:localToSettlement(part.offset,building.offset,heading),heading}));
      });
    } else {
      const count={hamlet:6,village:22,"small-town":40}[descriptor.profile];
      this.plots=Array.from({length:count},(_,i)=>({offset:[(i%2 ? -1:1)*(10+Math.floor(i/12)*17),(Math.floor(i/2)%6-2.5)*14] as const,width:7,depth:8,heading:0,height:3.5,roofRise:1}));
    }
    const roof=new THREE.BufferGeometry();
    roof.setAttribute("position",new THREE.Float32BufferAttribute([
      -.5,0,-.5,.5,0,-.5,0,1,-.5, -.5,0,.5,0,1,.5,.5,0,.5,
      -.5,0,-.5,0,1,-.5,0,1,.5, -.5,0,-.5,0,1,.5,-.5,0,.5,
      .5,0,-.5,.5,0,.5,0,1,.5, .5,0,-.5,0,1,.5,0,1,-.5,
    ],3));roof.computeVertexNormals();
    this.walls=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:0xc7b897}),this.plots.length);
    this.roofs=new THREE.InstancedMesh(roof,new THREE.MeshBasicMaterial({color:descriptor.visual?.roofColour??0xa56843,side:THREE.DoubleSide}),this.plots.length);
    this.walls.visible=this.roofs.visible=false;
    this.scene.add(this.walls,this.roofs);
  }
  invalidate() { this.dirty=true; }
  updateTerrain(sample: (coordinate: Coordinate)=>number|undefined) {
    if (!this.dirty) return;
    this.dirty=false;
    const object=new THREE.Object3D();let count=0;
    for (const p of this.plots) {
      const height=sample(offsetCoordinate(this.descriptor.origin,p.offset));
      if (height===undefined) continue;
      object.position.set(p.offset[0],height+p.height/2,p.offset[1]);object.rotation.set(0,p.heading,0);object.scale.set(p.width,p.height,p.depth);object.updateMatrix();this.walls.setMatrixAt(count,object.matrix);
      object.position.y=height+p.height;object.scale.set(p.width+0.5,p.roofRise,p.depth+0.5);object.updateMatrix();this.roofs.setMatrixAt(count++,object.matrix);
    }
    for (const mesh of [this.walls,this.roofs]) {mesh.count=count;mesh.visible=count>0;mesh.instanceMatrix.needsUpdate=true;if(count)mesh.computeBoundingSphere();}
  }
  dispose() { for(const mesh of [this.walls,this.roofs]) {mesh.dispose();mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();}this.scene.clear(); }
}
