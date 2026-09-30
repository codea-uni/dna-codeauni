import { describe, expect, it } from 'vitest';
import { SurfaceIndex } from './surfaceIndex';
import { buildTin } from './tin';

/**
 * Pruebas de geometría (no son fórmulas mineras): el valor esperado es el del propio fixture.
 * Plano z = 2x + 3y + 100: la interpolación lineal en cualquier triángulo del plano es exacta.
 */
const plane = (x: number, y: number) => 2 * x + 3 * y + 100;

function grid(n: number, step: number, x0 = 345000, y0 = 8512000): Float64Array {
  const pts: number[] = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const x = x0 + i * step;
      const y = y0 + j * step;
      pts.push(x, y, plane(x - x0, y - y0));
    }
  return Float64Array.from(pts);
}

describe('buildTin + SurfaceIndex', () => {
  it('interpola exacto sobre un plano y devuelve null fuera', () => {
    const { tin } = buildTin(grid(6, 10));
    expect(tin.triangles.length / 3).toBe(2 * 5 * 5);
    const idx = SurfaceIndex.build(tin);
    expect(idx.elevationAt(345012.5, 8512031.25)).toBeCloseTo(plane(12.5, 31.25), 9);
    expect(idx.elevationAt(345000, 8512000)).toBeCloseTo(100, 9);
    expect(idx.elevationAt(344999, 8512000)).toBeNull();
    expect(idx.slopeAt(345020, 8512020)).toBeCloseTo(Math.atan(Math.hypot(2, 3)), 9);
  });

  it('el índice viaja como buffer y sigue respondiendo igual', () => {
    const { tin } = buildTin(grid(4, 5));
    const built = SurfaceIndex.build(tin);
    const copy = SurfaceIndex.fromData(tin, built.data?.slice(0) ?? null);
    expect(copy.elevationAt(345007, 8512003)).toBeCloseTo(plane(7, 3), 9);
  });

  it('une puntos repetidos en planta', () => {
    const pts = Float64Array.from([0, 0, 1, 10, 0, 1, 0, 10, 1, 0, 0, 5]);
    const r = buildTin(pts);
    expect(r.duplicates).toBe(1);
    expect(r.tin.vertices.length / 3).toBe(3);
    expect(r.tin.vertices[2]).toBe(1); // conserva la primera cota
  });

  it('respeta una línea de quiebre (diagonal obligada)', () => {
    // Cuadrado casi cuadrado: Delaunay elegiría la diagonal 1-3; se obliga la 0-2.
    const pts = Float64Array.from([0, 0, 0, 10, 0.2, 0, 10, 10, 0, 0, 9.8, 0]);
    const edges = (tris: Uint32Array) => {
      const set = new Set<string>();
      for (let t = 0; t < tris.length; t += 3)
        for (const [a, b] of [
          [tris[t], tris[t + 1]],
          [tris[t + 1], tris[t + 2]],
          [tris[t + 2], tris[t]],
        ] as const)
          set.add([a, b].sort().join('-'));
      return set;
    };
    expect(edges(buildTin(pts).tin.triangles).has('0-2')).toBe(false);
    expect(edges(buildTin(pts, Uint32Array.from([0, 2])).tin.triangles).has('0-2')).toBe(true);
  });

  it('no puentea huecos grandes (S-13)', () => {
    const a = grid(4, 5, 0, 0);
    const b = grid(4, 5, 500, 0);
    const pts = new Float64Array(a.length + b.length);
    pts.set(a);
    pts.set(b, a.length);
    const r = buildTin(pts);
    expect(r.droppedTriangles).toBeGreaterThan(0);
    const idx = SurfaceIndex.build(r.tin);
    expect(idx.elevationAt(250, 7)).toBeNull(); // el hueco entre los dos grupos
    expect(idx.elevationAt(7, 7)).not.toBeNull();
    expect(buildTin(pts, undefined, { maxEdge: Infinity }).droppedTriangles).toBe(0);
  });
});
