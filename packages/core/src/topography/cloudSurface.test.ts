import { describe, expect, it } from 'vitest';
import { cloudToSurface } from './cloudSurface';

/** Nube de un terreno inclinado (z = 4000 + 0,1·x) con «vegetación» de 2 m en la mitad de los puntos. */
function terrainCloud(size = 40, step = 0.5) {
  const pts: number[] = [];
  for (let x = 0; x < size; x += step)
    for (let y = 0; y < size; y += step) {
      const ground = 4000 + 0.1 * x;
      pts.push(x, y, ground - 4000);
      if ((x + y) % 2 === 0) pts.push(x + 0.1, y + 0.1, ground + 2 - 4000);
    }
  return {
    origin: [350000, 8600000, 4000] as [number, number, number],
    positions: Float32Array.from(pts),
    sourcePoints: pts.length / 3,
  };
}

describe('nube → superficie TIN', () => {
  it('con cota mínima la superficie sigue el suelo (sin vegetación)', () => {
    const r = cloudToSurface(terrainCloud(), { cell: 2, mode: 'min', trim: 'mask' });
    expect(r.cells).toBe(400);
    expect(r.tin.triangles.length / 3).toBeGreaterThan(600);
    for (let i = 0; i < r.tin.vertices.length; i += 3) {
      const x = (r.tin.vertices[i] ?? 0) - 350000;
      const z = r.tin.vertices[i + 2] ?? 0;
      // El punto más bajo de la celda está en su borde izquierdo: z ≤ suelo bajo el centro.
      expect(z).toBeLessThanOrEqual(4000 + 0.1 * x + 1e-6);
      expect(z).toBeGreaterThan(4000 + 0.1 * x - 0.2);
    }
    expect(r.overhangRatio).toBeLessThan(0.1);
  });

  it('con cota máxima toma la vegetación', () => {
    const r = cloudToSurface(terrainCloud(), { cell: 2, mode: 'max', trim: 'convex' });
    const z0 = r.tin.vertices[2] ?? 0;
    const x0 = (r.tin.vertices[0] ?? 0) - 350000;
    expect(z0).toBeGreaterThan(4000 + 0.1 * x0 + 1.5);
  });

  it('la máscara no puentea un hueco grande', () => {
    const c = terrainCloud();
    // Se quita una franja central de 12 m (x entre 14 y 26).
    const keep: number[] = [];
    for (let i = 0; i < c.positions.length; i += 3) {
      const x = c.positions[i] ?? 0;
      if (x < 14 || x >= 26)
        keep.push(c.positions[i] ?? 0, c.positions[i + 1] ?? 0, c.positions[i + 2] ?? 0);
    }
    const gap = { ...c, positions: Float32Array.from(keep) };
    const masked = cloudToSurface(gap, { cell: 2, mode: 'min', trim: 'mask' });
    const convex = cloudToSurface(gap, { cell: 2, mode: 'min', trim: 'convex' });
    expect(masked.droppedTriangles).toBeGreaterThan(0);
    expect(convex.tin.triangles.length).toBeGreaterThan(masked.tin.triangles.length);
  });

  it('detecta un túnel (piso y techo en la misma celda)', () => {
    const pts: number[] = [];
    for (let x = 0; x < 30; x += 0.5) for (let y = 0; y < 4; y += 0.5) pts.push(x, y, 0, x, y, 4.5);
    const r = cloudToSurface(
      { origin: [0, 0, 3000], positions: Float32Array.from(pts), sourcePoints: pts.length / 3 },
      { cell: 1, mode: 'min', trim: 'mask' },
    );
    expect(r.overhangRatio).toBeGreaterThan(0.9);
  });
});
