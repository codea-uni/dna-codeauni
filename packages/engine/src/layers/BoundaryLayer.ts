import { BufferGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineLoop } from 'three';
import type { Blast, Vec3 } from '@blastlab/core';
import { COLORS } from './colors';

/** Perímetros de voladura. Se reconstruye entero: son pocos vértices. */
export class BoundaryLayer {
  readonly root = new Group();
  private readonly material = new LineBasicMaterial({ color: COLORS.boundary, depthTest: false });

  constructor() {
    this.root.renderOrder = 1;
  }

  rebuild(blasts: readonly Blast[], origin: Vec3): void {
    this.clear();
    for (const blast of blasts) {
      const boundary = blast.boundary;
      if (!boundary || boundary.length < 2) continue;
      const positions: number[] = [];
      for (const p of boundary) positions.push(p.x - origin.x, p.y - origin.y, 0);
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
      const line = new LineLoop(geometry, this.material);
      line.frustumCulled = false;
      line.renderOrder = 1;
      this.root.add(line);
    }
  }

  dispose(): void {
    this.clear();
    this.material.dispose();
  }

  private clear(): void {
    for (const child of [...this.root.children]) {
      if (child instanceof LineLoop) (child.geometry as BufferGeometry).dispose();
      this.root.remove(child);
    }
  }
}
