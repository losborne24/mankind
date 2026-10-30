import * as THREE from "three";
import { buildGroundMask, buildSurfaceMask, MASK_RESOLUTION, type ContactRect, type ContextGroundSpec } from "@/map/settlements/groundMask";
import { cobbleTexture, earthTexture, pavingTexture, scrubTexture } from "@/map/settlements/groundTextures";
import { SUN_COLOUR, SUN_DIRECTION } from "@/map/settlements/lighting";
import type { LocalPoint } from "@/map/settlements/romanSettlement";

export interface HeightResult { height: number | undefined; retained: boolean }
const RINGS = 44, SEGMENTS = 96;

const noiseGlsl = `
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
`;

/** A polar grid: fine near the site, coarse at the rim, so the rim can reach ~700 m cheaply. */
function polarGrid(radius: number) {
  const points: LocalPoint[] = [], indices: number[] = [];
  for (let i = 0; i <= RINGS; i++) {
    const r = radius * Math.pow(i / RINGS, 1.7);
    for (let k = 0; k < SEGMENTS; k++) {
      const a = k / SEGMENTS * Math.PI * 2;
      points.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }
  for (let i = 0; i < RINGS; i++) for (let k = 0; k < SEGMENTS; k++) {
    const a = i * SEGMENTS + k, b = i * SEGMENTS + (k + 1) % SEGMENTS, c = a + SEGMENTS, d = b + SEGMENTS;
    indices.push(a, b, c, b, d, c);
  }
  return { points, indices };
}

/**
 * The local ground: a textured, lit mesh draped on MapLibre's terrain, feathered to nothing at its rim,
 * plus a river-surface mesh with its own shader. All surfaces are generated from noise at load.
 */
export class ContextGround {
  readonly group = new THREE.Group();
  readonly points: LocalPoint[];
  private readonly groundGeometry = new THREE.BufferGeometry();
  private readonly waterGeometry = new THREE.BufferGeometry();
  private readonly textures: THREE.Texture[] = [];
  private readonly groundMaterial: THREE.MeshStandardMaterial;
  private readonly waterMaterial: THREE.ShaderMaterial;
  private readonly ground: THREE.Mesh;
  private readonly water: THREE.Mesh;
  private readonly maskData: Uint8Array;
  private heights: number[] | undefined;
  private shownSince = 0;
  waterVisible = false;
  /** Height of the river surface in the settlement frame; undefined without water. */
  waterLevel: number | undefined;
  private readonly guess = { value: 1 };

  constructor(spec: ContextGroundSpec, contacts: readonly ContactRect[], sunDirection = SUN_DIRECTION) {
    const radius = spec.sizeMeters / 2;
    const grid = polarGrid(radius);
    this.points = grid.points;
    this.maskData = buildGroundMask(spec, contacts);
    const mask = new THREE.DataTexture(this.maskData, MASK_RESOLUTION, MASK_RESOLUTION, THREE.RGBAFormat);
    mask.magFilter = THREE.LinearFilter; mask.minFilter = THREE.LinearMipmapLinearFilter; mask.generateMipmaps = true;
    mask.wrapS = mask.wrapT = THREE.ClampToEdgeWrapping; mask.needsUpdate = true;
    const surface = new THREE.DataTexture(buildSurfaceMask(spec), MASK_RESOLUTION, MASK_RESOLUTION, THREE.RGBAFormat);
    surface.magFilter = THREE.LinearFilter; surface.minFilter = THREE.LinearMipmapLinearFilter; surface.generateMipmaps = true; surface.needsUpdate = true;
    const earth = earthTexture(), scrub = scrubTexture(), paving = pavingTexture(), cobbles = cobbleTexture();
    this.textures.push(mask, surface, earth, scrub, paving, cobbles);
    for (const geometry of [this.groundGeometry, this.waterGeometry]) {
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(grid.points.flatMap(([x, z]) => [x, 0, z]), 3));
      geometry.setIndex(grid.indices);
    }
    this.groundGeometry.setAttribute("normal", new THREE.Float32BufferAttribute(grid.points.flatMap(() => [0, 1, 0]), 3));
    this.groundGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(grid.points.flatMap(([x, z]) => [x / spec.sizeMeters + 0.5, z / spec.sizeMeters + 0.5]), 2));

    const shared = { tMask: { value: mask }, uSize: { value: spec.sizeMeters }, uFade: { value: 0 } };
    this.groundMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, transparent: true, depthWrite: false });
    const groundUniforms = { ...shared, tEarth: { value: earth }, tScrub: { value: scrub }, tPaving: { value: paving }, tCobble: { value: cobbles }, tSurface: { value: surface }, uGuess: this.guess };
    this.groundMaterial.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, groundUniforms);
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vGround;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGround = position.xz;");
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
        varying vec2 vGround; uniform sampler2D tMask, tEarth, tScrub, tPaving, tCobble, tSurface; uniform float uSize, uFade, uGuess;
        ${noiseGlsl}`).replace("#include <map_fragment>", `
        vec2 muv = vGround / uSize + 0.5;
        vec4 m = texture2D(tMask, muv);
        // Domain-warped, rotated lookups so the tiles never line up into a visible grid.
        vec2 warp = vGround + 14.0 * (vec2(vnoise(vGround * 0.035), vnoise(vGround * 0.035 + 5.2)) - 0.5);
        vec2 spin = mat2(0.82, -0.57, 0.57, 0.82) * warp;
        float broad = vnoise(warp * 0.011 + 3.0), mid = vnoise(spin * 0.045 + 7.0);
        vec3 earth = texture2D(tEarth, warp / 8.0).rgb * 0.5 + texture2D(tEarth, spin / 2.9 + 0.31).rgb * 0.3 + texture2D(tEarth, spin / 23.0).rgb * 0.2;
        vec3 scrub = texture2D(tScrub, warp / 10.0).rgb * 0.5 + texture2D(tScrub, spin / 3.3 + 0.17).rgb * 0.3 + texture2D(tScrub, spin / 31.0).rgb * 0.2;
        vec3 pave = texture2D(tPaving, vGround / 6.0).rgb;
        vec4 m2 = texture2D(tSurface, muv);
        float trodden = max(smoothstep(0.04, 0.7, m.b), smoothstep(0.1, 0.6, m2.b) * uGuess);
        float bare = smoothstep(0.45, 0.85, mid * 0.5 + broad * 0.6);
        vec3 ground = mix(scrub, earth, clamp(trodden + bare * 0.5, 0.0, 1.0));
        float paved = smoothstep(0.38, 0.62, m.r + (mid - 0.5) * 0.22);
        float square = smoothstep(0.4, 0.6, m2.g + (mid - 0.5) * 0.2) * uGuess;
        // Inside the guessed city the ground is packed earth and paving in courtyards, never grass.
        float yard = smoothstep(0.35, 0.7, m2.b) * uGuess;
        ground = mix(ground, mix(earth * 0.9, pave * 0.82, smoothstep(0.5, 0.64, vnoise(vGround * 0.1 + 11.0))), yard);
        vec3 col = mix(ground, pave, max(paved, square));
        vec3 cobble = texture2D(tCobble, vGround / 5.0).rgb * 0.7 + texture2D(tCobble, spin / 2.3).rgb * 0.3;
        col = mix(col, cobble, smoothstep(0.3, 0.7, m2.r) * uGuess);
        col *= 1.0 - 0.5 * m.a;                       // baked contact shadow beside walls
        float bank = smoothstep(0.0, 0.5, m.g);
        col = mix(col, col * vec3(0.6, 0.56, 0.48), bank * (1.0 - smoothstep(0.5, 0.9, m.g)));
        float rim = 1.0 - smoothstep(0.42, 1.0, length(vGround) / (uSize * 0.5));
        diffuseColor.rgb = col;
        diffuseColor.a *= rim * uFade * (1.0 - smoothstep(0.5, 0.85, m.g));
      `);
    };
    this.groundMaterial.customProgramCacheKey = () => "context-ground-v3";
    this.ground = new THREE.Mesh(this.groundGeometry, this.groundMaterial);
    this.ground.receiveShadow = true; this.ground.renderOrder = 1; this.ground.visible = false; this.ground.frustumCulled = false;

    this.waterMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { ...shared, uTime: { value: 0 }, uSunDir: { value: sunDirection.clone() }, uSunColour: { value: new THREE.Color(SUN_COLOUR) },
        uCam: { value: new THREE.Vector3(0, 400, 0) }, uSkyLow: { value: new THREE.Color(0xe3dccb) }, uSkyHigh: { value: new THREE.Color(0x7fa2c8) },
        uShallow: { value: new THREE.Color(0x6f7a56) }, uDeep: { value: new THREE.Color(0x2c3a30) } },
      vertexShader: `varying vec2 vGround; varying vec3 vPos;
        void main(){ vGround = position.xz; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D tMask; uniform float uSize, uTime, uFade; uniform vec3 uSunDir, uSunColour, uCam, uSkyLow, uSkyHigh, uShallow, uDeep;
        varying vec2 vGround; varying vec3 vPos; ${noiseGlsl}
        float swell(vec2 p){ vec2 flow = vec2(0.0, 1.0) * uTime;   // the river runs roughly south here
          return vnoise(p * 0.32 + flow * 0.28) * 0.5 + vnoise(p * 0.85 - flow * 0.5 + 9.0) * 0.28 + vnoise(p * 2.4 + flow * 0.8 + 3.0) * 0.12; }
        void main(){
          vec2 muv = vGround / uSize + 0.5;
          vec4 m = texture2D(tMask, muv);
          float cover = smoothstep(0.1, 0.6, m.g);
          if (cover < 0.01) discard;
          float inner = smoothstep(0.0, 1.0, textureLod(tMask, muv, 3.0).g);
          vec3 view = uCam - vPos; float dist = length(view); view /= dist;
          float e = 0.35, h = swell(vGround);
          vec2 grad = vec2(swell(vGround + vec2(e, 0.0)) - h, swell(vGround + vec2(0.0, e)) - h) / e;
          vec3 n = normalize(vec3(-grad.x * 0.34 / (1.0 + dist * 0.004), 1.0, -grad.y * 0.34 / (1.0 + dist * 0.004)));
          vec3 r = reflect(-view, n);
          float up = clamp(r.y, 0.0, 1.0);
          vec3 sky = mix(uSkyLow, uSkyHigh, pow(up, 0.55));
          float fres = clamp(0.03 + 0.97 * pow(1.0 - max(dot(n, view), 0.0), 5.0), 0.0, 0.85);
          float sunGlint = pow(max(dot(r, uSunDir), 0.0), 380.0) * 3.5 + pow(max(dot(r, uSunDir), 0.0), 36.0) * 0.18;
          vec3 body = mix(uShallow, uDeep, smoothstep(0.1, 0.9, inner));
          body *= 0.55 + 0.45 * max(dot(n, uSunDir), 0.0);
          vec3 col = mix(body, sky, fres) + uSunColour * sunGlint;
          float foam = smoothstep(0.1, 0.3, m.g) * (1.0 - smoothstep(0.3, 0.52, m.g)) * smoothstep(0.45, 0.7, vnoise(vGround * 1.7 + uTime * 0.2));
          col = mix(col, vec3(0.74, 0.72, 0.64), foam * 0.45);
          gl_FragColor = vec4(col, cover * uFade * mix(0.82, 0.97, inner));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.water = new THREE.Mesh(this.waterGeometry, this.waterMaterial);
    this.water.renderOrder = 2; this.water.visible = false; this.water.frustumCulled = false;
    this.group.add(this.ground, this.water);
  }

  /** Re-drape on the terrain. Returns false while any vertex has never had a height. */
  update(resolve: (point: LocalPoint) => HeightResult, spec: ContextGroundSpec): boolean {
    const heights: number[] = new Array(this.points.length);
    let retained = false;
    for (let i = 0; i < this.points.length; i++) {
      const result = resolve(this.points[i]);
      if (result.height === undefined) return false;
      heights[i] = result.height; retained ||= result.retained;
    }
    if (retained && this.heights) heights.splice(0, heights.length, ...this.heights);
    this.heights = heights;
    const radius = spec.sizeMeters / 2;
    const ground = this.groundGeometry.getAttribute("position") as THREE.BufferAttribute;
    const water = this.waterGeometry.getAttribute("position") as THREE.BufferAttribute;
    // The coarse rim sits higher so the terrain mesh cannot poke through between vertices.
    for (let i = 0; i < heights.length; i++) ground.setY(i, heights[i] + 0.07 + Math.hypot(this.points[i][0], this.points[i][1]) / radius * 0.8);
    ground.needsUpdate = true;
    this.shadeRelief(heights);
    this.groundGeometry.computeBoundingSphere();
    // River level: high enough that the terrain only breaks the surface at the banks.
    const wet: number[] = [];
    const res = MASK_RESOLUTION;
    for (let i = 0; i < heights.length; i++) {
      const [x, z] = this.points[i];
      const u = Math.floor((x / spec.sizeMeters + 0.5) * res), v = Math.floor((z / spec.sizeMeters + 0.5) * res);
      if (u >= 0 && v >= 0 && u < res && v < res && this.maskData[(v * res + u) * 4 + 1] > 128) wet.push(heights[i]);
    }
    this.waterVisible = wet.length > 3;
    if (this.waterVisible) {
      wet.sort((a, b) => a - b);
      const level = wet[Math.floor(wet.length * 0.85)] + 0.15;
      for (let i = 0; i < heights.length; i++) water.setY(i, level);
      water.needsUpdate = true; this.waterGeometry.computeBoundingSphere();
      this.waterLevel = level;
    } else this.waterLevel = undefined;
    if (!this.shownSince) this.shownSince = performance.now();
    this.ground.visible = true; this.water.visible = this.waterVisible;
    return true;
  }

  /**
   * Per-vertex normals from the height field (central differences along and across the rings), so hills are lit and
   * read as hills. Face normals of the polar grid would stripe; differences between neighbouring vertices do not.
   */
  private shadeRelief(heights: number[]) {
    const normal = this.groundGeometry.getAttribute("normal") as THREE.BufferAttribute;
    const at = (index: number, out: THREE.Vector3) => out.set(this.points[index][0], heights[index], this.points[index][1]);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), tangent = new THREE.Vector3(), radial = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i <= RINGS; i++) for (let k = 0; k < SEGMENTS; k++) {
      const index = i * SEGMENTS + k;
      if (i === 0) { normal.setXYZ(index, 0, 1, 0); continue; }
      tangent.copy(at(i * SEGMENTS + (k + 1) % SEGMENTS, a)).sub(at(i * SEGMENTS + (k + SEGMENTS - 1) % SEGMENTS, b));
      radial.copy(at(Math.min(RINGS, i + 1) * SEGMENTS + k, a)).sub(at((i - 1) * SEGMENTS + k, b));
      n.crossVectors(tangent, radial);
      if (n.y < 0) n.negate();
      n.normalize();
      normal.setXYZ(index, n.x, n.y, n.z);
    }
    normal.needsUpdate = true;
  }

  /** Fades the guessed surfaces (streets, widened square, yards) in or out with the best-guess switch. */
  setGuessVisible(visible: boolean) { this.guess.value = visible ? 1 : 0; }

  /** Advances water motion and the fade-in; true while it still needs frames. */
  tick(now: number, camera: THREE.Vector3, animateWater: boolean): boolean {
    const fade = this.shownSince ? Math.min(1, (now - this.shownSince) / 700) : 0;
    this.fade = fade;
    const uniforms = this.waterMaterial.uniforms;
    uniforms.uFade.value = fade; uniforms.uCam.value.copy(camera);
    if (animateWater) uniforms.uTime.value = now / 1000;
    return fade < 1 || (animateWater && this.waterVisible);
  }
  private fade = 0;
  get groundFade() { return this.fade; }

  dispose() {
    this.groundGeometry.dispose(); this.waterGeometry.dispose(); this.groundMaterial.dispose(); this.waterMaterial.dispose();
    for (const texture of this.textures) texture.dispose();
  }
}
