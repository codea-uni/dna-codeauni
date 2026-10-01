import { describe, expect, it } from 'vitest';
import { fitOrbit, orbitPosition } from './orbit';

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
