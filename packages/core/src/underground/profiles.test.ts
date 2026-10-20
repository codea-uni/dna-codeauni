import { describe, expect, it } from 'vitest';
import {
  arched,
  circular,
  horseshoe,
  offsetProfile,
  pointInProfile,
  pointsAlong,
  rectangular,
  roundedShoulders,
} from './profiles';

/** Valor no nulo o error (evita aserciones `!`). */
function must<T>(x: T | null | undefined): T {
  if (x === null || x === undefined) throw new Error('valor ausente');
  return x;
}

// Valores esperados por geometría elemental calculada a mano (sin caso CR todavía; S0).
describe('perfiles de excavación', () => {
  it('rectangular 4×3: área 12 m², perímetro 14 m, piso/hastiales/techo', () => {
    const p = rectangular(4, 3);
    expect(p.area).toBeCloseTo(12, 12);
    expect(p.perimeter).toBeCloseTo(14, 12);
    expect(p.tags).toEqual(['floor', 'wall', 'roof', 'wall']);
    expect(p.width).toBe(4);
    expect(p.height).toBe(3);
  });

  it('arco-D 4 m con hastiales de 2 m: A = 8 + π·2²/2 = 14,283 m²; P = 4 + 4 + 2π = 14,283 m', () => {
    const p = arched(4, 2);
    expect(p.area).toBeCloseTo(14.2832, 2);
    expect(p.perimeter).toBeCloseTo(14.2832, 2);
    expect(p.height).toBeCloseTo(4, 9);
    // Cuerdas ≤ 0,1 m.
    for (let i = 0; i < p.points.length; i++) {
      const a = must(p.points[i]);
      const b = must(p.points[(i + 1) % p.points.length]);
      if (p.tags[i] === 'roof')
        expect(Math.hypot(b.u - a.u, b.v - a.v)).toBeLessThanOrEqual(0.1 + 1e-12);
    }
  });

  it('arco rebajado W = 4, f = 1: R = (4 + 1)/2 = 2,5; segmento = R²·acos(0,6) − 1,5·2 = 2,7956 m²', () => {
    const p = horseshoe(4, 2, 1);
    expect(p.area).toBeCloseTo(8 + 2.7956, 2);
    expect(p.height).toBeCloseTo(3, 9);
    // f = W/2 coincide con el arco-D.
    expect(horseshoe(4, 2, 2).area).toBeCloseTo(arched(4, 2).area, 9);
  });

  it('hombros redondeados: A = W·H − 2·(1 − π/4)·Ar²', () => {
    const p = roundedShoulders(4, 3, 1);
    expect(p.area).toBeCloseTo(12 - 2 * (1 - Math.PI / 4), 2);
    expect(p.tags.filter((t) => t === 'floor')).toHaveLength(1);
  });

  it('circular R = 2: A ≈ 4π y las tres etiquetas presentes', () => {
    const p = circular(2);
    expect(Math.abs(p.area / (4 * Math.PI) - 1)).toBeLessThan(1e-3);
    expect(p.height).toBeCloseTo(4, 2);
    expect(new Set(p.tags)).toEqual(new Set(['floor', 'wall', 'roof']));
  });

  it('desplazamiento hacia adentro de un rectángulo: (W − 2d)(H − 2d) y piso aparte', () => {
    const p = rectangular(4, 3);
    const o = offsetProfile(p, 0.5);
    expect(o).not.toBeNull();
    const area = (pts: { u: number; v: number }[]) =>
      Math.abs(
        pts.reduce((s, a, i) => {
          const b = must(pts[(i + 1) % pts.length]);
          return s + a.u * b.v - b.u * a.v;
        }, 0) / 2,
      );
    expect(area(must(o).points)).toBeCloseTo(3 * 2, 9);
    const o2 = offsetProfile(p, { floor: 1, wall: 0.5, roof: 0.5 });
    expect(Math.min(...must(o2).points.map((q) => q.v))).toBeCloseTo(1, 9);
    expect(Math.max(...must(o2).points.map((q) => q.v))).toBeCloseTo(2.5, 9);
    expect(offsetProfile(p, 2)).toBeNull();
  });

  it('desplazamiento del arco-D: el techo queda a R − d del centro del arco', () => {
    const o = must(offsetProfile(arched(4, 2), 0.5));
    expect(Math.max(...o.points.map((q) => q.v))).toBeCloseTo(2 + 1.5, 2);
    expect(o.points.every((q) => pointInProfile(q, arched(4, 2).points))).toBe(true);
  });

  it('puntos a espaciamiento de arco constante sobre hastiales y techo', () => {
    // Tramo continuo: 3 + 4 + 3 = 10 m; con S = 1,2 → 9 intervalos de 1,111 m y 10 puntos.
    const pts = pointsAlong(rectangular(4, 3), ['wall', 'roof'], 1.2);
    expect(pts).toHaveLength(10);
    expect(pts.filter((p) => p.endpoint)).toHaveLength(2);
    for (let i = 1; i < pts.length; i++) {
      const a = must(pts[i - 1]);
      const b = must(pts[i]);
      // Sobre el contorno la distancia en línea recta ≤ arco = 10/9.
      expect(Math.hypot(b.u - a.u, b.v - a.v)).toBeLessThanOrEqual(10 / 9 + 1e-9);
    }
    // Normal exterior: hastial derecho → +u, techo → +v.
    expect(must(pts[1]).normal.u).toBeCloseTo(1, 12);
    expect(must(pts.find((p) => p.tag === 'roof')).normal.v).toBeCloseTo(1, 12);
    // Lazo cerrado: perímetro 14 con S = 1 → 14 puntos.
    expect(pointsAlong(rectangular(4, 3), ['floor', 'wall', 'roof'], 1)).toHaveLength(14);
  });
});
