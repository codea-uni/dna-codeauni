/**
 * Grilla de alturas de la pila (A7): terreno fijo (`base`) más material suelto encima. El
 * material se deposita repartido en las celdas vecinas y se relaja al ángulo de reposo con un
 * algoritmo de avalancha que conserva el volumen exactamente (solo mueve material suelto).
 */

/** Retícula regular: celda (i, j) centrada en (x0 + (i + ½)·cell, y0 + (j + ½)·cell). */
export interface Lattice {
  x0: number;
  y0: number;
  cell: number;
  nx: number;
  ny: number;
}

/** Tolerancia de la relajación: exceso de desnivel sobre el de reposo que se acepta [m]. */
export const REPOSE_TOLERANCE = 1e-3;

const OFFSETS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export class Heightmap {
  /** Cota total [m] = base + material suelto. */
  readonly h: Float64Array;
  private readonly queue: Int32Array;
  private readonly queued: Uint8Array;
  private head = 0;
  private size = 0;
  private readonly drop: Float64Array;

  constructor(
    readonly lattice: Lattice,
    /** Terreno fijo [m] (no se relaja). */
    readonly base: Float64Array,
    reposeAngle: number,
  ) {
    this.h = Float64Array.from(base);
    const n = lattice.nx * lattice.ny;
    this.queue = new Int32Array(n);
    this.queued = new Uint8Array(n);
    const tan = Math.tan(reposeAngle);
    // Desnivel máximo estable hacia cada vecino (lado o diagonal).
    this.drop = Float64Array.from(OFFSETS, ([di, dj]) => tan * lattice.cell * Math.hypot(di, dj));
  }

  /** Índice de la celda que contiene (x, y), acotado a la grilla. */
  cellAt(x: number, y: number): [number, number] {
    const { x0, y0, cell, nx, ny } = this.lattice;
    const i = Math.min(nx - 1, Math.max(0, Math.floor((x - x0) / cell)));
    const j = Math.min(ny - 1, Math.max(0, Math.floor((y - y0) / cell)));
    return [i, j];
  }

  /** Cota en (x, y) por interpolación bilineal entre centros de celda. */
  heightAt(x: number, y: number): number {
    const { x0, y0, cell, nx, ny } = this.lattice;
    const fx = Math.min(nx - 1, Math.max(0, (x - x0) / cell - 0.5));
    const fy = Math.min(ny - 1, Math.max(0, (y - y0) / cell - 0.5));
    const i = Math.min(nx - 2, Math.floor(fx));
    const j = Math.min(ny - 2, Math.floor(fy));
    if (i < 0 || j < 0) return this.h[this.cellAt(x, y)[1] * nx + this.cellAt(x, y)[0]] ?? 0;
    const tx = fx - i;
    const ty = fy - j;
    const k = j * nx + i;
    const a = this.h[k] ?? 0;
    const b = this.h[k + 1] ?? 0;
    const c = this.h[k + nx] ?? 0;
    const d = this.h[k + nx + 1] ?? 0;
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }

  /** ¿Está (x, y) dentro de la grilla? */
  contains(x: number, y: number): boolean {
    const { x0, y0, cell, nx, ny } = this.lattice;
    return x >= x0 && y >= y0 && x < x0 + nx * cell && y < y0 + ny * cell;
  }

  /**
   * Deposita `volume` [m³] de material suelto en (x, y): se reparte con pesos bilineales entre los
   * cuatro centros de celda vecinos (la suma de los pesos es 1: el volumen se conserva) y se relaja
   * (o queda en cola si `relax` es falso, para relajar un lote de depósitos juntos).
   */
  deposit(x: number, y: number, volume: number, relax = true): void {
    const { x0, y0, cell, nx, ny } = this.lattice;
    const fx = (x - x0) / cell - 0.5;
    const fy = (y - y0) / cell - 0.5;
    const i0 = Math.floor(fx);
    const j0 = Math.floor(fy);
    const tx = fx - i0;
    const ty = fy - j0;
    const dh = volume / (cell * cell);
    const put = (i: number, j: number, w: number) => {
      if (w <= 0) return;
      const ii = Math.min(nx - 1, Math.max(0, i));
      const jj = Math.min(ny - 1, Math.max(0, j));
      const k = jj * nx + ii;
      this.h[k] = (this.h[k] ?? 0) + dh * w;
      this.push(k);
    };
    put(i0, j0, (1 - tx) * (1 - ty));
    put(i0 + 1, j0, tx * (1 - ty));
    put(i0, j0 + 1, (1 - tx) * ty);
    put(i0 + 1, j0 + 1, tx * ty);
    if (relax) this.relax();
  }

  private push(k: number): void {
    if (this.queued[k]) return;
    this.queued[k] = 1;
    const n = this.queue.length;
    this.queue[(this.head + this.size) % n] = k;
    this.size++;
  }

  private pop(): number {
    const k = this.queue[this.head] ?? 0;
    this.head = (this.head + 1) % this.queue.length;
    this.size--;
    this.queued[k] = 0;
    return k;
  }

  /**
   * Avalancha: mientras una celda con material suelto supere el desnivel de reposo hacia su vecino
   * más bajo (8 vecinos), le pasa la mitad del exceso, sin quitar más material suelto del que tiene.
   * Cola FIFO: el resultado es determinista.
   */
  relax(): void {
    const { nx, ny } = this.lattice;
    const h = this.h;
    while (this.size > 0) {
      const k = this.pop();
      const i = k % nx;
      const j = (k - i) / nx;
      const loose = (h[k] ?? 0) - (this.base[k] ?? 0);
      if (loose <= 0) continue;
      let best = -1;
      let bestExcess = REPOSE_TOLERANCE;
      for (let o = 0; o < OFFSETS.length; o++) {
        const off = OFFSETS[o];
        if (!off) continue;
        const ii = i + off[0];
        const jj = j + off[1];
        if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
        const n = jj * nx + ii;
        const excess = (h[k] ?? 0) - (h[n] ?? 0) - (this.drop[o] ?? 0);
        if (excess > bestExcess) {
          bestExcess = excess;
          best = n;
        }
      }
      if (best < 0) continue;
      const moved = Math.min(bestExcess / 2, loose);
      h[k] = (h[k] ?? 0) - moved;
      h[best] = (h[best] ?? 0) + moved;
      this.push(best);
      this.push(k);
      // Al bajar esta celda solo pueden quedar inestables sus vecinos más altos que ella
      // (y con material suelto): los demás no cambian su desnivel hacia abajo.
      const hk = h[k] ?? 0;
      for (let o = 0; o < OFFSETS.length; o++) {
        const off = OFFSETS[o];
        if (!off) continue;
        const ii = i + off[0];
        const jj = j + off[1];
        if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
        const nb = jj * nx + ii;
        const hn = h[nb] ?? 0;
        if (hn - hk > (this.drop[o] ?? 0) + REPOSE_TOLERANCE && hn - (this.base[nb] ?? 0) > 0)
          this.push(nb);
      }
    }
  }

  /** Mayor exceso de desnivel sobre el de reposo donde hay material suelto [m] (ver `reposeExcess`). */
  maxReposeExcess(): number {
    return reposeExcess(this.h, this.base, this.lattice, this.drop);
  }

  /** Volumen de material suelto sobre la base [m³]. */
  looseVolume(): number {
    let v = 0;
    for (let k = 0; k < this.h.length; k++) v += (this.h[k] ?? 0) - (this.base[k] ?? 0);
    return v * this.lattice.cell * this.lattice.cell;
  }
}

/**
 * Mayor exceso de desnivel sobre el de reposo entre celdas vecinas (8) cuando la más alta tiene
 * material suelto [m]; 0 si todo está en reposo. `drop` = desnivel estable por vecino, o el ángulo.
 */
export function reposeExcess(
  h: ArrayLike<number>,
  base: ArrayLike<number>,
  lattice: Lattice,
  drop: ArrayLike<number> | number,
): number {
  const { nx, ny } = lattice;
  const stable =
    typeof drop === 'number'
      ? OFFSETS.map(([di, dj]) => Math.tan(drop) * lattice.cell * Math.hypot(di, dj))
      : Array.from(drop);
  let worst = 0;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const hk = h[k] ?? 0;
      if (hk - (base[k] ?? 0) <= 1e-6) continue;
      for (let o = 0; o < OFFSETS.length; o++) {
        const off = OFFSETS[o];
        if (!off) continue;
        const ii = i + off[0];
        const jj = j + off[1];
        if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
        worst = Math.max(worst, hk - (h[jj * nx + ii] ?? 0) - (stable[o] ?? 0));
      }
    }
  return worst;
}
