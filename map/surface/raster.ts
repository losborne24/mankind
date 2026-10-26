/** Exact area aggregation of a 2× finer RGBA grid. Alpha is coverage (nodata = 0).
 * Premultiply before averaging so transparent pixels cannot bleed into land.
 * Colours are visual sRGB channels; continuous scientific fields need their own
 * valid-sample weighting, never this display texture function.
 */
export function aggregateCoverageRgba(input: Uint8Array, width: number, height: number): Uint8Array {
  if (width % 2 || height % 2 || width < 2 || height < 2 || input.length !== width * height * 4)
    throw new RangeError('RGBA aggregation requires an even 2D grid');
  const result = new Uint8Array(width * height);
  for (let y = 0; y < height / 2; y++) for (let x = 0; x < width / 2; x++) {
    const offsets = [((2 * y) * width + 2 * x) * 4, ((2 * y) * width + 2 * x + 1) * 4,
      ((2 * y + 1) * width + 2 * x) * 4, ((2 * y + 1) * width + 2 * x + 1) * 4];
    const alpha = offsets.reduce((sum, i) => sum + input[i + 3], 0);
    const out = (y * width / 2 + x) * 4;
    result[out + 3] = Math.round(alpha / 4);
    if (alpha) for (let c = 0; c < 3; c++)
      result[out + c] = Math.round(offsets.reduce((sum, i) => sum + input[i + c] * input[i + 3], 0) / alpha);
  }
  return result;
}
