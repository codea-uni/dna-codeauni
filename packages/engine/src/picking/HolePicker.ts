import { PointIndex, type HoleId, type Project } from '@blastlab/core';

/**
 * Picking de taladros en coordenadas de proyecto con un índice espacial en CPU.
 * Se marca sucio con cada cambio de taladros y se reconstruye perezosamente en la
 * siguiente consulta (no durante el arrastre, que no toca el documento).
 */
export class HolePicker {
  private index: PointIndex<HoleId> | null = null;

  constructor(private readonly getProject: () => Project) {}

  markDirty(): void {
    this.index = null;
  }

  get current(): PointIndex<HoleId> {
    this.index ??= this.build();
    return this.index;
  }

  private build(): PointIndex<HoleId> {
    const project = this.getProject();
    let n = 0;
    for (const b of project.blasts) n += b.holes.length;
    const ids: HoleId[] = new Array<HoleId>(n);
    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    let i = 0;
    for (const b of project.blasts) {
      for (const h of b.holes) {
        ids[i] = h.id;
        xs[i] = h.collar.x;
        ys[i] = h.collar.y;
        i++;
      }
    }
    return new PointIndex(ids, xs, ys);
  }
}
