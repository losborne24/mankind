/**
 * Detect whether the browser can provide the WebGL context MapLibre + Three.js
 * need. MapLibre GL JS v6 renders through **WebGL 2**, so that is what we probe
 * for. Must only be called in the browser.
 */
export function isWebGL2Available(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    return gl instanceof WebGL2RenderingContext;
  } catch {
    return false;
  }
}
