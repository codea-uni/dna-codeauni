import { describe, expect, it } from 'vitest';
import {
  dollyToward,
  fitOrbit,
  flyOrbit,
  lookBy,
  orbitBy,
  orbitPosition,
  repivotOrbit,
  type OrbitState,
} from './orbit';

describe('encuadre orbital', () => {
  const box = { minX: -50, minY: -30, minZ: -15, maxX: 50, maxY: 30, maxZ: 5 };

  it('mantiene el objetivo en el centro del modelo, también en coordenadas UTM', () => {
    const local = fitOrbit(box, Math.PI / 4, 16 / 9);
    const remote = fitOrbit(
      {
        minX: box.minX + 500000,
        maxX: box.maxX + 500000,
        minY: box.minY + 8000000,
        maxY: box.maxY + 8000000,
        minZ: box.minZ + 3500,
        maxZ: box.maxZ + 3500,
      },
      Math.PI / 4,
      16 / 9,
    );
    expect(remote.distance).toBe(local.distance);
    expect(remote.targetX).toBe(local.targetX + 500000);
    expect(remote.targetY).toBe(local.targetY + 8000000);
    expect(orbitPosition(remote).z).toBeCloseTo(orbitPosition(local).z + 3500);
  });

  it('no recorta el modelo cuando los paneles dejan un canvas angosto', () => {
    const landscape = fitOrbit(box, Math.PI / 4, 16 / 9);
    const narrow = fitOrbit(box, Math.PI / 4, 0.5);
    expect(narrow.distance).toBeGreaterThan(landscape.distance);
    const horizontalHalfFov = Math.atan(Math.tan(Math.PI / 8) * 0.5);
    const radius = Math.hypot(100, 60, 20) / 2;
    expect(narrow.distance * Math.sin(horizontalHalfFov)).toBeGreaterThan(radius);
  });
});

describe('navegación tipo Unity', () => {
  const o: OrbitState = { targetX: 0, targetY: 0, targetZ: 0, yaw: 0.7, pitch: 0.6, distance: 100 };
  const near = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => {
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.y).toBeCloseTo(b.y, 6);
    expect(a.z).toBeCloseTo(b.z, 6);
  };

  it('cambiar el centro de giro no mueve la cámara', () => {
    const r = repivotOrbit(o, { x: 10, y: -5, z: -3 });
    expect(r).not.toBeNull();
    if (!r) return;
    near(orbitPosition(r), orbitPosition(o));
    expect([r.targetX, r.targetY, r.targetZ]).toEqual([10, -5, -3]);
  });

  it('no gira alrededor de un punto que está sobre la cámara', () => {
    const c = orbitPosition(o);
    expect(repivotOrbit(o, { x: c.x + 1, y: c.y, z: c.z + 50 })).toBeNull();
  });

  it('mirar libremente deja la cámara quieta y permite mirar hacia arriba', () => {
    const r = lookBy(o, 120, -400);
    near(orbitPosition(r), orbitPosition(o));
    expect(r.pitch).toBeLessThan(0);
    // Orbitar después no salta a la elevación mínima.
    expect(orbitBy(r, 0, 1).pitch).toBeCloseTo(r.pitch + 0.006);
  });

  it('volar hacia adelante acerca la cámara a lo que mira', () => {
    const r = flyOrbit(o, 10, 0, 0);
    const before = orbitPosition(o);
    const after = orbitPosition(r);
    expect(Math.hypot(after.x - o.targetX, after.y - o.targetY, after.z - o.targetZ)).toBeCloseTo(
      90,
    );
    expect(Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z)).toBeCloseTo(10);
    const up = flyOrbit(o, 0, 0, 5);
    expect(orbitPosition(up).z - before.z).toBeCloseTo(5);
  });

  it('acercar con la rueda mantiene el punto del cursor en la misma dirección', () => {
    const p = { x: 30, y: 10, z: 0 };
    const c = orbitPosition(o);
    const r = dollyToward(o, 0.5, p);
    const c2 = orbitPosition(r);
    const dir = (a: typeof c) => {
      const d = Math.hypot(p.x - a.x, p.y - a.y, p.z - a.z);
      return { x: (p.x - a.x) / d, y: (p.y - a.y) / d, z: (p.z - a.z) / d };
    };
    near(dir(c2), dir(c));
    expect(r.distance).toBe(50);
  });

  it('en la distancia mínima la rueda sigue avanzando', () => {
    const close = { ...o, distance: 2 };
    const r = dollyToward(close, 0.8, null);
    expect(r.distance).toBe(2);
    expect(r.targetX).not.toBe(close.targetX);
  });
});
