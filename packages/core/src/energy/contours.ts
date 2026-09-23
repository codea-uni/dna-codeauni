/** Grilla regular de valores: celda (i, j) centrada en origin + ((i + ½)·cell, (j + ½)·cell). */
export interface ScalarGrid {
  originX: number;
  originY: number;
  cellSize: number;
  nx: number;
  ny: number;
  /** Fila mayor: values[j · nx + i]. */
  values: Float32Array;
}

export interface Contours {
  /** Segmentos [x1, y1, x2, y2, …] en las coordenadas de la grilla. */
  segments: Float64Array;
  /** Nivel de cada segmento. */
  levels: Float32Array;
}

/**
 * Marching squares sobre los centros de celda, con interpolación lineal en las aristas.
 * Los casos de silla (5 y 10) se resuelven con el promedio de las cuatro esquinas.
 */
export function marchingSquares(grid: ScalarGrid, levels: readonly number[]): Contours {
  const { nx, ny, values, cellSize, originX, originY } = grid;
  let segs = new Float64Array(4096);
  let lv = new Float32Array(1024);
  let n = 0;
  const emit = (x1: number, y1: number, x2: number, y2: number, level: number) => {
    if (n === lv.length) {
      const s2 = new Float64Array(segs.length * 2);
      s2.set(segs);
      segs = s2;
      const l2 = new Float32Array(lv.length * 2);
      l2.set(lv);
      lv = l2;
    }
    segs[n * 4] = x1;
    segs[n * 4 + 1] = y1;
    segs[n * 4 + 2] = x2;
    segs[n * 4 + 3] = y2;
    lv[n] = level;
    n++;
  };
  // Puntos por arista: 0 = inferior (v0→v1), 1 = derecha (v1→v2), 2 = superior (v3→v2), 3 = izquierda (v0→v3).
  const px = new Float64Array(4);
  const py = new Float64Array(4);
  // Pares de aristas por caso (−1 = sin segmento); casos de silla aparte.
  const TABLE: readonly (readonly number[])[] = [
    [],
    [3, 0],
    [0, 1],
    [3, 1],
    [1, 2],
    [],
    [0, 2],
    [3, 2],
    [3, 2],
    [0, 2],
    [],
    [1, 2],
    [3, 1],
    [0, 1],
    [3, 0],
    [],
  ];
  for (const level of levels) {
    for (let j = 0; j < ny - 1; j++) {
      const y0 = originY + (j + 0.5) * cellSize;
      for (let i = 0; i < nx - 1; i++) {
        const v0 = values[j * nx + i] ?? 0;
        const v1 = values[j * nx + i + 1] ?? 0;
        const v2 = values[(j + 1) * nx + i + 1] ?? 0;
        const v3 = values[(j + 1) * nx + i] ?? 0;
        const c =
          (v0 > level ? 1 : 0) | (v1 > level ? 2 : 0) | (v2 > level ? 4 : 0) | (v3 > level ? 8 : 0);
        if (c === 0 || c === 15) continue;
        const x0 = originX + (i + 0.5) * cellSize;
        const f = (a: number, b: number) => (a === b ? 0.5 : (level - a) / (b - a));
        px[0] = x0 + f(v0, v1) * cellSize;
        py[0] = y0;
        px[1] = x0 + cellSize;
        py[1] = y0 + f(v1, v2) * cellSize;
        px[2] = x0 + f(v3, v2) * cellSize;
        py[2] = y0 + cellSize;
        px[3] = x0;
        py[3] = y0 + f(v0, v3) * cellSize;
        if (c === 5 || c === 10) {
          // Silla: el promedio de las esquinas decide cómo se conectan.
          const center = (v0 + v1 + v2 + v3) / 4 > level;
          const pairs = (c === 5) === center ? [3, 2, 0, 1] : [3, 0, 1, 2];
          for (let k = 0; k < 4; k += 2) {
            const a = pairs[k] ?? 0;
            const b = pairs[k + 1] ?? 0;
            emit(px[a] ?? 0, py[a] ?? 0, px[b] ?? 0, py[b] ?? 0, level);
          }
          continue;
        }
        const pair = TABLE[c];
        if (!pair || pair.length < 2) continue;
        const a = pair[0] ?? 0;
        const b = pair[1] ?? 0;
        emit(px[a] ?? 0, py[a] ?? 0, px[b] ?? 0, py[b] ?? 0, level);
      }
    }
  }
  return { segments: segs.slice(0, n * 4), levels: lv.slice(0, n) };
}
