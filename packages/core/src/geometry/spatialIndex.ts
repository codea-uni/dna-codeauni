import Flatbush from 'flatbush';
import type { Vec2 } from '../model/types';
import { pointInPolygon, polygonBounds } from './polygon';

/**
 * Índice espacial 2D estático de puntos (R-tree empaquetado, flatbush).
 * Se reconstruye tras cambios estructurales; con 20.000 puntos cuesta ~1–2 ms.
 */
export class PointIndex<T> {
  private readonly tree: Flatbush | null;

  constructor(
    private readonly ids: readonly T[],
    private readonly xs: Float64Array,
    private readonly ys: Float64Array,
  ) {
    if (ids.length === 0) {
      this.tree = null;
      return;
    }
    const tree = new Flatbush(ids.length);
    for (let i = 0; i < ids.length; i++) {
      const x = xs[i] ?? 0;
      const y = ys[i] ?? 0;
      tree.add(x, y, x, y);
    }
    tree.finish();
    this.tree = tree;
  }

  get size(): number {
    return this.ids.length;
  }

  /** Punto más cercano dentro de `maxDistance`, o null. */
  nearest(
    x: number,
    y: number,
    maxDistance: number,
    exclude?: (id: T) => boolean,
  ): { id: T; x: number; y: number } | null {
    if (!this.tree) return null;
    const filter = exclude ? (i: number) => !exclude(this.ids[i] as T) : undefined;
    const [i] = this.tree.neighbors(x, y, 1, maxDistance, filter);
    if (i === undefined) return null;
    return { id: this.ids[i] as T, x: this.xs[i] ?? 0, y: this.ys[i] ?? 0 };
  }

  inBox(minX: number, minY: number, maxX: number, maxY: number): T[] {
    if (!this.tree) return [];
    return this.tree.search(minX, minY, maxX, maxY).map((i) => this.ids[i] as T);
  }

  inPolygon(polygon: readonly Vec2[]): T[] {
    if (!this.tree || polygon.length < 3) return [];
    const b = polygonBounds(polygon);
    return this.tree
      .search(b.minX, b.minY, b.maxX, b.maxY)
      .filter((i) => pointInPolygon(this.xs[i] ?? 0, this.ys[i] ?? 0, polygon))
      .map((i) => this.ids[i] as T);
  }
}
