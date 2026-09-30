export interface DecimateOptions {
  /** Lado de la celda de la grilla [m]. Supuesto S-14: 0,5 m. */
  cell: number;
  /**
   * Qué punto conserva cada celda: la cota mínima (el suelo, sin equipos ni vegetación; S-14),
   * la mediana o el promedio.
   */
  keep: 'min' | 'median' | 'mean';
}

export const DEFAULT_DECIMATE: DecimateOptions = { cell: 0.5, keep: 'min' };

/**
 * Reduce una nube de puntos x, y, z a un punto por celda de una grilla en planta, en el centro de
 * masa en planta de la celda y con la cota según `keep`. O(n): corre en el worker.
 */
export function decimateGrid(
  points: Float64Array,
  options: DecimateOptions = DEFAULT_DECIMATE,
): Float64Array {
  const cell = options.cell > 0 ? options.cell : DEFAULT_DECIMATE.cell;
  const cells = new Map<number, number[]>();
  const n = Math.floor(points.length / 3);
  if (n === 0) return new Float64Array(0);
  const x0 = points[0] ?? 0;
  const y0 = points[1] ?? 0;
  for (let i = 0; i < n; i++) {
    const cx = Math.floor(((points[i * 3] ?? 0) - x0) / cell);
    const cy = Math.floor(((points[i * 3 + 1] ?? 0) - y0) / cell);
    // Clave numérica (evita cadenas): celdas dentro de ±2^20 en cada eje.
    const key = (cx + 1048576) * 2097152 + (cy + 1048576);
    let list = cells.get(key);
    if (!list) {
      list = [];
      cells.set(key, list);
    }
    list.push(i);
  }
  const out = new Float64Array(cells.size * 3);
  let k = 0;
  for (const idx of cells.values()) {
    let sx = 0;
    let sy = 0;
    const zs: number[] = [];
    for (const i of idx) {
      sx += points[i * 3] ?? 0;
      sy += points[i * 3 + 1] ?? 0;
      zs.push(points[i * 3 + 2] ?? 0);
    }
    let z: number;
    // Sin `Math.min(...zs)`: una celda grande con muchos puntos desborda la pila.
    if (options.keep === 'min') z = zs.reduce((a, b) => (b < a ? b : a), Infinity);
    else if (options.keep === 'mean') z = zs.reduce((a, b) => a + b, 0) / zs.length;
    else {
      zs.sort((a, b) => a - b);
      z = zs[Math.floor(zs.length / 2)] ?? 0;
    }
    out[k++] = sx / idx.length;
    out[k++] = sy / idx.length;
    out[k++] = z;
  }
  return out;
}
