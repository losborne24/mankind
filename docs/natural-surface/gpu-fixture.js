/* Paste into the local development preview's DevTools Console.
 * This is an isolated synthetic GPU fixture, not environmental/source data.
 * It compiles the actual live terrain shaders into a temporary offscreen context.
 */
(() => {
  const layer = window.__globe.environment.ground;
  const original = layer.gl;
  const gl = new OffscreenCanvas(4, 4).getContext('webgl2');
  const program = gl.createProgram();
  for (const shader of original.getAttachedShaders(layer.program)) {
    const copy = gl.createShader(original.getShaderParameter(shader, original.SHADER_TYPE));
    gl.shaderSource(copy, original.getShaderSource(shader));
    gl.compileShader(copy);
    if (!gl.getShaderParameter(copy, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(copy));
    gl.attachShader(program, copy);
    gl.deleteShader(copy);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const uniform = name => gl.getUniformLocation(program, name);
  gl.uniform1i(uniform('u_albedo'), 0);
  gl.uniform1i(uniform('u_properties'), 1);
  gl.uniform3f(uniform('u_source'), 0, 0, 1);
  gl.uniform3f(uniform('u_tile'), .5, .5, .0000001);
  gl.uniform3f(uniform('u_view'), .45, .82, .35);
  gl.uniform1f(uniform('u_lighting'), 1);
  gl.uniform1f(uniform('u_pixelMetres'), 1);
  const textures = [];
  function texture(unit, bytes) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    const handle = gl.createTexture();
    textures.push(handle);
    gl.bindTexture(gl.TEXTURE_2D, handle);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(bytes));
  }
  texture(0, [128, 128, 128, 255]);
  function draw(east, roughness, strength) {
    texture(1, [east, 128, roughness, 255]);
    gl.uniform1f(uniform('u_strength'), strength);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const pixels = new Uint8Array(64);
    gl.readPixels(0, 0, 4, 4, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return [...pixels];
  }
  const flat = draw(128, 240, 0);
  const smooth = draw(128, 30, 0);
  const sloped = draw(210, 240, 0);
  const detail = draw(128, 240, 1);
  gl.uniform1f(uniform('u_canopy'), 1);
  gl.uniform3f(uniform('u_canopyColor'), .2, .3, .15);
  gl.uniform1f(uniform('u_lighting'), 0);
  gl.uniform1f(uniform('u_pixelMetres'), 10000);
  const canopyFar = draw(128, 240, 0);
  gl.uniform1f(uniform('u_pixelMetres'), 1);
  const canopyNear = draw(128, 240, 0);
  const result = {
    flat: flat.slice(0, 4), smooth: smooth.slice(0, 4), sloped: sloped.slice(0, 4),
    roughnessChangesPixels: flat.some((v, i) => v !== smooth[i]),
    normalChangesPixels: flat.some((v, i) => v !== sloped[i]),
    detailChangesPixels: flat.some((v, i) => v !== detail[i]),
    canopyStableAcrossZoom: canopyFar.every((v, i) => v === canopyNear[i]),
    canopyIsGreen: canopyFar[1] > canopyFar[0] && canopyFar[1] > canopyFar[2],
    glError: gl.getError(),
  };
  textures.forEach(handle => gl.deleteTexture(handle));
  gl.deleteProgram(program);
  gl.deleteVertexArray(vao);
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  console.assert(result.roughnessChangesPixels && result.normalChangesPixels && result.detailChangesPixels && result.canopyStableAcrossZoom && result.canopyIsGreen && result.glError === 0, result);
  console.log(JSON.stringify(result));
  return result;
})()
