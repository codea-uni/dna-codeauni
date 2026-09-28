/**
 * Casos de referencia de carga (`docs/theory/04`): CR-01 pasos 8–12, CR-02 filas 1–14 y sus
 * variantes con decks, CR-03 (pequeño diámetro, inclinado, dos productos). Valores esperados tal
 * como en la fuente, con su tolerancia; π/4 exacto (la fuente usa 0,507 y 1275: ≈ 0,07 %).
 */
import { describe, expect, it } from 'vitest';
import { lengthToFloor } from '../geometry/hole';
import { createBlast, createHole, DEFAULT_BENCH } from '../model/factories';
import { newId } from '../model/ids';
import type { Blast, Deck, Explosive, Hole, Pattern, ProductLibrary } from '../model/types';
import { degToRad } from '../units/units';
import { holeCharge, indexLibrary, linearChargeDensity } from './charge';
import { computeCharges } from './chargeAnalysis';
import { boreholePressure, detonationPressure } from './pressures';
import { scaledDepthOfBurial } from './sdob';

const rel = (value: number, expected: number, tol: number) => {
  expect(Math.abs(value - expected) / Math.abs(expected)).toBeLessThanOrEqual(tol);
};

function explosive(name: string, density: number, vod: number, energy = 3.7e6): Explosive {
  return {
    id: newId<'Explosive'>(),
    name,
    family: 'other',
    form: 'bulk',
    density,
    vod,
    energy,
    rws: 1,
    waterResistance: 'high',
  };
}

const stemmingId = newId<'StemmingMaterial'>();
function library(...explosives: Explosive[]): ProductLibrary {
  return {
    explosives,
    detonators: [],
    surfaceConnectors: [],
    primers: [],
    stemmingMaterials: [{ id: stemmingId, name: 'Grava', density: 1800 }],
  };
}

const exp = (e: Explosive, length: number, extra: Partial<Deck> = {}): Deck =>
  ({ id: newId<'Deck'>(), kind: 'explosive', explosiveId: e.id, length, ...extra }) as Deck;
const stem = (length: number): Deck => ({
  id: newId<'Deck'>(),
  kind: 'stemming',
  materialId: stemmingId,
  length,
});
const air = (length: number): Deck => ({ id: newId<'Deck'>(), kind: 'air', length });

/** Voladura de un taladro con su malla (B, S) sobre un banco de altura H. */
function oneHole(H: number, B: number, S: number, hole: Omit<Hole, 'patternId'>): Blast {
  const pattern: Pattern = {
    id: newId<'Pattern'>(),
    name: 'P',
    kind: 'staggered',
    burden: B,
    spacing: S,
    origin: { x: 0, y: 0 },
    rowAzimuth: 0,
    rowAdvance: 'right',
    rows: 1,
    holesPerRow: 1,
    holeTemplate: { diameter: hole.diameter, inclination: 0, azimuth: 0, subdrill: hole.subdrill },
  };
  const blast = createBlast('CR', newId<'RockMass'>(), { ...DEFAULT_BENCH, height: H });
  return { ...blast, patterns: [pattern], holes: [{ ...hole, patternId: pattern.id }] };
}

function baseHole(diameter: number, length: number, decks: Deck[], subdrill = 0): Hole {
  return {
    ...createHole({
      position: { x: 0, y: 0 },
      template: { diameter, inclination: 0, azimuth: 0, subdrill },
      bench: DEFAULT_BENCH,
      label: '1',
    }),
    length,
    decks,
  };
}

describe('CR-01 «Mina Esperanto»: carga y factores (pasos 8–12)', () => {
  const anfo = explosive('ANFO', 780, 4700);
  const lib = library(anfo);
  // H 15, B 8, J = 0,3·B = 2,4, T = 0,7·B = 5,6 → L = 17,4 y L_c = H + J − T = 11,8 m
  const hole = baseHole(0.31115, 17.4, [exp(anfo, 11.8), stem(5.6)], 2.4);
  const blast = oneHole(15, 8, 8.875, hole);
  const r = computeCharges(blast, lib, 2600);

  it('paso 9: Q = π/4·Ø²·L_c·ρe ≈ 699,85 kg (±0,5 %)', () => {
    rel(r.totalExplosive, 699.85, 0.005);
  });
  it('pasos 10–12: V = 1065 m³ (±0,3 %), PF = 0,2527 kg/t y FC = 0,6571 kg/m³ (±1 %)', () => {
    rel(r.nominal.volume, 1065, 0.003);
    rel((r.nominal.explosive / (r.nominal.volume * 2600)) * 1000, 0.2527, 0.01);
    rel(r.nominal.explosive / r.nominal.volume, 0.6571, 0.01);
  });
});

describe('CR-02 «MEQ73 11 pulg»: emulsión gasificada con esponjamiento (filas 1–14)', () => {
  const emulsion = explosive('Emulsión gasificada', 1380, 5400, 3.036e6);
  const lib = library(emulsion);
  const D = 11 * 0.0254;
  const S = 8.5;
  const B = S / 1.15;
  // Carga de fondo 7,8 m que sube 0,9 m al gasificar (tramo de 8,7 m); taco T = 16 − 8,7 = 7,3 m
  const hole = baseHole(D, 16, [exp(emulsion, 8.7, { swell: 0.9 }), stem(7.3)], 1);
  const blast = oneHole(15, B, S, hole);
  const r = computeCharges(blast, lib, 2690);
  const c = holeCharge(hole, indexLibrary(lib));

  it('filas 1–4: B 7,391 m; L 16 m; V 942,39 m³; 2535,03 t', () => {
    rel(B, 7.391, 1e-4);
    expect(hole.length).toBe(16);
    rel(r.nominal.volume, 942.39, 1e-4);
    rel((r.nominal.volume * 2690) / 1000, 2535.03, 1e-4);
  });
  it('filas 5–8: DCL 84,61 kg/m; Q 660,34 kg; ρ media 1,2372 g/cc; T 7,30 m (±0,1 %)', () => {
    rel(linearChargeDensity(emulsion, D), 84.61, 0.001);
    rel(c.explosive, 660.34, 0.001);
    const area = (Math.PI / 4) * D * D;
    rel(c.explosive / (8.7 * area) / 1000, 1.2372, 0.001);
    expect(c.stemmingLength).toBeCloseTo(7.3, 12);
  });
  it('filas 9–11: FC 0,7007 kg/m³, PF 0,2605 kg/t, 2004,8 MJ y FE 0,791 MJ/t (±0,1 %)', () => {
    const tonnes = (r.nominal.volume * 2690) / 1000;
    rel(r.nominal.explosive / r.nominal.volume, 0.7007, 0.001);
    rel(r.nominal.explosive / tonnes, 0.2605, 0.001);
    rel(r.nominal.energy / 1e6, 2004.8, 0.001);
    rel(r.nominal.energy / 1e6 / tonnes, 0.791, 0.001);
  });
  it('fila 12: T/B 0,99 y T/Ø 26,1', () => {
    expect(7.3 / B).toBeCloseTo(0.99, 2);
    expect(7.3 / D).toBeCloseTo(26.1, 1);
  });
  it('fila 13: profundidad escalada de enterramiento SD = 1,459 (±0,5 %)', () => {
    const sd = scaledDepthOfBurial(hole, indexLibrary(lib));
    rel(sd?.sdob ?? NaN, 1.459, 0.005);
    rel(sd?.depth ?? NaN, 8.697, 0.001); // D = T + L_w/2 = 7,3 + 1,397
  });
  it('fila 14: PD = ρ_med·VOD²/4 = 9,02 GPa y PB = 4,51 GPa (±0,5 %)', () => {
    const pd = detonationPressure(1237.2, 5400);
    rel(pd / 1e9, 9.02, 0.005);
    rel(boreholePressure(pd) / 1e9, 4.51, 0.005);
  });
});

describe('CR-02, variantes con decks («SD corregido» por tramo)', () => {
  const emulsion = explosive('Emulsión gasificada', 1380, 5400, 3.036e6);
  const lib = library(emulsion);
  const idx = indexLibrary(lib);
  const variants: [string, number, number, Deck[], [number, number, number, number]][] = [
    // [nombre, Ø [in], S, decks de fondo a boca, [Q, FC, PF, SD]]
    [
      'Actual',
      12.25,
      8.0,
      [exp(emulsion, 8.7, { swell: 0.9 }), air(1.3), stem(6.0)],
      [818.9, 0.981, 0.365, 1.14],
    ],
    [
      'MEQ73 con deck',
      11,
      7.5,
      [
        exp(emulsion, 5.35, { swell: 0.45 }),
        stem(1.3),
        exp(emulsion, 4.35, { swell: 0.45 }),
        stem(5.0),
      ],
      [745.0, 1.015, 0.377, 1.07],
    ],
    [
      'MEQ73 aire inferior',
      11,
      6.5,
      [air(1.0), exp(emulsion, 4.9), exp(emulsion, 4.8, { swell: 0.9 }), stem(5.3)],
      [745.0, 1.352, 0.503, 1.16],
    ],
  ];
  it.each(variants)('%s', (_, dIn, S, decks, [Q, FC, PF, SD]) => {
    const hole = baseHole(dIn * 0.0254, 16, decks, 1);
    const r = computeCharges(oneHole(15, S / 1.15, S, hole), lib, 2690);
    rel(r.totalExplosive, Q, 0.002);
    rel(r.nominal.explosive / r.nominal.volume, FC, 0.003);
    rel((r.nominal.explosive / (r.nominal.volume * 2690)) * 1000, PF, 0.003);
    expect(Math.abs((scaledDepthOfBurial(hole, idx)?.sdob ?? NaN) - SD)).toBeLessThanOrEqual(0.01);
  });
});

describe('CR-03 pequeño diámetro: inclinado 20°, encartuchado + granel (±2 %)', () => {
  const hydrogel = explosive('Hidrogel encartuchado 75 mm', 1200, 4500);
  const anfo = explosive('ANFO', 800, 3800);
  const lib = library(hydrogel, anfo);
  const D = 0.089;
  const alpha = degToRad(20);
  // Convención de López Jimeno (P-05), con la que se construyó el caso
  const L = lengthToFloor(10, 0, 12 * D, alpha, 'lopezJimeno');
  const T = 32 * D;
  const lf = 40 * D;
  const hole: Hole = {
    ...baseHole(D, L, [
      // El cartucho de 75 mm se aplasta con el peso de la columna: diámetro medio +10 %
      exp(hydrogel, lf, { effectiveDiameter: 0.075 * 1.1 }),
      exp(anfo, L - T - lf),
      stem(T),
    ]),
    inclination: alpha,
  };
  const blast: Blast = {
    ...oneHole(10, 35 * D, 43 * D, hole),
    calcParams: {
      ...createBlast('x', newId<'RockMass'>()).calcParams,
      subdrillConvention: 'lopezJimeno',
    },
  };
  const r = computeCharges(blast, lib, 2600);
  const c = holeCharge(hole, indexLibrary(lib));

  it('densidades lineales: fondo 6,4 kg/m (Ø 82,5 mm) y columna 5,0 kg/m', () => {
    rel(linearChargeDensity(hydrogel, D, undefined, 0.0825), 6.4, 0.02);
    rel(linearChargeDensity(anfo, D), 5.0, 0.02);
  });
  it('carga: fondo 23,0 kg, columna 25,5 kg, total 48,5 kg (sin redondeo 48,2)', () => {
    rel(c.deckMasses[0] ?? NaN, 23.0, 0.02);
    rel(c.deckMasses[1] ?? NaN, 25.5, 0.02);
    rel(c.explosive, 48.2, 0.02);
    rel(c.explosive, 48.5, 0.02);
  });
  it('consumo específico CE = Q/V_R = 0,387 kg/m³ (sin redondeo 0,380) y 10,9 m³/m', () => {
    rel(r.nominal.explosive / r.nominal.volume, 0.38, 0.02);
    rel(r.nominal.volume / r.nominal.drilledLength, 10.9, 0.02);
  });
});
