/** RESOLVE 2017 biome numbers; no elevation or random geographic assignment. */
export const BIOME_CLASSES = {
  1: 'forest', 2: 'forest', 3: 'forest', 4: 'forest', 5: 'forest', 6: 'forest',
  7: 'grassland', 8: 'grassland', 9: 'wetland', 10: 'grassland',
  // Tundra and the source's combined Rock and Ice region remain neutral.
  11: null, 12: 'shrubland', 13: 'desert', 14: 'wetland',
};

export function classifyEcoregion(properties) {
  if (properties.ECO_ID === 0) return null;
  return BIOME_CLASSES[properties.BIOME_NUM] ?? null;
}
