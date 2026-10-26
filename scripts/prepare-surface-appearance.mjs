/** Derive the native loading/comparison drape from the SAME natural material
 * inputs as the PBR shader. No source downloads or ecological reclassification.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { NATURAL_CANOPY_ALBEDO, GROUND_LIGHTING } from '../map/surface/materials.ts';
import { RESOLVE_ENVIRONMENTS } from '../map/surface/resolve.ts';

const linear = s => { s/=255; return s<=.04045 ? s/12.92 : ((s+.055)/1.055)**2.4; };
const srgb = v => Math.round(255*Math.max(0,Math.min(1,v<=.0031308 ? v*12.92 : 1.055*v**(1/2.4)-.055)));
const canopyColor = NATURAL_CANOPY_ALBEDO.map(linear);
const lightLength = Math.hypot(...GROUND_LIGHTING.sunDirection);
const light = GROUND_LIGHTING.sunDirection.map(v=>v/lightLength);
const halfLength = Math.hypot(light[0],light[1]+1,light[2]);
const half = [light[0]/halfLength,(light[1]+1)/halfLength,light[2]/halfLength];

export async function prepareSurfaceAppearance(root = 'public/geo/environment/natural-v1', classes = Object.keys(RESOLVE_ENVIRONMENTS)) {
  let bytes=0, tiles=0;
  const save=async(key,z,x,y,data)=>{
    await mkdir(`${root}/${key}-appearance/${z}/${x}`,{recursive:true});
    const png=await sharp(data,{raw:{width:512,height:512,channels:4}}).png().toBuffer();
    await writeFile(`${root}/${key}-appearance/${z}/${x}/${y}.png`,png);
    bytes+=png.length; tiles++;
  };
  for(const key of classes) {
    for(let z=0;z<=4;z++) for(let x=0;x<2**z;x++) for(let y=0;y<2**z;y++) {
      const albedo=await sharp(`${root}/${key}/${z}/${x}/${y}.png`).ensureAlpha().raw().toBuffer();
      const properties=await sharp(`${root}/${key}-properties/${z}/${x}/${y}.png`).removeAlpha().raw().toBuffer();
      const out=Buffer.alloc(albedo.length);
      for(let i=0;i<512*512;i++) {
        const a=albedo[i*4+3]; if(!a) continue;
        const east=properties[i*3]/255*2-1, south=properties[i*3+1]/255*2-1;
        let up=Math.sqrt(Math.max(.001,1-east*east-south*south));
        const length=Math.hypot(east,up,south), n=[east/length,up/length,south/length]; up=n[1];
        const slope=Math.atan(Math.hypot(east,south)/Math.max(.001,Math.sqrt(Math.max(0,1-east*east-south*south))));
        const cover=RESOLVE_ENVIRONMENTS[key].canopy*(1-Math.max(0,Math.min(1,(slope-.22)/.65)));
        const nl=Math.max(0,n.reduce((sum,v,c)=>sum+v*light[c],0));
        const nv=Math.max(.05,up), nh=Math.max(0,n.reduce((sum,v,c)=>sum+v*half[c],0));
        const rough=Math.max(.08,properties[i*3+2]/255), a2=rough**4;
        const distribution=a2/(Math.PI*(nh*nh*(a2-1)+1)**2);
        const k=(rough+1)**2/8, geometry=nv/(nv*(1-k)+k)*nl/(nl*(1-k)+k);
        const fresnel=.04+.96*(1-half[1])**5;
        const specular=distribution*geometry*fresnel/Math.max(.001,4*nv*nl);
        for(let c=0;c<3;c++) {
          const color=linear(albedo[i*4+c])*(1-cover)+canopyColor[c]*cover;
          out[i*4+c]=srgb(color*(GROUND_LIGHTING.ambient+GROUND_LIGHTING.sky*Math.max(up,0))+((1-fresnel)*color/Math.PI+specular)*nl*GROUND_LIGHTING.irradiance);
        }
        out[i*4+3]=a;
      }
      await save(key,z,x,y,out);
    }
    console.log(`Matching natural appearance: ${key}`);
  }
  return {tiles,bytes};
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const root='public/geo/environment/natural-v1';
  const appearance=await prepareSurfaceAppearance(root);
  const manifest=JSON.parse(await readFile(`${root}/manifest.json`));
  manifest.bytes=manifest.bytes-(manifest.appearanceBytes??0)+appearance.bytes;
  manifest.tiles=manifest.albedoTiles+manifest.propertyTiles+appearance.tiles;
  Object.assign(manifest,{appearanceVersion:1,appearanceTiles:appearance.tiles,appearanceBytes:appearance.bytes});
  await writeFile(`${root}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify(appearance));
}
