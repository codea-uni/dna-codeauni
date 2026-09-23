import { GridHelper } from 'three';

/** Grilla de referencia en el plano XY (Z arriba), en metros. */
export function createGrid(size = 2000, cellSize = 10): GridHelper {
  const grid = new GridHelper(size, Math.round(size / cellSize), 0x5a6b7d, 0x2b3642);
  // GridHelper se crea en el plano XZ; lo giramos al plano XY.
  grid.rotation.x = Math.PI / 2;
  return grid;
}
