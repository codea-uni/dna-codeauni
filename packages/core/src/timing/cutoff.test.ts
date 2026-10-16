import { describe, expect, it } from 'vitest';
import type { HoleId } from '../model/types';
import { cutoffRisks } from './cutoff';

// Caso construido a mano: tres taladros en línea cada 5 m, amarre de superficie de 17 ms entre
// taladros (señal en la boca: 0, 17, 34 ms).
const holes = [0, 5, 10].map((x, i) => ({ id: `h${i}` as HoleId, collar: { x, y: 0 } }));
const surface = Float64Array.from([0, 0.017, 0.034]);
const options = { radius: 6, minLead: 0 };

describe('cutoffRisks', () => {
  it('con retardo de fondo de 500 ms la señal llega a todos antes de la primera detonación', () => {
    const fire = surface.map((s) => s + 0.5);
    expect(cutoffRisks(holes, surface, fire, options)).toEqual([]);
  });

  it('con 25 ms de fondo: h1 recibe a 17 ms y h0 detona a 25 ms; h2 recibe a 34 ms y h1 detona a 42 ms → sin riesgo', () => {
    const fire = surface.map((s) => s + 0.025);
    expect(cutoffRisks(holes, surface, fire, options)).toEqual([]);
  });

  it('con retardo de fondo de 9 ms h0 detona a 9 ms y h1 recién recibe la señal a 17 ms: riesgo con adelanto −8 ms', () => {
    const fire = surface.map((s) => s + 0.009);
    const risks = cutoffRisks(holes, surface, fire, options);
    expect(risks.map((r) => r.holeId)).toEqual(['h1', 'h2']);
    expect(risks[0]?.neighborId).toBe('h0');
    expect(risks[0]?.lead).toBeCloseTo(-0.008, 12);
    expect(risks[0]?.distance).toBeCloseTo(5, 12);
  });

  it('el margen mínimo exige adelanto: con 25 ms de fondo y margen de 10 ms, h1 (adelanto 8 ms) queda en riesgo', () => {
    const fire = surface.map((s) => s + 0.025);
    const risks = cutoffRisks(holes, surface, fire, { radius: 6, minLead: 0.01 });
    expect(risks.map((r) => r.holeId)).toEqual(['h1', 'h2']);
    expect(risks[0]?.lead).toBeCloseTo(0.008, 12);
  });

  it('los electrónicos (skip) y los taladros sin señal no se evalúan', () => {
    const fire = surface.map((s) => s + 0.009);
    expect(cutoffRisks(holes, surface, fire, options, [true, true, true])).toEqual([]);
    const noSignal = Float64Array.from([0, NaN, NaN]);
    expect(cutoffRisks(holes, noSignal, fire, options)).toEqual([]);
  });
});
