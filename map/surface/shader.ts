import { GROUND_LIGHTING } from './materials';

export const groundVertexShader = `#version 300 es
precision highp float;
precision highp int;
out vec2 v_uv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  v_uv = vec2(p.x, 1.0-p.y);
  gl_Position = vec4(p*2.0-1.0, 0.0, 1.0);
}`;

/** Cached terrain-tile BRDF. Artistic sun/sky, not reconstructed illumination.
 * Volumetric triplanar detail is geographic and band-limited to the tile footprint.
 */
export const groundFragmentShader = `#version 300 es
precision highp float;
precision highp int;
in vec2 v_uv;
uniform sampler2D u_albedo;
uniform sampler2D u_properties;
uniform vec3 u_source; // parent subrectangle: offset UV, scale
uniform vec3 u_tile; // normalized mercator x/y origin and width
uniform vec3 u_view; // local east / up / south
uniform float u_strength;
uniform float u_lighting;
uniform float u_pixelMetres;
uniform float u_canopy;
uniform vec3 u_canopyColor;
out vec4 fragColor;
const float PI=3.141592653589793;
vec3 toLinear(vec3 c) { return mix(c/12.92, pow((c+.055)/1.055,vec3(2.4)), step(vec3(.04045),c)); }
vec3 toSrgb(vec3 c) { return mix(12.92*c,1.055*pow(max(c,vec3(0)),vec3(1.0/2.4))-.055,step(vec3(.0031308),c)); }
// Analytic derivatives of non-repeating geographic value noise on three planes.
float hash2(ivec2 p) {
  uvec2 q=uvec2(p);
  uint h=(q.x*1597334677u)^(q.y*3812015801u);
  h=(h^(h>>16u))*2246822519u; h^=h>>13u;
  return float(h&16777215u)/16777215.0;
}
vec3 planeSample(vec2 p) {
  ivec2 i=ivec2(floor(p)); vec2 f=fract(p), u=f*f*(3.0-2.0*f), du=6.0*f*(1.0-f);
  float a=hash2(i), b=hash2(i+ivec2(1,0)), c=hash2(i+ivec2(0,1)), d=hash2(i+ivec2(1,1));
  return vec3(mix(mix(a,b,u.x),mix(c,d,u.x),u.y),mix(b-a,d-c,u.y)*du.x,mix(c-a,d-b,u.x)*du.y);
}
vec4 detailSample(vec3 p, vec3 n, float wavelength) {
  vec3 q=p/wavelength;
  float footprint=max(max(fwidth(q.x),fwidth(q.y)),fwidth(q.z));
  float attenuation=1.0-smoothstep(.25,1.0,footprint);
  vec3 w=pow(abs(n),vec3(4)); w/=max(dot(w,vec3(1)),.001);
  vec3 xy=planeSample(q.xy), xz=planeSample(q.xz), yz=planeSample(q.yz);
  vec3 gradient=vec3(xy.yz,0)*w.z+vec3(xz.y,0,xz.z)*w.y+vec3(0,yz.yz)*w.x;
  float height=dot(vec3(yz.x,xz.x,xy.x),w)-.5;
  return vec4(gradient,height)*attenuation;
}
void main() {
  vec2 uv=u_source.xy+v_uv*u_source.z;
  vec4 texel=texture(u_albedo,uv);
  if(texel.a<.001) discard;
  vec3 properties=texture(u_properties,uv).rgb;
  vec2 en=properties.rg*2.0-1.0;
  vec3 N=normalize(vec3(en.x,sqrt(max(.001,1.0-dot(en,en))),en.y));
  vec2 merc=u_tile.xy+v_uv*u_tile.z;
  float lon=merc.x*(2.0*PI)-PI;
  float lat=atan(sinh(PI*(1.0-2.0*merc.y)));
  vec3 up=vec3(cos(lat)*cos(lon),cos(lat)*sin(lon),sin(lat));
  vec3 east=vec3(-sin(lon),cos(lon),0);
  vec3 south=vec3(sin(lat)*cos(lon),sin(lat)*sin(lon),-cos(lat));
  vec3 worldNormal=normalize(east*N.x+up*N.y+south*N.z);
  float variation=0.0;
  // Uniform screen-footprint gate: distant terrain does not evaluate micro detail.
  if(u_pixelMetres<26.0) {
    vec3 position=up*6378137.0;
    vec4 fine=detailSample(position,worldNormal,2.0), coarse=detailSample(position,worldNormal,13.0);
    vec3 g=fine.xyz+.45*coarse.xyz;
    variation=fine.w*.38+coarse.w*.45;
    g-=worldNormal*dot(g,worldNormal);
    worldNormal=normalize(worldNormal-g*u_strength*.32);
  }
  N=vec3(dot(worldNormal,east),dot(worldNormal,up),dot(worldNormal,south));
  vec3 V=normalize(u_view);
  vec3 L=normalize(vec3(${GROUND_LIGHTING.sunDirection.map(v => v.toFixed(8)).join(',')}));
  vec3 H=normalize(V+L);
  float nl=max(dot(N,L),0.0), nv=max(dot(N,V),.05), nh=max(dot(N,H),0.0), vh=max(dot(V,H),0.0);
  float roughness=clamp(properties.b+variation*.06,.08,1.0);
  float a2=pow(roughness,4.0);
  float d=a2/(PI*pow(nh*nh*(a2-1.0)+1.0,2.0));
  float k=pow(roughness+1.0,2.0)/8.0;
  float geometry=(nv/(nv*(1.0-k)+k))*(nl/(nl*(1.0-k)+k));
  vec3 F=vec3(.04)+vec3(.96)*pow(1.0-vh,5.0);
  vec3 albedo=toLinear(texel.rgb)*(1.0+variation);
  // Keep aggregate cover until visible vegetation geometry can replace it.
  // Zoom alone must not clear forests; ground materials remain independent.
  float slope=atan(length(en)/max(.001,sqrt(max(0.0,1.0-dot(en,en)))));
  float canopy=u_canopy*(1.0-clamp((slope-.22)/.65,0.0,1.0));
  albedo=mix(albedo,toLinear(u_canopyColor),canopy);
  vec3 specular=d*geometry*F/max(4.0*nv*nl,.001);
  vec3 direct=((vec3(1)-F)*albedo/PI+specular)*nl*${GROUND_LIGHTING.irradiance};
  vec3 ambient=albedo*(${GROUND_LIGHTING.ambient}+${GROUND_LIGHTING.sky}*max(N.y,0.0));
  vec3 color=mix(albedo,ambient+direct,u_lighting);
  fragColor=vec4(clamp(toSrgb(color),0.0,1.0)*texel.a,texel.a);
}`;
