/** Natural Earth polygon edges at sea level, outside MapLibre's terrain drape. */
import * as THREE from "three";
import { MercatorCoordinate } from "maplibre-gl";
import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
  GeoJSONSource,
  Map as MapLibreMap,
} from "maplibre-gl";

export class CoastlineLayer implements CustomLayerInterface {
  readonly type = "custom" as const;
  readonly renderingMode = "2d" as const;
  readonly minzoom: number;
  ready = false;
  private disposed = false;
  private mapZoom?: () => number;
  private renderer?: THREE.WebGLRenderer;
  private geometry = new THREE.BufferGeometry();
  private materials = new Map<string, THREE.RawShaderMaterial>();
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private lines?: THREE.Mesh;

  constructor(
    readonly id: string,
    private readonly source: string,
    private readonly color: string,
    minzoom = 0,
    private readonly onReady?: () => void,
  ) {
    this.minzoom = minzoom;
  }

  onAdd(map: MapLibreMap, gl: WebGL2RenderingContext): void {
    this.mapZoom = () => map.getZoom();
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl });
    this.renderer.autoClear = false;
    // Read the exact same source as the fill; no second geography download.
    void (map.getSource(this.source) as GeoJSONSource).getData().then((data) => {
      if (this.disposed || data.type !== "FeatureCollection") return;
      const vertices: number[] = [];
      const neighbors: number[] = [];
      const sides: number[] = [];
      const edges: number[] = [];
      const ring = (points: number[][]) => {
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1], b = points[i];
          // Exclude dataset closure edges at the antimeridian and poles.
          if (Math.abs(a[0] - b[0]) > 180 || Math.abs(a[1]) === 90 || Math.abs(b[1]) === 90) continue;
          if (Math.abs(a[0]) > 179.999 && Math.abs(b[0]) > 179.999) continue;
          const p = MercatorCoordinate.fromLngLat([a[0], a[1]]);
          const q = MercatorCoordinate.fromLngLat([b[0], b[1]]);
          // Two triangles per segment: screen-space width is portable across
          // WebGL implementations that clamp native line widths to one pixel.
          const ends = [p, p, q, q, p, q];
          const others = [q, q, p, p, q, p];
          for (let j = 0; j < ends.length; j++) {
            vertices.push(ends[j].x, ends[j].y, 0);
            neighbors.push(others[j].x, others[j].y);
          }
          sides.push(1, -1, -1, -1, -1, 1);
          edges.push(1, -1, 1, 1, -1, -1);
        }
      };
      for (const feature of data.features) {
        const geometry = feature.geometry;
        if (!geometry) continue;
        if (geometry.type === "Polygon") geometry.coordinates.forEach(ring);
        if (geometry.type === "MultiPolygon") geometry.coordinates.forEach((p: number[][][]) => p.forEach(ring));
      }
      this.geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      this.geometry.setAttribute("neighbor", new THREE.Float32BufferAttribute(neighbors, 2));
      this.geometry.setAttribute("side", new THREE.Float32BufferAttribute(sides, 1));
      this.geometry.setAttribute("edgeSide", new THREE.Float32BufferAttribute(edges, 1));
      this.ready = true;
      this.onReady?.();
      map.triggerRepaint();
    }).catch((error: unknown) => {
      if (!this.disposed) console.error("Could not prepare Natural Earth coastline", error);
    });
  }

  render(gl: WebGL2RenderingContext, args: CustomRenderMethodInput): void {
    if (!this.ready || !this.renderer) return;
    const shader = args.shaderData;
    let material = this.materials.get(shader.variantName);
    if (!material) {
      material = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: `precision highp float;
          ${shader.define}
          ${shader.vertexShaderPrelude}
          in vec3 position;
          in vec2 neighbor;
          in float side;
          in float edgeSide;
          uniform vec2 viewport;
          uniform float coastWidth;
          out float edge;
          void main() {
            vec4 p = projectTile(position.xy);
            vec4 q = projectTile(neighbor);
            // Segments behind the camera must not extrude across the viewport.
            if (p.w <= 0.0 || q.w <= 0.0) {
              gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
              edge = edgeSide;
              return;
            }
            vec2 delta = (q.xy / q.w - p.xy / p.w) * viewport;
            vec2 normal = vec2(-delta.y, delta.x) / max(length(delta), 0.0001);
            p.xy += normal * side * (coastWidth + 1.0) / viewport * p.w;
            gl_Position = p;
            edge = edgeSide;
          }`,
        fragmentShader: `precision highp float;
          uniform vec3 coastColor;
          in float edge;
          out vec4 fragColor;
          void main() {
            float alpha = 1.0 - smoothstep(1.0 - fwidth(edge), 1.0, abs(edge));
            fragColor = vec4(coastColor, alpha);
          }`,
        uniforms: {
          coastColor: { value: new THREE.Color(this.color).convertLinearToSRGB() },
          viewport: { value: new THREE.Vector2() },
          coastWidth: { value: 1 },
          u_projection_matrix: { value: new THREE.Matrix4() },
          u_projection_fallback_matrix: { value: new THREE.Matrix4() },
          u_projection_tile_mercator_coords: { value: new THREE.Vector4() },
          u_projection_clipping_plane: { value: new THREE.Vector4() },
          u_projection_transition: { value: 0 },
        },
        // The coastline is a cartographic sea-level overlay: never sample DEM
        // heights or the drape texture, and never write into the terrain depth.
        transparent: true,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      this.materials.set(shader.variantName, material);
    }
    const canvas = this.renderer.domElement;
    const pixelRatio = canvas.width / Math.max(canvas.clientWidth, 1);
    // Slightly stronger definition at regional zoom; keep the orbital view quiet.
    const zoom = Math.min(Math.max(this.mapZoom?.() ?? 0, 0), 6);
    material.uniforms.coastWidth.value = (0.65 + zoom / 6 * 1.25) * pixelRatio;
    material.uniforms.viewport.value.set(gl.drawingBufferWidth, gl.drawingBufferHeight);
    const projection = args.defaultProjectionData;
    material.uniforms.u_projection_matrix.value.fromArray(projection.mainMatrix);
    material.uniforms.u_projection_fallback_matrix.value.fromArray(projection.fallbackMatrix);
    material.uniforms.u_projection_tile_mercator_coords.value.fromArray(projection.tileMercatorCoords);
    material.uniforms.u_projection_clipping_plane.value.fromArray(projection.clippingPlane);
    material.uniforms.u_projection_transition.value = projection.projectionTransition;
    if (!this.lines) {
      this.lines = new THREE.Mesh(this.geometry, material);
      this.lines.frustumCulled = false;
      this.scene.add(this.lines);
    }
    this.lines.material = material;
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    this.renderer.resetState();
  }

  onRemove(): void {
    this.disposed = true;
    this.mapZoom = undefined;
    this.geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
    this.scene.clear();
    this.renderer?.dispose();
  }
}
