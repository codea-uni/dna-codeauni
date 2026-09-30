import {
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshLambertMaterial,
  Color,
} from 'three';
import type { Vec3 } from '@cronos/core';
import { writeSegmentMatrix } from '../scene3d/segmentMatrix';
import { turbo } from './colormap';

/** Flechas 3D (A7): de cada centroide in situ a su centroide en la pila, color por magnitud. */
export interface VectorsData {
  /** Inicios y fines [x, y, z, …] en coordenadas de proyecto. */
  from: Float64Array;
  to: Float64Array;
  /** Valor para el color (p. ej. desplazamiento horizontal [m]). */
  values: Float32Array;
  min: number;
  max: number;
}

/** Flechas instanciadas: un cilindro (cuerpo) y un cono (punta) por vector. */
export class VectorsLayer {
  readonly root = new Group();
  private readonly shaftGeometry = new CylinderGeometry(1, 1, 1, 8, 1, false);
  private readonly headGeometry = new ConeGeometry(1, 1, 10, 1, false);
  private readonly material = new MeshLambertMaterial({ color: 0xffffff });
  private shafts: InstancedMesh | null = null;
  private heads: InstancedMesh | null = null;

  set(data: VectorsData | null, origin: Vec3, radius = 0.25): void {
    this.clear();
    const n = data ? data.values.length : 0;
    if (!data || n === 0) return;
    const shafts = new InstancedMesh(this.shaftGeometry, this.material, n);
    const heads = new InstancedMesh(this.headGeometry, this.material, n);
    for (const m of [shafts, heads]) {
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.instanceColor = new InstancedBufferAttribute(new Float32Array(n * 3), 3);
      m.frustumCulled = false;
    }
    const sm = shafts.instanceMatrix.array as Float32Array;
    const hm = heads.instanceMatrix.array as Float32Array;
    const c = new Color();
    const span = data.max - data.min;
    let count = 0;
    for (let i = 0; i < n; i++) {
      const a = {
        x: (data.from[3 * i] ?? 0) - origin.x,
        y: (data.from[3 * i + 1] ?? 0) - origin.y,
        z: (data.from[3 * i + 2] ?? 0) - origin.z,
      };
      const b = {
        x: (data.to[3 * i] ?? 0) - origin.x,
        y: (data.to[3 * i + 1] ?? 0) - origin.y,
        z: (data.to[3 * i + 2] ?? 0) - origin.z,
      };
      const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      if (len < 1e-3) continue;
      const head = Math.min(len * 0.35, Math.max(4 * radius, 1.2));
      const t = (len - head) / len;
      const mid = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
      writeSegmentMatrix(sm, count * 16, a, mid, radius);
      writeSegmentMatrix(hm, count * 16, mid, b, radius * 2.6);
      turbo(span > 0 ? ((data.values[i] ?? 0) - data.min) / span : 0.5, c);
      shafts.instanceColor?.setXYZ(count, c.r, c.g, c.b);
      heads.instanceColor?.setXYZ(count, c.r, c.g, c.b);
      count++;
    }
    shafts.count = count;
    heads.count = count;
    shafts.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    this.shafts = shafts;
    this.heads = heads;
    this.root.add(shafts, heads);
  }

  clear(): void {
    for (const m of [this.shafts, this.heads]) {
      if (!m) continue;
      this.root.remove(m);
      m.dispose();
    }
    this.shafts = null;
    this.heads = null;
  }

  dispose(): void {
    this.clear();
    this.shaftGeometry.dispose();
    this.headGeometry.dispose();
    this.material.dispose();
  }
}
