import { describe, expect, it } from 'vitest';
import type { Bench, BlastBoundary } from '../model/types';
import { degToRad } from '../units/units';
import { drapedFaceStrips, drapedPolygonSurface, drapePolyline, type Ground } from './drape';
import { polygonSignedArea } from './polygon';

// Terreno de prueba: plano inclinado z = 100 + 0,1·x + 0,05·y (el valor esperado sale de su definición).
const plane: Ground = (x, y) => 100 + 0.1 * x + 0.05 * y;
const bench: Bench = { floorElevation: 85, height: 15, faceAngle: degToRad(60) };
// Rectángulo 40 × 20 m; arista 2 (Norte) libre: va de (40, 20) a (0, 20) con normal exterior +y.
const boundary: BlastBoundary = {
  id: 'b' as BlastBoundary['id'],
  name: 'P1',
  polygon: [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 20 },
    { x: 0, y: 20 },
  ],
  freeFaceEdges: [2],
};

const triples = (a: Float64Array) =>
  Array.from({ length: a.length / 3 }, (_, i) => ({
    x: a[i * 3] ?? 0,
    y: a[i * 3 + 1] ?? 0,
    z: a[i * 3 + 2] ?? 0,
  }));

describe('geometría apoyada en el terreno', () => {
  it('la cara libre sigue el terreno: cada punto está en el plano y la franja llega al avance de la cara', () => {
    const m = drapedFaceStrips(boundary, bench, plane, 1);
    const pts = triples(m.positions);
    expect(pts.length).toBeGreaterThan(40);
    for (const p of pts) expect(p.z).toBeCloseTo(100 + 0.1 * p.x + 0.05 * p.y, 9);
    // Avance = alto / tan β = 15 / tan 60° = 8,660 m hacia el Norte desde la cresta (y = 20).
    const maxY = Math.max(...pts.map((p) => p.y));
    expect(maxY).toBeCloseTo(20 + 15 / Math.tan(degToRad(60)), 9);
    expect(m.indices.length % 3).toBe(0);
    expect(Math.max(...m.indices)).toBeLessThan(pts.length);
  });

  it('sin terreno la cara es el perfil analítico: cresta a piso + H y pie a la cota del piso', () => {
    const pts = triples(drapedFaceStrips(boundary, bench, null, 1).positions);
    const run = 15 / Math.tan(degToRad(60));
    for (const p of pts) {
      const s = p.y - 20;
      expect(p.z).toBeCloseTo(Math.max(85, 100 - s * Math.tan(degToRad(60))), 9);
    }
    expect(Math.min(...pts.map((p) => p.z))).toBeCloseTo(85, 9);
    expect(Math.max(...pts.map((p) => p.y))).toBeCloseTo(20 + run, 9);
  });

  it('aristas libres seguidas forman una sola cinta sin huecos ni aletas (crestas en tramos)', () => {
    // Cresta Norte trazada en 4 tramos de 10 m (vértices intermedios en y = 20), todos libres.
    const crest: BlastBoundary = {
      ...boundary,
      polygon: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 20 },
        { x: 30, y: 20 },
        { x: 20, y: 20 },
        { x: 10, y: 20 },
        { x: 0, y: 20 },
      ],
      freeFaceEdges: [2, 3, 4, 5],
    };
    const one = drapedFaceStrips(crest, bench, plane, 1);
    const single = drapedFaceStrips(boundary, bench, plane, 1);
    // Misma superficie que una sola arista de 40 m: mismos puntos (sin duplicar los vértices).
    expect(one.positions.length).toBe(single.positions.length);
    expect(one.indices.length).toBe(single.indices.length);
    const pts = triples(one.positions);
    for (const p of pts) expect(p.z).toBeCloseTo(100 + 0.1 * p.x + 0.05 * p.y, 9);
  });

  it('dos aristas libres en esquina (Norte y Este) salen por la bisectriz en el vértice común', () => {
    const corner = { ...boundary, freeFaceEdges: [1, 2] };
    const pts = triples(drapedFaceStrips(corner, bench, null, 1).positions);
    expect(pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.z))).toBe(true);
    // El vértice (40, 20) se desplaza a 45° (bisectriz de +x y +y) hasta el avance de la cara.
    const run = 15 / Math.tan(degToRad(60));
    const far = pts.find(
      (p) =>
        Math.abs(p.x - (40 + run * Math.SQRT1_2)) < 1e-9 &&
        Math.abs(p.y - (20 + run * Math.SQRT1_2)) < 1e-9,
    );
    expect(far?.z).toBeCloseTo(85, 9);
  });

  it('el techo del perímetro cubre exactamente su área y cada vértice está en el terreno', () => {
    const m = drapedPolygonSurface(boundary.polygon, plane, 1, 100);
    const pts = triples(m.positions);
    for (const p of pts) expect(p.z).toBeCloseTo(100 + 0.1 * p.x + 0.05 * p.y, 9);
    let area = 0;
    for (let t = 0; t < m.indices.length; t += 3) {
      const tri = [m.indices[t], m.indices[t + 1], m.indices[t + 2]].map(
        (i) => pts[i ?? 0] ?? { x: 0, y: 0, z: 0 },
      );
      const signed = polygonSignedArea(tri);
      expect(signed).toBeGreaterThan(0); // normales hacia arriba
      area += signed;
    }
    expect(area).toBeCloseTo(40 * 20, 6);
  });

  it('un polígono cóncavo (en L) conserva su área', () => {
    const L = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 30 },
      { x: 0, y: 30 },
    ];
    const m = drapedPolygonSurface(L, null, 2, 50);
    const pts = triples(m.positions);
    let area = 0;
    for (let t = 0; t < m.indices.length; t += 3)
      area += polygonSignedArea(
        [m.indices[t], m.indices[t + 1], m.indices[t + 2]].map(
          (i) => pts[i ?? 0] ?? { x: 0, y: 0, z: 0 },
        ),
      );
    expect(area).toBeCloseTo(30 * 10 + 10 * 20, 6);
    expect(pts.every((p) => p.z === 50)).toBe(true);
  });

  it('una polilínea se densifica al paso y se apoya en el terreno con su desplazamiento', () => {
    const line = drapePolyline(
      [
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 },
      ],
      plane,
      1,
      0.2,
    );
    expect(line).toHaveLength(11);
    for (const p of line) expect(p.z).toBeCloseTo(100 + 0.1 * p.x + 0.2, 9);
    // Fuera del terreno conserva su cota (más el desplazamiento).
    const off = drapePolyline(
      [
        { x: 0, y: 0, z: 7 },
        { x: 0, y: 4, z: 7 },
      ],
      () => null,
      1,
      0.2,
      false,
    );
    expect(off.every((p) => p.z === 7.2)).toBe(true);
  });
});
