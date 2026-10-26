import type { CustomLayerInterface, CustomTerrainRenderInput, Map as MapLibreMap } from 'maplibre-gl';
import type { EnvironmentClass } from '../environment/model';
import { NATURAL_CANOPY_ALBEDO } from './materials';
import { groundVertexShader, groundFragmentShader } from './shader';

interface MaterialInput { classification: EnvironmentClass; template: string; propertyTileTemplate: string; manifestUrl: string; maxzoom?: number; canopy?: number; normalStrength: number }
interface TexturePair { albedo?: WebGLTexture; properties?: WebGLTexture; abort: AbortController; failed?: boolean }
export const PBR_LAYER_ID = 'natural-ground-pbr';

/** Both parent addressing and geographic origin are independent of map world wrap. */
export function materialTileAddress(z: number, x: number, y: number, maxzoom = 4) {
  if (![z,x,y,maxzoom].every(Number.isInteger) || z < 0 || z > 30 || maxzoom < 0 || maxzoom > 30) throw new RangeError('Invalid XYZ material coordinate');
  const sourceZ = Math.min(z, maxzoom), scale = 2 ** (z - sourceZ);
  const count = 2 ** z; y = Math.max(0, Math.min(count-1, y));
  const wrappedX = ((x % count) + count) % count;
  return { z: sourceZ, x: Math.floor(wrappedX / scale), y: Math.floor(y / scale),
    uv: [(wrappedX % scale) / scale, (y % scale) / scale, 1 / scale] };
}

/** Uses MapLibre 6.15's terrain tile hook: no extra terrain mesh or second canvas.
 * BRDF results live in the native RTT cache; camera settling invalidates them.
 */
export class GroundMaterialLayer implements CustomLayerInterface {
  readonly id = PBR_LAYER_ID;
  readonly type = 'custom' as const;
  readonly renderingMode = '2d' as const;
  terrainTileRevision = 0;
  private map?: MapLibreMap;
  private gl?: WebGL2RenderingContext;
  private program?: WebGLProgram;
  private vao?: WebGLVertexArrayObject;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private cache = new Map<string, TexturePair>();
  private visible = new Set<EnvironmentClass>();
  private enabled = true;
  private alive = false;
  private ready = false;
  private empty = new Set<string>();
  private metadataAbort?: AbortController;
  private cameraState = '';
  private view = [0, 1, 0];
  private lighting = true;
  private failureReported = false;
  readonly stats = { draws: 0, loadedPairs: 0, evictions: 0, failures: 0, shadeMilliseconds: 0, maxTerrainZoom: 0 };

  constructor(private inputs: readonly MaterialInput[], private onFailure: (message: string) => void) {
    inputs.forEach(input => this.visible.add(input.classification));
  }
  private invalidate = () => { this.terrainTileRevision++; this.map?.triggerRepaint(); };
  private updateCamera = () => {
    if (!this.map) return;
    const pitch = this.map.getPitch() * Math.PI / 180, bearing = this.map.getBearing() * Math.PI / 180;
    this.view = [-Math.sin(pitch)*Math.sin(bearing), Math.cos(pitch), Math.sin(pitch)*Math.cos(bearing)];
    const lighting = this.map.getLayoutProperty('terrain-light', 'visibility') !== 'none';
    const state = `${this.map.getPitch()}:${this.map.getBearing()}:${lighting}`;
    if (state !== this.cameraState) {
      this.cameraState = state; this.lighting = lighting; this.invalidate();
    }
  };
  setVisible(classification: EnvironmentClass, visible: boolean) {
    if (visible === this.visible.has(classification)) return;
    if (visible) this.visible.add(classification); else this.visible.delete(classification);
    this.invalidate();
  }
  setEnabled(enabled: boolean) { if (this.enabled !== enabled) { this.enabled = enabled; this.invalidate(); } }

  onAdd(map: MapLibreMap, gl: WebGL2RenderingContext) {
    this.map = map; this.gl = gl; this.alive = true;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw Error('Cannot allocate material shader');
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw Error(`Ground shader: ${log}`);
      }
      return shader;
    };
    try {
      const vertex = compile(gl.VERTEX_SHADER, groundVertexShader);
      let fragment: WebGLShader;
      try { fragment = compile(gl.FRAGMENT_SHADER, groundFragmentShader); } catch (error) { gl.deleteShader(vertex); throw error; }
      const program = gl.createProgram();
      if (!program) { gl.deleteShader(vertex); gl.deleteShader(fragment); throw Error('Cannot allocate material program'); }
      gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
      gl.deleteShader(vertex); gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { const log = gl.getProgramInfoLog(program); gl.deleteProgram(program); throw Error(`Ground program: ${log}`); }
      this.program = program; this.vao = gl.createVertexArray() ?? undefined;
      for (const name of ['u_albedo','u_properties','u_source','u_tile','u_view','u_strength','u_lighting','u_pixelMetres','u_canopy','u_canopyColor']) this.uniforms.set(name, gl.getUniformLocation(program, name));
      this.updateCamera();
      map.on('moveend', this.updateCamera); map.on('styledata', this.updateCamera);
      map.on('webglcontextlost', this.contextLost); map.on('webglcontextrestored', this.contextRestored);
      const metadataAbort = this.metadataAbort = new AbortController();
      const url = this.inputs[0]?.manifestUrl;
      if (url) void fetch(url, {signal:metadataAbort.signal}).then(async response => {
        if (!response.ok) throw Error('PBR manifest unavailable');
        const manifest = await response.json();
        if (manifest.propertiesVersion !== 1 || !Array.isArray(manifest.emptyTiles)) throw Error('PBR properties require surface:prepare');
        if (!this.alive) return;
        this.empty = new Set(manifest.emptyTiles); this.ready = true; this.invalidate();
      }).catch(error => { if (this.alive && !metadataAbort.signal.aborted) this.fail(String(error)); });
    } catch (error) { this.fail(error instanceof Error ? error.message : 'PBR initialization failed'); }
  }
  private contextLost = () => {
    this.alive = false; this.ready = false; this.metadataAbort?.abort();
    for (const pair of this.cache.values()) this.release(pair);
    this.cache.clear(); this.program = undefined; this.vao = undefined;
  };
  private contextRestored = () => {
    const map = this.map, gl = this.gl;
    this.onRemove();
    if (map && gl) { this.onAdd(map, gl); this.invalidate(); }
  };
  private fail(message: string) {
    this.stats.failures++;
    if (!this.failureReported && this.alive) { this.failureReported = true; this.onFailure(message); }
  }
  private pair(input: MaterialInput, z: number, x: number, y: number): TexturePair {
    const key = `${input.classification}/${z}/${x}/${y}`;
    const cached = this.cache.get(key);
    if (cached) { this.cache.delete(key); this.cache.set(key, cached); return cached; }
    const pair: TexturePair = { abort: new AbortController() };
    this.cache.set(key, pair);
    // 64 pairs ≤128 MiB uncompressed textures. Images are closed after upload.
    while (this.cache.size > 64) {
      const oldest = this.cache.keys().next().value!;
      const old = this.cache.get(oldest)!; this.release(old); this.cache.delete(oldest); this.stats.evictions++;
    }
    const albedoUrl = input.template.replace('{z}',String(z)).replace('{x}',String(x)).replace('{y}',String(y));
    const propertiesUrl = input.propertyTileTemplate.replace('{z}',String(z)).replace('{x}',String(x)).replace('{y}',String(y));
    const load = async (url: string) => {
      const response = await fetch(url, { signal: pair.abort.signal });
      if (!response.ok) throw Error(`Material tile HTTP ${response.status}`);
      return createImageBitmap(await response.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    };
    void Promise.allSettled([load(albedoUrl), load(propertiesUrl)]).then(results => {
      const images = results.flatMap(r => r.status === 'fulfilled' ? [r.value] : []);
      if (!this.alive || pair.abort.signal.aborted || results.some(r => r.status === 'rejected')) {
        images.forEach(image => image.close());
        if (!pair.abort.signal.aborted && this.alive) { pair.failed = true; this.fail('PBR material inputs unavailable; showing albedo terrain.'); }
        return;
      }
      const gl = this.gl!;
      // Async upload must restore shared GL state, unlike a MapLibre draw callback.
      const binding = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
      const flip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL) as boolean;
      const premultiply = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL) as boolean;
      try {
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        const upload = (image: ImageBitmap) => {
          const texture = gl.createTexture(); if (!texture) throw Error('Material texture allocation failed');
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
          return texture;
        };
        pair.albedo = upload(images[0]); pair.properties = upload(images[1]); this.stats.loadedPairs++;
      } catch (error) { this.release(pair); this.fail(String(error)); }
      finally {
        images.forEach(image => image.close()); gl.bindTexture(gl.TEXTURE_2D,binding);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,flip); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,premultiply);
      }
      this.invalidate();
    });
    return pair;
  }
  // Native raster layers remain the fallback with terrain disabled.
  render() {}
  renderToTerrainTile(gl: WebGL2RenderingContext, options: CustomTerrainRenderInput) {
    if (!this.program || !this.ready) return;
    const start = performance.now();
    const tile = options.tileID.canonical;
    this.stats.maxTerrainZoom = Math.max(this.stats.maxTerrainZoom, tile.z);
    gl.useProgram(this.program); gl.bindVertexArray(this.vao ?? null);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.STENCIL_TEST); gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1i(this.uniforms.get('u_albedo')!,0); gl.uniform1i(this.uniforms.get('u_properties')!,1);
    gl.uniform3f(this.uniforms.get('u_tile')!,tile.x / 2 ** tile.z,tile.y / 2 ** tile.z,1 / 2 ** tile.z);
    gl.uniform3fv(this.uniforms.get('u_view')!, this.view);
    gl.uniform1f(this.uniforms.get('u_lighting')!, this.lighting && this.enabled ? 1 : 0);
    gl.uniform3fv(this.uniforms.get('u_canopyColor')!, NATURAL_CANOPY_ALBEDO.map(c => c/255));
    const latitude = Math.atan(Math.sinh(Math.PI*(1-2*(tile.y+.5)/2**tile.z)));
    gl.uniform1f(this.uniforms.get('u_pixelMetres')!,40075016.6856*Math.cos(latitude)/(2**tile.z*options.width));
    for (const input of this.inputs) {
      const source = materialTileAddress(tile.z,tile.x,tile.y,input.maxzoom);
      if (!this.visible.has(input.classification) || this.empty.has(`${input.classification}/${source.z}/${source.x}/${source.y}`)) continue;
      const textures = this.pair(input,source.z,source.x,source.y);
      if (!textures.albedo || !textures.properties) continue;
      gl.uniform3fv(this.uniforms.get('u_source')!, source.uv);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,textures.albedo);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,textures.properties);
      gl.uniform1f(this.uniforms.get('u_strength')!,input.normalStrength);
      gl.uniform1f(this.uniforms.get('u_canopy')!,input.canopy ?? 0);
      gl.drawArrays(gl.TRIANGLES,0,3); this.stats.draws++;
    }
    this.stats.shadeMilliseconds += performance.now()-start;
  }
  private release(pair: TexturePair) {
    pair.abort.abort();
    if (pair.albedo) this.gl?.deleteTexture(pair.albedo);
    if (pair.properties) this.gl?.deleteTexture(pair.properties);
    pair.albedo = pair.properties = undefined;
  }
  onRemove() {
    this.alive = false; this.ready = false; this.metadataAbort?.abort(); this.map?.off('moveend',this.updateCamera); this.map?.off('styledata',this.updateCamera);
    this.map?.off('webglcontextlost',this.contextLost); this.map?.off('webglcontextrestored',this.contextRestored);
    for (const pair of this.cache.values()) this.release(pair);
    this.cache.clear();
    if (this.program) this.gl?.deleteProgram(this.program);
    if (this.vao) this.gl?.deleteVertexArray(this.vao);
    this.program = undefined; this.vao = undefined; this.map = undefined;
  }
}
