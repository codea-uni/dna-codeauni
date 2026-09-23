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

// Caso manual (cálculo con calculadora, ver comentarios):
// A = 7, K = 0.6 kg/m³, Q = 200 kg, ANFO (RWS 100), B = 5, S = 6, d = 200 mm, W = 0.2, L = 12.5, H = 15.
const inputs: KuzRamInputs = {
  rockFactor: 7,
  powderFactor: 0.6,
  chargePerHole: 200,
  rws: 1,
  burden: 5,
  spacing: 6,
  diameter: 0.2,
  drillDeviation: 0.2,
  chargeLength: 12.5,
  bottomChargeLength: 12.5,
  columnChargeLength: 0,
  benchHeight: 15,
  staggered: false,
};

describe('Kuz-Ram', () => {
  it('x50 y n (Cunningham 1987)', () => {
    const r = kuzRam(inputs);
    // x50 = 7 · 0.6^−0.8 · 200^(1/6) · 1.15^(19/30) = 7 · 1.5048 · 2.4183 · 1.0926 = 27.831 cm
    expect(r.x50 * 100).toBeCloseTo(27.8307, 3);
    // n = (2.2 − 14·5/200) · √1.1 · (1 − 0.2/5) · 1.1^0.1 · (12.5/15) = 1.5671
    expect(r.n).toBeCloseTo(1.5671, 4);
    // xc = x50 / (ln 2)^(1/n) = 35.164 cm
    expect(r.xc * 100).toBeCloseTo(35.1639, 3);
    expect(rosinRammlerPassing(r.x50, r.xc, r.n)).toBeCloseTo(0.5, 9);
    // Tresbolillo: n × 1.1
    expect(kuzRam({ ...inputs, staggered: true }).n).toBeCloseTo(1.5671 * 1.1, 3);
  });

  it('P80 (Rosin-Rammler) y Swebrec/KCO', () => {
    const r = fragmentation(inputs, { xmax: 5, oversizeSize: 1, finesSize: 0.01 });
    // P80_RR = xc · (−ln 0.2)^(1/n) = 47.641 cm
    expect(r.p80.rosinRammler * 100).toBeCloseTo(47.6409, 3);
    // b = 2 ln2 · ln(500/27.83) · n = 6.2751
    expect(r.b).toBeCloseTo(6.2751, 4);
    // P80_Swebrec = xmax · exp(−0.25^(1/b) · ln(xmax/x50)) = 49.338 cm
    expect(r.p80.swebrec * 100).toBeCloseTo(49.3377, 3);
    expect(r.p50.swebrec).toBeCloseTo(r.x50, 9);
    expect(swebrecPassing(2 * r.x50, r.x50, r.xmax, r.b)).toBeCloseTo(0.84837, 4);
    expect(swebrecPassing(r.xmax, r.x50, r.xmax, r.b)).toBe(1);
    expect(swebrecSize(0.5, r.x50, r.xmax, r.b)).toBeCloseTo(r.x50, 9);
    // Curvas monótonas crecientes entre 0 y 1
    for (let k = 1; k < r.curve.length; k++) {
      expect(r.curve[k]?.swebrec ?? 0).toBeGreaterThanOrEqual(r.curve[k - 1]?.swebrec ?? 0);
      expect(r.curve[k]?.rosinRammler ?? 0).toBeGreaterThanOrEqual(
        r.curve[k - 1]?.rosinRammler ?? 0,
      );
    }
    expect(r.oversize.rosinRammler).toBeCloseTo(1 - rosinRammlerPassing(1, r.xc, r.n), 9);
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
    expect(inputs).toMatchObject({ burden: 5, spacing: 6, staggered: true, benchHeight: 15 });
    expect(inputs.diameter).toBeCloseTo(0.2, 12);
    expect(inputs.chargeLength).toBeCloseTo(12.5, 9);
    // Fondo medio: (19 · 12.5 + 2) / 20 = 11.975 m; columna: 10.5 / 20 = 0.525 m
    expect(inputs.bottomChargeLength).toBeCloseTo(11.975, 9);
    expect(inputs.columnChargeLength).toBeCloseTo(0.525, 9);
    // RWS ponderado por largo: (2 · 0.96 + 248 · 1) / 250 = 0.99968
    expect(inputs.rws).toBeCloseTo(0.99968, 5);
    expect(inputs.powderFactor).toBeCloseTo(charge.powderFactorVolume, 12);
    expect(inputs.rockFactor).toBeCloseTo(5.775, 6);
  });
});
