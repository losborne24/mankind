import * as THREE from "three";
import { HAZE_COLOUR } from "@/map/settlements/lighting";

export interface PostParams {
  /** 0 disables each effect. Bloom is a glow on the brightest areas; haze and depth of field follow ground distance. */
  bloom: number; haze: number; dof: number;
  /** Clip space → settlement metres (the anchored camera's inverse projection). */
  inverseProjection: THREE.Matrix4;
  eye: THREE.Vector3;
  /** Settlement-frame height of the ground the camera is looking at, and the distance to it. */
  groundY: number; focusMeters: number;
}

const vertex = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const blurShader = (direction: string) => `uniform sampler2D tIn; uniform vec2 uStep; varying vec2 vUv;
  void main(){ vec2 d = ${direction} * uStep;
    vec3 c = texture2D(tIn, vUv).rgb * 0.2270270270;
    c += (texture2D(tIn, vUv + d * 1.3846153846).rgb + texture2D(tIn, vUv - d * 1.3846153846).rgb) * 0.3162162162;
    c += (texture2D(tIn, vUv + d * 3.2307692308).rgb + texture2D(tIn, vUv - d * 3.2307692308).rgb) * 0.0702702703;
    gl_FragColor = vec4(c, 1.0); }`;

/**
 * Screen-space finishing for the local scene, drawn inside MapLibre's own frame:
 * the framebuffer so far is copied, blurred at half and quarter size, and written back
 * with depth of field, distance haze and bloom. MapLibre's labels draw afterwards, so text stays sharp.
 * Distance is the distance to the ground plane along each pixel's ray (no depth buffer is read).
 */
export class PostEffects {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;
  private source?: THREE.FramebufferTexture;
  private half: THREE.WebGLRenderTarget[] = [];
  private quarter: THREE.WebGLRenderTarget[] = [];
  private width = 0; private height = 0;
  private readonly blurH: THREE.ShaderMaterial; private readonly blurV: THREE.ShaderMaterial; private readonly composite: THREE.ShaderMaterial;

  constructor() {
    const pass = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) => new THREE.ShaderMaterial({
      vertexShader: vertex, fragmentShader, uniforms, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false });
    this.blurH = pass(blurShader("vec2(1.0, 0.0)"), { tIn: { value: null }, uStep: { value: new THREE.Vector2() } });
    this.blurV = pass(blurShader("vec2(0.0, 1.0)"), { tIn: { value: null }, uStep: { value: new THREE.Vector2() } });
    this.composite = pass(`uniform sampler2D tSrc, tBlur, tBloom; uniform mat4 uInv; uniform vec3 uEye, uHazeColour; uniform float uGroundY, uFocus, uBloom, uHaze, uDof; varying vec2 vUv;
      float groundDistance(vec2 uv){
        vec4 a = uInv * vec4(uv * 2.0 - 1.0, -1.0, 1.0), b = uInv * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
        vec3 p0 = a.xyz / a.w, p1 = b.xyz / b.w, dir = normalize(p1 - p0);
        if (dir.y > -0.002) return 6000.0;
        return min(6000.0, (uGroundY - uEye.y) / dir.y);
      }
      void main(){
        vec3 base = texture2D(tSrc, vUv).rgb;
        float d = groundDistance(vUv);
        float rel = abs(d - uFocus) / max(uFocus, 1.0);
        vec3 c = mix(base, texture2D(tBlur, vUv).rgb, uDof * smoothstep(0.28, 1.25, rel));
        float haze = uHaze * (1.0 - exp(-max(d - 260.0, 0.0) * 0.0008));
        c = mix(c, uHazeColour, clamp(haze, 0.0, 0.55));
        c += max(texture2D(tBloom, vUv).rgb - 0.74, 0.0) * uBloom;
        gl_FragColor = vec4(c, 1.0); }`, {
      tSrc: { value: null }, tBlur: { value: null }, tBloom: { value: null }, uInv: { value: new THREE.Matrix4() }, uEye: { value: new THREE.Vector3() },
      uHazeColour: { value: new THREE.Color(HAZE_COLOUR).convertLinearToSRGB() }, uGroundY: { value: 0 }, uFocus: { value: 300 }, uBloom: { value: 0 }, uHaze: { value: 0 }, uDof: { value: 0 } });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.composite);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  private resize(width: number, height: number) {
    if (width === this.width && height === this.height) return;
    this.dispose(false);
    this.width = width; this.height = height;
    this.source = new THREE.FramebufferTexture(width, height);
    const target = (w: number, h: number) => new THREE.WebGLRenderTarget(Math.max(2, Math.ceil(w)), Math.max(2, Math.ceil(h)),
      { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    this.half = [target(width / 2, height / 2), target(width / 2, height / 2)];
    this.quarter = [target(width / 4, height / 4), target(width / 4, height / 4)];
  }
  private draw(renderer: THREE.WebGLRenderer, material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = material;
    renderer.setRenderTarget(target);
    renderer.setViewport(0, 0, target ? target.width : this.width, target ? target.height : this.height);
    renderer.render(this.scene, this.camera);
  }
  private blur(renderer: THREE.WebGLRenderer, from: THREE.Texture, targets: THREE.WebGLRenderTarget[], spread: number) {
    const [a, b] = targets;
    this.blurH.uniforms.tIn.value = from; this.blurH.uniforms.uStep.value.set(spread / a.width, 0);
    this.draw(renderer, this.blurH, a);
    this.blurV.uniforms.tIn.value = a.texture; this.blurV.uniforms.uStep.value.set(0, spread / b.height);
    this.draw(renderer, this.blurV, b);
    return b.texture;
  }

  apply(renderer: THREE.WebGLRenderer, gl: WebGL2RenderingContext, p: PostParams): void {
    const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
    this.resize(width, height);
    renderer.setRenderTarget(null);
    renderer.copyFramebufferToTexture(this.source!);
    const halfBlur = this.blur(renderer, this.source!, this.half, 1.6);
    const bloom = p.bloom > 0 ? this.blur(renderer, halfBlur, this.quarter, 2.4) : halfBlur;
    const u = this.composite.uniforms;
    u.tSrc.value = this.source; u.tBlur.value = halfBlur; u.tBloom.value = bloom;
    u.uInv.value.copy(p.inverseProjection); u.uEye.value.copy(p.eye);
    u.uGroundY.value = p.groundY; u.uFocus.value = p.focusMeters; u.uBloom.value = p.bloom; u.uHaze.value = p.haze; u.uDof.value = p.dof;
    this.draw(renderer, this.composite, null);
    renderer.setViewport(0, 0, width, height);
    renderer.resetState();
  }

  dispose(all = true) {
    this.source?.dispose(); for (const t of [...this.half, ...this.quarter]) t.dispose();
    this.source = undefined; this.half = []; this.quarter = []; this.width = this.height = 0;
    if (all) { this.quad.geometry.dispose(); for (const m of [this.blurH, this.blurV, this.composite]) m.dispose(); }
  }
}
