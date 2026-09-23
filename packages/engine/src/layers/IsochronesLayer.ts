import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
} from 'three';
import type { Vec3 } from '@blastlab/core';
import { turbo } from './colormap';

export interface IsochroneData {
  /** [x1, y1, x2, y2, …] en coordenadas de proyecto. */
  segments: Float64Array;
  levels: Float32Array;
  min: number;
  max: number;
}

/** Isócronas coloreadas con el mismo mapa que los taladros por tiempo. */
export class IsochronesLayer {
  readonly lines = new LineSegments(
    new BufferGeometry(),
    new LineBasicMaterial({
      vertexColors: true,
      depthTest: false,
      transparent: true,
      opacity: 0.85,
    }),
  );

  constructor() {
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 0;
  }

  set(data: IsochroneData | null, origin: Vec3): void {
    const n = data ? data.levels.length : 0;
    const pos = new Float32Array(n * 6);
    const col = new Float32Array(n * 6);
    const c = new Color();
    for (let k = 0; k < n && data; k++) {
      pos[k * 6] = (data.segments[k * 4] ?? 0) - origin.x;
      pos[k * 6 + 1] = (data.segments[k * 4 + 1] ?? 0) - origin.y;
      pos[k * 6 + 3] = (data.segments[k * 4 + 2] ?? 0) - origin.x;
      pos[k * 6 + 4] = (data.segments[k * 4 + 3] ?? 0) - origin.y;
      const span = data.max - data.min;
      turbo(span > 0 ? ((data.levels[k] ?? 0) - data.min) / span : 0.5, c);
      col.set([c.r, c.g, c.b, c.r, c.g, c.b], k * 6);
    }
    this.lines.geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
    this.lines.geometry.setAttribute('color', new Float32BufferAttribute(col, 3));
  }

  dispose(): void {
    this.lines.geometry.dispose();
    this.lines.material.dispose();
  }
}
