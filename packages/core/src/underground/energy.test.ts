import { describe, expect, it } from 'vitest';
import {
  contourHolePpv,
  damageRadius,
  kleineConcentration,
  kleineGrid,
  kleineSegment,
} from './energy';

/** Valor no nulo o error (evita aserciones `!`). */
function must<T>(x: T | null | undefined): T {
  if (x === null || x === undefined) throw new Error('valor ausente');
  return x;
}

// Taladro de frente: eje perpendicular al plano (w de 0 a 3 m) con q = 1 kg/m.
const hole = { a: { u: 0, v: 0, w: 0 }, b: { u: 0, v: 0, w: 3 }, linearCharge: 1 };

describe('concentración de Kleine', () => {
  it('línea muy larga: P → 3q/(4π)·2/h² (integral de dx/(h² + x²)^(3/2) = 2/h²)', () => {
    const s = { a: { u: 0, v: -1000 }, b: { u: 0, v: 1000 }, linearCharge: 1 };
    expect(kleineSegment({ u: 1, v: 0 }, s)).toBeCloseTo(3 / (2 * Math.PI), 5);
    expect(kleineSegment({ u: 2, v: 0 }, s)).toBeCloseTo(3 / (8 * Math.PI), 5);
  });

  it('forma publicada: 3·q/(4π) = 187,5·ρe[g/cm³]·D²', () => {
    const q = (1200 * Math.PI * 0.045 ** 2) / 4;
    const s = { a: { u: 0, v: -1000 }, b: { u: 0, v: 1000 }, linearCharge: q };
    expect(kleineSegment({ u: 1, v: 0 }, s)).toBeCloseTo(187.5 * 1.2 * 0.045 ** 2 * 2, 5);
  });

  it('simétrica y decreciente con la distancia', () => {
    const p = (u: number, v: number) => kleineConcentration({ u, v }, [hole]);
    expect(p(1, 0)).toBeCloseTo(p(-1, 0), 12);
    expect(p(1, 0)).toBeCloseTo(p(0, 1), 12);
    expect(p(0.5, 0)).toBeGreaterThan(p(1, 0));
    expect(p(1, 0)).toBeGreaterThan(p(2, 0));
    // Sobre el eje (h → 0) queda finita por el piso de h.
    expect(Number.isFinite(p(0, 0))).toBe(true);
    // Superposición de dos taladros.
    const two = [hole, { ...hole, a: { u: 1, v: 0, w: 0 }, b: { u: 1, v: 0, w: 3 } }];
    expect(kleineConcentration({ u: 0.5, v: 0 }, two)).toBeCloseTo(2 * p(0.5, 0), 12);
  });

  it('grilla en el plano: dimensiones y simetría', () => {
    const g = kleineGrid([hole], { minU: -1, minV: -1, maxU: 1, maxV: 1, cellSize: 0.1 });
    expect(g.nx).toBe(21);
    expect(g.ny).toBe(21);
    const at = (i: number, j: number) => must(g.values[j * g.nx + i]);
    expect(at(0, 10)).toBeCloseTo(at(20, 10), 5);
    expect(at(10, 0)).toBeCloseTo(at(10, 20), 5);
    expect(at(10, 10)).toBeGreaterThan(at(15, 10));
  });
});

describe('Holmberg–Persson en el contorno', () => {
  it('la integración numérica coincide con la forma cerrada reutilizada (β = 2α)', () => {
    const closed = contourHolePpv(0.18, 3, 0.5, { k: 0.7, alpha: 0.75, beta: 1.5 });
    const numeric = contourHolePpv(0.18, 3, 0.5, { k: 0.7, alpha: 0.75, beta: 1.5 + 1e-9 });
    expect(numeric).toBeCloseTo(closed, 6);
  });

  it('radio de daño: la PPV en ese radio es el umbral y crece con la carga', () => {
    const q = 90 * 0.045 ** 2; // 0,182 kg/m
    const r = damageRadius(q, 3, 0.7);
    expect(r).toBeGreaterThan(0.1);
    expect(r).toBeLessThan(2);
    expect(contourHolePpv(q, 3, r)).toBeCloseTo(0.7, 6);
    expect(damageRadius(1.35, 3, 0.7)).toBeGreaterThan(r);
    expect(damageRadius(q, 3, 1000)).toBe(0);
  });
});
