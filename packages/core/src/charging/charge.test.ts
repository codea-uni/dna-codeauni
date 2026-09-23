import { describe, expect, it } from 'vitest';
import { createDefaultLibrary } from '../model/library';
import { createBlast, createHole, DEFAULT_BENCH, DEFAULT_HOLE_TEMPLATE } from '../model/factories';
import { newId } from '../model/ids';
import type { ChargeRule, Hole, ProductLibrary } from '../model/types';
import { generatePatternHoles } from '../patterns/pattern';
import {
  applyChargeRule,
  deckIntervals,
  holeCharge,
  indexLibrary,
  linearChargeDensity,
} from './charge';
import { computeCharges } from './chargeAnalysis';
import { influenceAreas } from './influence';

const lib: ProductLibrary = createDefaultLibrary();
const anfo = lib.explosives[0]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
const cartridge = lib.explosives[3]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion

function hole(length = 16.5, diameter = 0.2): Hole {
  return {
    ...createHole({
      position: { x: 0, y: 0 },
      template: DEFAULT_HOLE_TEMPLATE,
      bench: DEFAULT_BENCH,
      label: '1',
    }),
    length,
    diameter,
  };
}

const rule: ChargeRule = {
  stemmingLength: 4,
  stemmingMaterialId: lib.stemmingMaterials[0]!.id, // eslint-disable-line @typescript-eslint/no-non-null-assertion
  explosiveId: anfo.id,
  primerId: lib.primers[0]!.id, // eslint-disable-line @typescript-eslint/no-non-null-assertion
  detonatorId: lib.detonators[0]!.id, // eslint-disable-line @typescript-eslint/no-non-null-assertion
  primerOffsetFromToe: 0.5,
};

describe('carguío', () => {
  it('carga lineal a granel y encartuchada', () => {
    // ANFO 800 kg/m³ en Ø 200 mm: 800 · π·0.2²/4 = 25.133 kg/m
    expect(linearChargeDensity(anfo, 0.2)).toBeCloseTo(25.1327, 3);
    // Cartucho 1.48 kg / 0.4064 m = 3.642 kg/m (independiente del diámetro del taladro)
    expect(linearChargeDensity(cartridge, 0.2)).toBeCloseTo(3.6417, 3);
  });

  it('regla de carga: taco 4 m + ANFO 12.5 m + booster 450 g', () => {
    const h = hole();
    const loaded = { ...h, ...applyChargeRule(h, rule, lib) };
    expect(loaded.decks.map((d) => [d.kind, d.length])).toEqual([
      ['explosive', 12.5],
      ['stemming', 4],
    ]);
    const intervals = deckIntervals(loaded);
    expect(intervals[0]).toMatchObject({ top: 4, bottom: 16.5 });
    expect(loaded.initiators[0]?.depth).toBeCloseTo(16);
    expect(loaded.initiators[0]?.delay).toBe(0.5);
    const c = holeCharge(loaded, indexLibrary(lib));
    // 25.1327 kg/m · 12.5 m = 314.16 kg
    expect(c.explosive).toBeCloseTo(314.159, 2);
    expect(c.primers).toBe(0.45);
    expect(c.energy / 3.7e6).toBeCloseTo(314.159, 2);
    expect(c.emptyLength).toBe(0);
  });

  it('regla con aire y taladro más corto que el taco', () => {
    const h = hole(10);
    const withAir = applyChargeRule(h, { ...rule, airDeckLength: 1.5 }, lib);
    expect(withAir.decks.map((d) => [d.kind, d.length])).toEqual([
      ['explosive', 4.5],
      ['air', 1.5],
      ['stemming', 4],
    ]);
    const short = applyChargeRule(hole(3), rule, lib);
    expect(short.decks.map((d) => d.kind)).toEqual(['stemming']);
  });
});

describe('cubicación por área de influencia', () => {
  it('malla interior: área = burden × espaciamiento (rectangular y tresbolillo)', () => {
    for (const kind of ['rectangular', 'staggered'] as const) {
      const holes = generatePatternHoles(
        {
          id: newId<'Pattern'>(),
          name: 'P',
          kind,
          burden: 5,
          spacing: 6,
          origin: { x: 350_000, y: 8_500_000 },
          rowAzimuth: 0.3,
          rowAdvance: 'right',
          rows: 9,
          holesPerRow: 9,
          holeTemplate: DEFAULT_HOLE_TEMPLATE,
        },
        DEFAULT_BENCH,
        { startNumber: 1 },
      );
      const { areas } = influenceAreas(holes.map((h) => h.collar));
      // Taladro central (fila 4, col 4): celda de Voronoi interior = 30 m²
      expect(areas[4 * 9 + 4]).toBeCloseTo(30, 6);
    }
  });

  it('con perímetro: la suma de áreas es el área del perímetro', () => {
    const boundary = [
      { x: -3, y: -3 },
      { x: 33, y: -3 },
      { x: 33, y: 12 },
      { x: 15, y: 25 },
      { x: -3, y: 12 },
    ];
    const points = [];
    // Todos los taladros dentro del pentágono (y ≤ 10).
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) points.push({ x: i * 6, y: j * 5 });
    const { areas } = influenceAreas(points, [boundary]);
    const total = areas.reduce((a, b) => a + b, 0);
    // Área del pentágono: 36·15 + ½·36·13 = 540 + 234 = 774 m²
    expect(total).toBeCloseTo(774, 6);
  });

  it('voladura completa: volumen, tonelaje y factor de carga (caso manual)', () => {
    // 3 × 3 cuadrada B = S = 5 m, banco 15 m, perímetro a B/2 del borde → 15 × 15 = 225 m²
    const blast = createBlast('V', newId<'RockMass'>());
    const holes = [];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const h = createHole({
          position: { x: i * 5, y: j * 5 },
          template: DEFAULT_HOLE_TEMPLATE,
          bench: DEFAULT_BENCH,
          label: '',
        });
        holes.push({ ...h, ...applyChargeRule(h, rule, lib) });
      }
    }
    const r = computeCharges(
      {
        ...blast,
        holes,
        boundaries: [
          {
            id: newId<'Boundary'>(),
            name: 'P1',
            freeFaceEdges: [],
            polygon: [
              { x: -2.5, y: -2.5 },
              { x: 12.5, y: -2.5 },
              { x: 12.5, y: 12.5 },
              { x: -2.5, y: 12.5 },
            ],
          },
        ],
      },
      lib,
      2650,
    );
    expect(r.area).toBeCloseTo(225, 6);
    expect(r.volume).toBeCloseTo(3375, 6); // 225 · 15
    expect(r.tonnage).toBeCloseTo(3375 * 2650, 0);
    // 9 · (314.159 + 0.45) = 2831.48 kg → 0.8389 kg/m³, 0.3166 kg/t
    expect(r.totalExplosive + r.totalPrimers).toBeCloseTo(2831.48, 1);
    expect(r.powderFactorVolume).toBeCloseTo(0.83896, 4);
    expect(r.powderFactorMass * 1000).toBeCloseTo(0.31659, 4);
    expect(r.powderFactorPerHole[4]).toBeCloseTo((314.159 + 0.45) / 375, 4);
  });

  it('sin perímetro: contorno automático a media distancia entre vecinos', () => {
    const points = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) points.push({ x: i * 5, y: j * 5 });
    const { areas } = influenceAreas(points);
    // Envolvente 15 × 15 expandida 2.5 m (esquinas en inglete) → 20 × 20 = 400 m²
    expect(areas.reduce((a, b) => a + b, 0)).toBeCloseTo(400, 6);
    // Una sola fila (colineal): rectángulo de 20 × 5 → 100 m²
    const row = influenceAreas([0, 5, 10, 15].map((x) => ({ x, y: 0 })));
    // d3-delaunay perturba levemente los puntos colineales: tolerancia de 1e-4 m².
    expect(row.areas.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 4);
  });

  it('dos perímetros: cada taladro se recorta con el perímetro que lo contiene', () => {
    // Dos bloques de 2 × 2 taladros (B = S = 5 m) separados 40 m, cada uno con su perímetro de 10 × 10.
    const square = (x0: number) => [
      { x: x0 - 2.5, y: -2.5 },
      { x: x0 + 7.5, y: -2.5 },
      { x: x0 + 7.5, y: 7.5 },
      { x: x0 - 2.5, y: 7.5 },
    ];
    const points = [];
    for (const x0 of [0, 40])
      for (let i = 0; i < 2; i++)
        for (let j = 0; j < 2; j++) points.push({ x: x0 + i * 5, y: j * 5 });
    const { areas, autoBoundary } = influenceAreas(points, [square(0), square(40)]);
    expect(autoBoundary).toBeNull();
    for (const a of areas) expect(a).toBeCloseTo(25, 6);
  });
});
