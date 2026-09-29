/**
 * Desplazamiento (A5): Zhang, Chi & Yi (2021), J. Rock Mech. Geotech. Eng. 13(4):767–773 (FC-36),
 * con los valores citados en P-21 (`docs/QUESTIONS.md`), y el tiro parabólico del ejemplo del
 * ingeniero (FC-37, solo regresión).
 */
import { describe, expect, it } from 'vitest';
import { ballisticRange, burdenVelocity } from './displacement';

const rel = (v: number, e: number, tol: number) => {
  expect(Math.abs(v / e - 1)).toBeLessThanOrEqual(tol);
};
const deg = (d: number) => (d * Math.PI) / 180;

describe('velocidad de burden (Zhang et al. 2021)', () => {
  const base = { cB: 0.12, theta: deg(45) };

  it('ejemplo del artículo (Malmberget): 57,6 m/s', () => {
    // c_B 0,12; θ 45°; ρ_e 1,2 g/cm³; e_e 4 MJ/kg; c_e 0,8; ρ_r 4,5 g/cm³; B 0,8 m; d 115 mm
    const v = burdenVelocity({
      ...base,
      diameter: 0.115,
      burden: 0.8,
      explosiveDensity: 1200,
      explosiveEnergy: 4e6,
      chargeRatio: 0.8,
      rockDensity: 4500,
    });
    rel(v, 57.6, 0.005);
  });

  it('Tabla 2 del artículo (valores calculados): 16,5; 19,5; 16,7; 10,6 m/s', () => {
    const rows: [number, number, number, number, number, number, number, number][] = [
      // d [m], B, H, L_e, ρ_r, ρ_e, e_e [J/kg], v calculada
      [0.115, 3, 24, 22, 4500, 1200, 4e6, 16.5],
      [0.31, 9, 35, 28, 1710, 970, 3.74e6, 19.5],
      [0.076, 2.1, 14.5, 13.7, 2570, 800, 3.85e6, 16.7],
      [0.142, 4.4, 17.2, 10.3, 2600, 1000, 2.5e6, 10.6],
    ];
    for (const [d, B, H, Le, rr, re, ee, expected] of rows)
      rel(
        burdenVelocity({
          ...base,
          diameter: d,
          burden: B,
          explosiveDensity: re,
          explosiveEnergy: ee,
          chargeRatio: Le / H,
          rockDensity: rr,
        }),
        expected,
        0.005,
      );
  });
});

describe('alcance balístico (P-21, ejemplo del ingeniero; regresión)', () => {
  it('d 0,20 m, B 6 m, H 15 m, L_e 10 m, ρ_r 2700, ρ_e 1100, e_e 3,5 MJ/kg → 14,1 m/s y 22,7 m', () => {
    const v = burdenVelocity({
      cB: 0.12,
      theta: deg(45),
      diameter: 0.2,
      burden: 6,
      explosiveDensity: 1100,
      explosiveEnergy: 3.5e6,
      chargeRatio: 10 / 15,
      rockDensity: 2700,
    });
    rel(v, 14.1, 0.005);
    // Cara a 75° → α = 15°; h = H/2 = 7,5 m
    rel(ballisticRange(v, deg(15), 7.5), 22.7, 0.005);
  });
});
