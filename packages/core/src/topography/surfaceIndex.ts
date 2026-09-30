import Flatbush from 'flatbush';
import type { TinData } from './asset';

/**
 * Consulta de la superficie topográfica en planta: cota y pendiente bajo un punto. Índice
 * espacial de los triángulos (flatbush): se arma en el worker (O(n log n)) y su `data` viaja como
 * `ArrayBuffer` al hilo principal, donde cada consulta es O(log n) (cursor, ajuste de collares).
 */
export class SurfaceIndex {
  private constructor(
    readonly tin: TinData,
    private readonly index: Flatbush | null,
  ) {}

  static build(tin: TinData): SurfaceIndex {
    const nt = tin.triangles.length / 3;
    if (nt === 0) return new SurfaceIndex(tin, null);
    const index = new Flatbush(nt);
    const v = tin.vertices;
    for (let t = 0; t < nt; t++) {
      const a = (tin.triangles[t * 3] ?? 0) * 3;
      const b = (tin.triangles[t * 3 + 1] ?? 0) * 3;
      const c = (tin.triangles[t * 3 + 2] ?? 0) * 3;
      const xa = v[a] ?? 0;
      const ya = v[a + 1] ?? 0;
      const xb = v[b] ?? 0;
      const yb = v[b + 1] ?? 0;
      const xc = v[c] ?? 0;
      const yc = v[c + 1] ?? 0;
      index.add(
        Math.min(xa, xb, xc),
        Math.min(ya, yb, yc),
        Math.max(xa, xb, xc),
        Math.max(ya, yb, yc),
      );
    }
    index.finish();
    return new SurfaceIndex(tin, index);
  }

  /** Reconstruye el índice desde su `data` (sin volver a ordenar). */
  static fromData(tin: TinData, data: ArrayBuffer | null): SurfaceIndex {
    return new SurfaceIndex(tin, data ? Flatbush.from(data) : null);
  }

  /** Buffer del índice, para enviarlo a otro hilo. */
  get data(): ArrayBuffer | null {
    return (this.index?.data as ArrayBuffer | undefined) ?? null;
  }

  /** Triángulo que contiene (x, y) y sus coordenadas baricéntricas, o `null` fuera del TIN. */
  private locate(x: number, y: number): { t: number; w: [number, number, number] } | null {
    if (!this.index) return null;
    const v = this.tin.vertices;
    const tri = this.tin.triangles;
    for (const t of this.index.search(x, y, x, y)) {
      const a = (tri[t * 3] ?? 0) * 3;
      const b = (tri[t * 3 + 1] ?? 0) * 3;
      const c = (tri[t * 3 + 2] ?? 0) * 3;
      const x1 = v[a] ?? 0;
      const y1 = v[a + 1] ?? 0;
      const x2 = v[b] ?? 0;
      const y2 = v[b + 1] ?? 0;
      const x3 = v[c] ?? 0;
      const y3 = v[c + 1] ?? 0;
      const det = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
      if (det === 0) continue;
      const w1 = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / det;
      const w2 = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / det;
      const w3 = 1 - w1 - w2;
      const eps = -1e-9;
      if (w1 >= eps && w2 >= eps && w3 >= eps) return { t, w: [w1, w2, w3] };
    }
    return null;
  }

  /** Cota de la superficie en (x, y) por interpolación lineal en el triángulo, o `null` fuera. */
  elevationAt(x: number, y: number): number | null {
    const hit = this.locate(x, y);
    if (!hit) return null;
    const v = this.tin.vertices;
    const tri = this.tin.triangles;
    const [w1, w2, w3] = hit.w;
    return (
      w1 * (v[(tri[hit.t * 3] ?? 0) * 3 + 2] ?? 0) +
      w2 * (v[(tri[hit.t * 3 + 1] ?? 0) * 3 + 2] ?? 0) +
      w3 * (v[(tri[hit.t * 3 + 2] ?? 0) * 3 + 2] ?? 0)
    );
  }

  /** Pendiente del terreno en (x, y) [rad desde la horizontal], o `null` fuera. */
  slopeAt(x: number, y: number): number | null {
    const hit = this.locate(x, y);
    if (!hit) return null;
    const v = this.tin.vertices;
    const tri = this.tin.triangles;
    const p = [0, 1, 2].map((k) => (tri[hit.t * 3 + k] ?? 0) * 3);
    const [a = 0, b = 0, c = 0] = p;
    const ux = (v[b] ?? 0) - (v[a] ?? 0);
    const uy = (v[b + 1] ?? 0) - (v[a + 1] ?? 0);
    const uz = (v[b + 2] ?? 0) - (v[a + 2] ?? 0);
    const wx = (v[c] ?? 0) - (v[a] ?? 0);
    const wy = (v[c + 1] ?? 0) - (v[a + 1] ?? 0);
    const wz = (v[c + 2] ?? 0) - (v[a + 2] ?? 0);
    const nx = uy * wz - uz * wy;
    const ny = uz * wx - ux * wz;
    const nz = ux * wy - uy * wx;
    return Math.atan2(Math.hypot(nx, ny), Math.abs(nz));
  }
}
