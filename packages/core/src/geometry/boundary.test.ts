import { describe, expect, it } from 'vitest';
import { newId } from '../model/ids';
import type { BlastBoundary } from '../model/types';
import { patternAxes } from '../patterns/pattern';
import { boundaryAt, freeFaceAlignment, nearestEdge, outwardNormal } from './boundary';

// Cuadrado 0..10 antihorario; la arista 0 (y = 0) es la cara libre hacia el Sur.
const ccw = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];
const cw = [...ccw].reverse(); // (0,10),(10,10),(10,0),(0,0): la arista Sur es la 2

function boundary(polygon = ccw, freeFaceEdges = [0]): BlastBoundary {
  return { id: newId<'Boundary'>(), name: 'P', polygon, freeFaceEdges };
}

describe('perímetros y cara libre', () => {
  it('normal exterior en ambos sentidos de giro', () => {
    expect(outwardNormal(ccw, 0)).toEqual({ x: 0, y: -1 });
    expect(outwardNormal(ccw, 1)).toEqual({ x: 1, y: -0 });
    // En el horario la arista 2 va de (10,0) a (0,0): sigue siendo el borde Sur → normal (0, −1)
    const n = outwardNormal(cw, 2);
    expect(n?.x).toBeCloseTo(0);
    expect(n?.y).toBeCloseTo(-1);
  });

  it('arista más cercana y perímetro que contiene un punto', () => {
    expect(nearestEdge(ccw, 5, -0.4)).toEqual({ index: 0, distance: 0.4 });
    expect(nearestEdge(ccw, 10.3, 5)?.index).toBe(1);
    const b1 = boundary();
    const b2 = boundary(ccw.map((p) => ({ x: p.x + 20, y: p.y })));
    expect(boundaryAt([b1, b2], 25, 5)).toBe(b2);
    expect(boundaryAt([b1, b2], 15, 5)).toBeUndefined();
  });

  it('filas paralelas a la cara libre y avanzando hacia el interior', () => {
    for (const b of [boundary(ccw, [0]), boundary(cw, [2])]) {
      const align = freeFaceAlignment(b);
      if (!align) throw new Error('sin alineación');
      const { u, v } = patternAxes(align);
      expect(Math.abs(u.x)).toBeCloseTo(1); // filas Este-Oeste
      expect(v.y).toBeCloseTo(1); // avance hacia el Norte (interior)
    }
    expect(freeFaceAlignment(boundary(ccw, []))).toBeNull();
  });
});
