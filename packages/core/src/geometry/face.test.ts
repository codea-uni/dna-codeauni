import { describe, expect, it } from 'vitest';
import { DEFAULT_BENCH } from '../model/factories';
import type { BlastBoundary } from '../model/types';
import { SurfaceIndex } from '../topography/surfaceIndex';
import { degToRad, radToDeg } from '../units/units';
import { boundaryFace, faceOffsetAt, inFrontOfFace, measureFace } from './face';
import { freeFaceQuads } from './solid';

/** Banco de 10 m con cresta en y = 0 (cara libre al Norte) sobre un perímetro de 40 × 10 m. */
const boundary: BlastBoundary = {
  id: 'b' as never,
  name: 'P1',
  polygon: [
    { x: 0, y: -10 },
    { x: 40, y: -10 },
    { x: 40, y: 0 },
    { x: 0, y: 0 },
  ],
  freeFaceEdges: [2],
};
const bench = { ...DEFAULT_BENCH, floorElevation: 0, height: 10, faceAngle: degToRad(65) };

describe('geometría de la cara libre (A7b)', () => {
  it('ángulo y alto del banco, o propios del perímetro', () => {
    const f = boundaryFace(bench, boundary);
    expect(f.crestZ).toBe(10);
    expect(f.toeZ).toBe(0);
    // Avance cresta → pie = H / tan β (geometría).
    expect(f.run).toBeCloseTo(10 / Math.tan(degToRad(65)), 12);
    expect(faceOffsetAt(f, 5)).toBeCloseTo(5 / Math.tan(degToRad(65)), 12);
    const own = boundaryFace(bench, { ...boundary, faceAngle: degToRad(80), faceHeight: 6 });
    expect(own.toeZ).toBe(4);
    expect(own.run).toBeCloseTo(6 / Math.tan(degToRad(80)), 12);
    const [q] = freeFaceQuads({ ...boundary, faceHeight: 6 }, bench);
    expect(q?.[2].z).toBe(4);
    // Cara vertical: sin avance.
    expect(boundaryFace({ ...bench, faceAngle: Math.PI / 2 }).run).toBe(0);
  });

  it('aire delante de la cara y roca detrás o debajo del pie', () => {
    const air = inFrontOfFace({ bench, boundaries: [boundary] });
    const run = 10 / Math.tan(degToRad(65));
    expect(air(20, 1, 9)).toBe(true); // a media cara, 1 m afuera de la cresta, arriba
    expect(air(20, run * 0.4, 2)).toBe(false); // cerca del pie: todavía roca del talud
    expect(air(20, -5, 5)).toBe(false); // dentro del perímetro
    expect(air(20, -12, 5)).toBe(false); // detrás del banco (no es cara libre)
  });

  it('mide ángulo y alto en una topografía con talud conocido (65°, 10 m)', () => {
    const beta = degToRad(65);
    const run = 10 / Math.tan(beta);
    const xs = [0, 5, 10, 15, 20, 25, 30, 35, 40];
    const ys = [-10, -5, 0, run, run + 5, run + 10, 30];
    const z = (y: number) => (y <= 0 ? 10 : y >= run ? 0 : 10 - y * Math.tan(beta));
    const vertices: number[] = [];
    for (const y of ys) for (const x of xs) vertices.push(x, y, z(y));
    const triangles: number[] = [];
    for (let j = 0; j + 1 < ys.length; j++)
      for (let i = 0; i + 1 < xs.length; i++) {
        const k = j * xs.length + i;
        triangles.push(k, k + 1, k + xs.length, k + 1, k + xs.length + 1, k + xs.length);
      }
    const surface = SurfaceIndex.build({
      vertices: Float64Array.from(vertices),
      triangles: Uint32Array.from(triangles),
    });
    const m = measureFace((x, y) => surface.elevationAt(x, y), boundary, 10);
    if (!m) throw new Error('sin medición');
    expect(m.samples).toBeGreaterThan(10);
    expect(m.height).toBeCloseTo(10, 1);
    // Resolución del paso de 0,25 m sobre un avance de 4,66 m: ±2°.
    expect(Math.abs(radToDeg(m.angle) - 65)).toBeLessThan(2);
  });
});
