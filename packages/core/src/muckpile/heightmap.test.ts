import { describe, expect, it } from 'vitest';
import { degToRad } from '../units/units';
import { Heightmap, REPOSE_TOLERANCE, type Lattice } from './heightmap';

const lattice: Lattice = { x0: 0, y0: 0, cell: 1, nx: 81, ny: 81 };

describe('pila en una grilla de alturas (A7)', () => {
  it('conserva el volumen y queda al ángulo de reposo (FC-42)', () => {
    const phi = degToRad(37);
    const hm = new Heightmap(lattice, new Float64Array(81 * 81), phi);
    hm.deposit(40.5, 40.5, 2000);
    expect(hm.looseVolume()).toBeCloseTo(2000, 6);
    expect(hm.maxReposeExcess()).toBeLessThanOrEqual(REPOSE_TOLERANCE);
    // Un cono de volumen V con talud φ tiene alto h = (3·V·tan²φ/π)^(1/3) (geometría del cono):
    // la pila discreta (8 vecinos, celdas de 1 m) queda dentro de ±15 %.
    const cone = Math.cbrt((3 * 2000 * Math.tan(phi) ** 2) / Math.PI);
    const top = Math.max(...hm.h);
    expect(Math.abs(top / cone - 1)).toBeLessThan(0.15);
  });

  it('no mueve el terreno fijo: un escalón de 10 m queda en pie bajo el material', () => {
    const base = new Float64Array(81 * 81);
    for (let j = 0; j < 81; j++) for (let i = 0; i < 40; i++) base[j * 81 + i] = 10;
    const hm = new Heightmap(lattice, base, degToRad(35));
    hm.deposit(38.5, 40.5, 300);
    for (let k = 0; k < base.length; k++)
      expect(hm.h[k]).toBeGreaterThanOrEqual((base[k] ?? 0) - 1e-9);
    expect(hm.looseVolume()).toBeCloseTo(300, 6);
    expect(hm.maxReposeExcess()).toBeLessThanOrEqual(REPOSE_TOLERANCE);
  });

  it('un ángulo de reposo menor da una pila más baja y extendida', () => {
    const tall = new Heightmap(lattice, new Float64Array(81 * 81), degToRad(40));
    const flat = new Heightmap(lattice, new Float64Array(81 * 81), degToRad(30));
    tall.deposit(40.5, 40.5, 1500);
    flat.deposit(40.5, 40.5, 1500);
    expect(Math.max(...flat.h)).toBeLessThan(Math.max(...tall.h));
  });
});
