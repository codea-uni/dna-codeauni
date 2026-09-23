import { describe, expect, it } from 'vitest';
import { cardinal, measure } from './measure';

describe('medición', () => {
  it('distancia y azimut (horario desde el Norte)', () => {
    const m = measure({ x: 10, y: 10 }, { x: 13, y: 14 });
    expect(m.distance).toBe(5);
    expect(m.dx).toBe(3);
    expect(m.dy).toBe(4);
    expect((m.azimuth * 180) / Math.PI).toBeCloseTo(36.8699, 3); // atan(3/4)
    expect((measure({ x: 0, y: 0 }, { x: -1, y: 0 }).azimuth * 180) / Math.PI).toBeCloseTo(270);
    expect(measure({ x: 1, y: 1 }, { x: 1, y: 1 })).toEqual({
      distance: 0,
      azimuth: 0,
      dx: 0,
      dy: 0,
    });
  });

  it('rumbo cardinal', () => {
    const deg = (d: number) => (d * Math.PI) / 180;
    expect([0, 44, 90, 135, 180, 225, 270, 316, 359].map((d) => cardinal(deg(d)))).toEqual([
      'N',
      'NE',
      'E',
      'SE',
      'S',
      'SO',
      'O',
      'NO',
      'N',
    ]);
    expect(cardinal(deg(-90))).toBe('O');
  });
});
