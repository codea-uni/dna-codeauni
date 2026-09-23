import { Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  dollyOrbit,
  fitOrbit,
  orbitBy,
  orbitPosition,
  panOrbit,
  MAX_PITCH,
  type OrbitState,
} from '../cameras/orbit';
import { writeSegmentMatrix } from './segmentMatrix';

function apply(m: Float32Array, p: Vector3): Vector3 {
  return p.clone().applyMatrix4(new Matrix4().fromArray(m));
}

describe('matriz de tramo', () => {
  it('lleva los extremos del cilindro unitario a from y to (vertical, inclinado y horizontal)', () => {
    const cases = [
      [
        { x: 1, y: 2, z: 15 },
        { x: 1, y: 2, z: -1.5 },
      ],
      [
        { x: 0, y: 0, z: 10 },
        { x: 3, y: -2, z: 1 },
      ],
      [
        { x: 0, y: 0, z: 0 },
        { x: 5, y: 0, z: 0 },
      ],
    ] as const;
    for (const [from, to] of cases) {
      const m = new Float32Array(16);
      writeSegmentMatrix(m, 0, from, to, 0.3);
      const top = apply(m, new Vector3(0, -0.5, 0));
      const bottom = apply(m, new Vector3(0, 0.5, 0));
      expect(top.distanceTo(new Vector3(from.x, from.y, from.z))).toBeLessThan(1e-4);
      expect(bottom.distanceTo(new Vector3(to.x, to.y, to.z))).toBeLessThan(1e-4);
      // Un punto del borde queda a 0.3 m del eje.
      const rim = apply(m, new Vector3(1, 0, 0));
      const mid = new Vector3((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
      expect(rim.distanceTo(mid)).toBeCloseTo(0.3, 5);
    }
  });
});

describe('cámara orbital', () => {
  const base: OrbitState = {
    targetX: 0,
    targetY: 0,
    targetZ: 0,
    yaw: 0,
    pitch: Math.PI / 4,
    distance: 100,
  };

  it('posición: yaw 0 mira desde el Norte, pitch eleva', () => {
    const p = orbitPosition(base);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(100 * Math.cos(Math.PI / 4));
    expect(p.z).toBeCloseTo(100 * Math.sin(Math.PI / 4));
    expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(100);
  });

  it('rotar limita la elevación; acercar respeta los límites', () => {
    expect(orbitBy(base, 0, 10_000).pitch).toBe(MAX_PITCH);
    expect(orbitBy(base, 100, 0).yaw).toBeCloseTo(-0.6);
    expect(dollyOrbit(base, 0.5).distance).toBe(50);
    expect(dollyOrbit(base, 1e-9).distance).toBe(2);
  });

  it('desplazar mueve el objetivo en el suelo, no la altura', () => {
    // Cámara al Norte mirando al Sur: la derecha de pantalla es el Oeste. Arrastrar a la derecha
    // trae a la vista lo que estaba a la izquierda (Este) → el objetivo se mueve +X.
    const p = panOrbit(base, 10, 0, 1);
    expect(p.targetZ).toBe(0);
    expect(p.targetX).toBeCloseTo(10);
    expect(p.targetY).toBeCloseTo(0);
    // Arrastrar hacia abajo avanza hacia donde mira la cámara (Sur): objetivo −Y.
    const q = panOrbit(base, 0, 10, 1);
    expect(q.targetX).toBeCloseTo(0);
    expect(q.targetY).toBeCloseTo(-10);
  });

  it('encuadre: la caja entra en el campo de visión', () => {
    const o = fitOrbit(
      { minX: -50, minY: -30, minZ: -10, maxX: 50, maxY: 30, maxZ: 15 },
      Math.PI / 4,
    );
    const r = Math.hypot(100, 60, 25) / 2;
    expect(o.distance).toBeGreaterThan(r / Math.sin(Math.PI / 8));
    expect(o.targetZ).toBeCloseTo(2.5);
  });
});
