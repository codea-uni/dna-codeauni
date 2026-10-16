import { describe, expect, it } from 'vitest';
import { clipPolygonHalfPlane, segmentOnSegment } from './clip';
import { polygonSignedArea } from './polygon';

// Caso construido a mano: rectángulo 0–40 × 0–20 m partido por x = 10.
const rect = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 20 },
  { x: 0, y: 20 },
];

describe('clipPolygonHalfPlane', () => {
  it('parte el rectángulo en x = 10: queda 30 × 20 = 600 m² al Este y 200 m² al Oeste', () => {
    const east = clipPolygonHalfPlane(rect, { x: 10, y: 0 }, { x: 1, y: 0 });
    const west = clipPolygonHalfPlane(rect, { x: 10, y: 0 }, { x: -1, y: 0 });
    expect(Math.abs(polygonSignedArea(east))).toBeCloseTo(600, 9);
    expect(Math.abs(polygonSignedArea(west))).toBeCloseTo(200, 9);
    expect(east).toHaveLength(4);
  });

  it('un semiplano que no toca el polígono deja todo o nada', () => {
    expect(clipPolygonHalfPlane(rect, { x: 50, y: 0 }, { x: 1, y: 0 })).toEqual([]);
    expect(clipPolygonHalfPlane(rect, { x: -5, y: 0 }, { x: 1, y: 0 })).toHaveLength(4);
  });
});

describe('segmentOnSegment', () => {
  it('reconoce un tramo de una arista y descarta uno paralelo desplazado', () => {
    expect(
      segmentOnSegment({ x: 10, y: 0 }, { x: 40, y: 0 }, { x: 0, y: 0 }, { x: 40, y: 0 }),
    ).toBe(true);
    expect(
      segmentOnSegment({ x: 10, y: 1 }, { x: 40, y: 1 }, { x: 0, y: 0 }, { x: 40, y: 0 }),
    ).toBe(false);
  });
});
