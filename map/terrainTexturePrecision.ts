import type { Map } from "maplibre-gl";

type TerrainTileManager = NonNullable<Map["terrain"]>["tileManager"];
interface TileCoordinate {
  canonical: { z: number; x: number; y: number };
  wrap: number;
}

/**
 * MapLibre 6.15 terrain RTT uses EXTENT >> zoomDifference. At differences > 13
 * its 8192-unit extent becomes zero, producing non-finite projection matrices.
 * Express the same tile-to-tile orthographic transform without integer rounding.
 * No DEM, mesh density, source tiles or geographic coordinates change.
 */
export function terrainTextureProjection(source: TileCoordinate, target: TileCoordinate, wrapped = false): Float32Array {
  const scale = 2 ** (target.canonical.z - source.canonical.z);
  const sourceX = source.canonical.x + (wrapped ? source.wrap * 2 ** source.canonical.z : 0);
  const dx = scale * sourceX - target.canonical.x;
  const dy = scale * source.canonical.y - target.canonical.y;
  return new Float32Array([
    2 * scale / 8192, 0, 0, 0,
    0, -2 * scale / 8192, 0, 0,
    0, 0, -2, 0,
    2 * dx - 1, 1 - 2 * dy, -1, 1,
  ]);
}

/** Version-specific adapter: keep MapLibre's tile selection and valid matrices. */
export function repairTerrainTextureCoordinates(manager: TerrainTileManager): () => void {
  const original = manager.getTerrainCoords;
  const corrected: typeof original = function (tile, ranges) {
    const coordinates = original.call(manager, tile, ranges);
    for (const [key, coordinate] of Object.entries(coordinates)) {
      const matrix = coordinate.terrainRttPosMatrix32f;
      if (!matrix || matrix.every(Number.isFinite)) continue;
      coordinate.terrainRttPosMatrix32f = terrainTextureProjection(
        coordinate, manager.getTileByID(key).tileID, ranges !== undefined,
      );
    }
    return coordinates;
  };
  manager.getTerrainCoords = corrected;
  return () => {
    if (manager.getTerrainCoords === corrected) manager.getTerrainCoords = original;
  };
}

/** Install before style loading; setTerrain/exaggeration creates a new manager. */
export function attachTerrainTexturePrecision(map: Map): () => void {
  let current: TerrainTileManager | undefined;
  let restore = () => {};
  const install = () => {
    const manager = map.terrain?.tileManager;
    if (manager === current) return;
    restore();
    current = manager;
    restore = manager ? repairTerrainTextureCoordinates(manager) : () => {};
  };
  map.on("terrain", install);
  install();
  return () => {
    map.off("terrain", install);
    restore();
  };
}
