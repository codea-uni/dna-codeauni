import { describe, expect, it } from 'vitest';
import {
  fragmentation,
  kuzRam,
  kuzRamInputsFromBlast,
  rockFactor,
  rosinRammlerPassing,
  swebrecPassing,
  swebrecSize,
  type KuzRamInputs,
} from './fragmentation';

// CR-02 fila 15 (`docs/theory/04`; `R1` F23 y Ejemplo B, solo regresión hasta CR-07): A = 5,2,
// V = 942,39 m³, Q = 660,34 kg, RWS = 80,67 (726/900), B = 8,5/1,15, S = 8,5, Ø = 11", W = 0,3 m,
// solo carga de fondo, carga sobre el piso (8,7 − 1,0) = 7,7 m, H = 15 m, f_m = 1,1.
const B = 8.5 / 1.15;
const inputs: KuzRamInputs = {
  rockFactor: 5.2,
  loadingFactor: 660.34 / 942.39,
  chargePerHole: 660.34,
  rws: 0.8067,
  burden: B,
  spacing: 8.5,
  diameter: 11 * 0.0254,
  drillDeviation: 0.3,
  chargeLength: 7.7,
  bottomChargeLength: 7.7,
  columnChargeLength: 0,
  benchHeight: 15,
  patternFactor: 1.1,
};
const rel = (v: number, e: number, tol: number) => {
  expect(Math.abs(v / e - 1)).toBeLessThanOrEqual(tol);
};

describe('Kuz-Ram', () => {
  it('CR-02 #15: X50 = 25,5 cm, n = 1,04, Xc = 36,4 cm (±1 %)', () => {
    const r = kuzRam(inputs);
    rel(r.x50 * 100, 25.5, 0.01);
    rel(r.n, 1.04, 0.01);
    rel(r.xc * 100, 36.4, 0.01);
  });

  it('CR-02 #15: X80 ≈ 57,5 cm y pasantes 23/49/75/94 % en 10/25/50/100 cm (R1 F23)', () => {
    const r = kuzRam(inputs);
    const f = fragmentation(inputs, { oversizeSize: 1, finesSize: 0.01 });
    rel(f.p80.rosinRammler * 100, 57.5, 0.01);
    // X80 = X50·(ln 5/ln 2)^(1/n) (P-19)
    rel(f.p80.rosinRammler, r.x50 * (Math.log(5) / Math.LN2) ** (1 / r.n), 1e-9);
    for (const [cm, pct] of [
      [10, 23],
      [25, 49],
      [50, 75],
      [100, 94],
    ] as const)
      expect(Math.abs(rosinRammlerPassing(cm / 100, r.xc, r.n) * 100 - pct)).toBeLessThanOrEqual(1);
  });

  it('cruce con X-D1 Fragmentacion: H 15, B 9, S 10,3, Ø 270 mm, Q 771 kg, A 5,2, RWS 90 → X50 = 29,5 cm', () => {
    const r = kuzRam({
      ...inputs,
      burden: 9,
      spacing: 10.3,
      diameter: 0.27,
      chargePerHole: 771,
      loadingFactor: 771 / (9 * 10.3 * 15),
      rws: 0.9,
    });
    rel(r.x50 * 100, 29.5, 0.01);
  });

  it('Swebrec (KCO): identidades de la curva', () => {
    const r = fragmentation(inputs, { xmax: 5, oversizeSize: 1, finesSize: 0.01 });
    expect(r.p50.swebrec).toBeCloseTo(r.x50, 9);
    expect(swebrecPassing(r.xmax, r.x50, r.xmax, r.b)).toBe(1);
    expect(swebrecSize(0.5, r.x50, r.xmax, r.b)).toBeCloseTo(r.x50, 9);
    for (let k = 1; k < r.curve.length; k++) {
      expect(r.curve[k]?.swebrec ?? 0).toBeGreaterThanOrEqual(r.curve[k - 1]?.swebrec ?? 0);
      expect(r.curve[k]?.rosinRammler ?? 0).toBeGreaterThanOrEqual(
        r.curve[k - 1]?.rosinRammler ?? 0,
      );
    }
    // b de la roca, si existe, reemplaza al derivado
    expect(fragmentation({ ...inputs, swebrecB: 3 }, { oversizeSize: 1, finesSize: 0.01 }).b).toBe(
      3,
    );
  });

  it('factor de roca A (Cunningham)', () => {
    // Granito masivo: RMD 50, RDI = 0.025·2650 − 50 = 16.25, HF = UCS/5 = 30 (E = 50 GPa) → A = 5.775
    expect(rockFactor({ density: 2650, ucs: 150e6, youngModulus: 50e9 })).toBeCloseTo(5.775, 6);
    // E < 50 GPa → HF = E/3; diaclasado (RMD 0, JPS 20, JPA 30)
    expect(
      rockFactor({
        density: 2500,
        ucs: 80e6,
        youngModulus: 30e9,
        blastability: { rmd: 0, jps: 20, jpa: 30, rdi: 12.5, hf: 10 },
      }),
    ).toBeCloseTo(0.06 * (50 + 12.5 + 10), 6);
    expect(rockFactor({ density: 1, ucs: 1, youngModulus: 1, rockFactor: 9 })).toBe(9);
  });
});

describe('entradas desde la voladura', () => {
  it('malla, carga media, largo de carga y RWS ponderado', async () => {
    const { createBlast, DEFAULT_BENCH, DEFAULT_HOLE_TEMPLATE } =
      await import('../model/factories');
    const { createDefaultLibrary } = await import('../model/library');
    const { newId } = await import('../model/ids');
    const { generatePatternHoles } = await import('../patterns/pattern');
    const { applyChargeRule } = await import('../charging/charge');
    const { computeCharges } = await import('../charging/chargeAnalysis');
    const lib = createDefaultLibrary();
    const [anfo, heavy] = lib.explosives;
    const stem = lib.stemmingMaterials[0];
    if (!anfo || !heavy || !stem) throw new Error('librería incompleta');
    const pattern = {
      id: newId<'Pattern'>(),
      name: 'P',
      kind: 'staggered' as const,
      burden: 5,
      spacing: 6,
      origin: { x: 0, y: 0 },
      rowAzimuth: Math.PI / 2,
      rowAdvance: 'right' as const,
      rows: 4,
      holesPerRow: 5,
      holeTemplate: DEFAULT_HOLE_TEMPLATE,
    };
    const holes = generatePatternHoles(pattern, DEFAULT_BENCH, { startNumber: 1 }).map((h) => ({
      ...h,
      ...applyChargeRule(
        h,
        {
          stemmingLength: 4,
          stemmingMaterialId: stem.id,
          explosiveId: anfo.id,
          primerOffsetFromToe: 0.5,
        },
        lib,
      ),
    }));
    // Un taladro con fondo de ANFO pesado (2 m) y columna de ANFO (10.5 m).
    const h0 = holes[0];
    if (!h0) throw new Error('falta');
    holes[0] = {
      ...h0,
      decks: [
        { id: newId<'Deck'>(), kind: 'explosive', explosiveId: heavy.id, length: 2 },
        { id: newId<'Deck'>(), kind: 'explosive', explosiveId: anfo.id, length: 10.5 },
        { id: newId<'Deck'>(), kind: 'stemming', materialId: stem.id, length: 4 },
      ],
    };
    const blast = { ...createBlast('V', newId<'RockMass'>()), patterns: [pattern], holes };
    const charge = computeCharges(blast, lib, 2650);
    const inputs = kuzRamInputsFromBlast(blast, lib, charge, {
      density: 2650,
      ucs: 150e6,
      youngModulus: 50e9,
    });
    if (!inputs) throw new Error('sin entradas');
    expect(inputs).toMatchObject({ burden: 5, spacing: 6, patternFactor: 1.1, benchHeight: 15 });
    expect(inputs.diameter).toBeCloseTo(0.2, 12);
    expect(inputs.chargeLength).toBeCloseTo(12.5, 9);
    // Fondo medio: (19 · 12.5 + 2) / 20 = 11.975 m; columna: 10.5 / 20 = 0.525 m
    expect(inputs.bottomChargeLength).toBeCloseTo(11.975, 9);
    expect(inputs.columnChargeLength).toBeCloseTo(0.525, 9);
    // RWS ponderado por largo: (2 · 0.96 + 248 · 1) / 250 = 0.99968
    expect(inputs.rws).toBeCloseTo(0.99968, 5);
    expect(inputs.loadingFactor).toBeCloseTo(charge.loadingFactor, 12);
    expect(inputs.rockFactor).toBeCloseTo(5.775, 6);
  });
});
