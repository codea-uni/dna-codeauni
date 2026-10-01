import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
} from 'three';
import type { Blast, Vec3 } from '@cronos/core';

/** Contornos de los dominios de material o ley en planta (A7), con el color de cada dominio. */
export class DomainsLayer {
  readonly lines = new LineSegments(
    new BufferGeometry(),
    new LineBasicMaterial({ vertexColors: true, depthTest: false }),
  );

  constructor() {
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 1;
  }

  rebuild(blasts: readonly Blast[], origin: Vec3): void {
    const pos: number[] = [];
    const col: number[] = [];
    const c = new Color();
    for (const blast of blasts)
      for (const d of blast.domains ?? []) {
        c.set(d.color);
        const n = d.polygon.length;
        for (let i = 0; i < n; i++) {
          const a = d.polygon[i];
          const b = d.polygon[(i + 1) % n];
          if (!a || !b) continue;
          pos.push(a.x - origin.x, a.y - origin.y, 0, b.x - origin.x, b.y - origin.y, 0);
          col.push(c.r, c.g, c.b, c.r, c.g, c.b);
        }
      }
    this.lines.geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
    this.lines.geometry.setAttribute('color', new Float32BufferAttribute(col, 3));
  }

  dispose(): void {
    this.lines.geometry.dispose();
    this.lines.material.dispose();
  }
}
