/**
 * Casos de referencia de `docs/theory/04`: valores tal como en la fuente, con su tolerancia.
 */
import { describe, expect, it } from 'vitest';
import { degToRad } from '../units/units';
import {
  andersenBurden,
  ashBurden,
  DEFAULT_STEMMING_RATIO,
  DEFAULT_SUBDRILL_RATIO,
  equilateralSpacing,
  konyaWalterBurden,
  nominalVolume,
  stiffnessRatio,
  stiffnessRating,
  suggestedSpacing,
} from './burden';

const within = (value: number, expected: number, tol: number) => {
  expect(Math.abs(value - expected)).toBeLessThanOrEqual(tol);
};

describe('CR-01 «Mina Esperanto» (Ø 12¼", ANFO 780 kg/m³, andesita 2600 kg/m³, H = 15 m)', () => {
  const D = 0.31115;
  it('paso 1: Ash con Kb = 25 → 7,779 m (fuente 7,8 m, ±0,05 m)', () => {
    within(ashBurden(D, 25), 7.779, 0.001);
  });
  it('paso 2: Konya–Walter con Kd = 0,95 y Ks = 1,10 → 8,194 m (fuente 8,2 m, ±0,05 m)', () => {
    within(konyaWalterBurden(D, 780, 2600, 0.95, 1.1), 8.194, 0.001);
  });
  it('pasos 4–7: T = 5,6 m, J = 2,4 m, H/B = 1,875 y S = 8,875 m con B = 8 m', () => {
    const B = 8;
    expect(DEFAULT_STEMMING_RATIO * B).toBeCloseTo(5.6, 12);
    expect(DEFAULT_SUBDRILL_RATIO * B).toBeCloseTo(2.4, 12);
    expect(stiffnessRatio(15, B)).toBeCloseTo(1.875, 6);
    expect(stiffnessRating(1.875)).toBe('poor');
    within(suggestedSpacing(15, B), 8.875, 1e-9);
  });
  it('paso 10: V = H·B·S = 1065 m³ con S = 8,875 (±0,3 %)', () => {
    within(nominalVolume(8, 8.875, 15), 1065, 1065 * 0.003);
  });
});

describe('CR-02 «MEQ73 11 pulg» (Ø 11", H = 15 m, J = 1 m, S = 8,5 m)', () => {
  const D = 11 * 0.0254;
  const B = 8.5 / 1.15;
  it('burden por autores: Andersen 7,32 m (L = 16 m) y Ash Kb = 30 → 8,38 m', () => {
    within(andersenBurden(D, 16), 7.32, 0.01);
    within(ashBurden(D, 30), 8.38, 0.01);
  });
  it('fila 12: H/B = 2,03 (rigidez regular); S/B = 1,15; J/B = 0,135', () => {
    within(stiffnessRatio(15, B), 2.03, 0.01);
    expect(stiffnessRating(stiffnessRatio(15, B))).toBe('fair');
    within(8.5 / B, 1.15, 0.01);
    within(1 / B, 0.135, 0.01);
    // «S = 8,5 vs. (H + 7B)/8 = 8,34 (coherente)»
    within(suggestedSpacing(15, B), 8.34, 0.01);
  });
});

describe('CR-03 pequeño diámetro (Ø 89 mm, H = 10 m, inclinado 20°)', () => {
  it('B = 35·Ø = 3,115 m (Ash con Kb = 35) y V_R = B·S·H/cos20° = 125,4 m³ con B 3,1 y S 3,8', () => {
    within(ashBurden(0.089, 35), 3.115, 1e-9);
    within(nominalVolume(3.1, 3.8, 10, degToRad(20)), 125.4, 0.05);
  });
});

describe('tres bolillos equilátero', () => {
  it('S = 2B/√3 = 1,1547·B (02 §1)', () => {
    within(equilateralSpacing(1), 1.1547, 1e-4);
  });
});
