import { describe, expect, it } from 'vitest';
import { pointInPolygon, polygonBounds, polygonSignedArea } from './polygon';

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

describe('polígonos', () => {
  it('punto dentro/fuera', () => {
    expect(pointInPolygon(5, 5, square)).toBe(true);
    expect(pointInPolygon(15, 5, square)).toBe(false);
    expect(pointInPolygon(-1, -1, square)).toBe(false);
  });

  it('polígono cóncavo (forma de L)', () => {
    const l = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(pointInPolygon(2, 8, l)).toBe(true);
    expect(pointInPolygon(8, 8, l)).toBe(false);
  });

  it('área y límites', () => {
    expect(polygonSignedArea(square)).toBe(100);
    expect(polygonSignedArea([...square].reverse())).toBe(-100);
    expect(polygonBounds(square)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  });
});
