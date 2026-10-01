import { describe, expect, it } from 'vitest';
import { applyChargeRule, linearChargeDensity } from '../charging/charge';
import { createBlast, createHole, DEFAULT_BENCH, DEFAULT_HOLE_TEMPLATE } from '../model/factories';
import { newId } from '../model/ids';
import { createDefaultLibrary } from '../model/library';
import type { Blast, Explosive } from '../model/types';
import { marchingSquares } from './contours';
import {
  computeEnergyGrid,
  criticalPpv,
  DEFAULT_ENERGY_OPTIONS,
  holmbergPerssonPpv,
} from './energy';

const lib = createDefaultLibrary();
function first<T>(list: readonly T[]): T {
  const v = list[0];
  if (v === undefined) throw new Error('librería incompleta');
  return v;
}
const anfo = first(lib.explosives);
const stemming = first(lib.stemmingMaterials);

/** Un taladro vertical Ø 200 mm, 16.5 m, taco 4 m → ANFO de 4 a 16.5 m de profundidad (boca en z = 15). */
function singleHoleBlast(): Blast {
  const h = createHole({
    position: { x: 0, y: 0 },
    template: DEFAULT_HOLE_TEMPLATE,
    bench: DEFAULT_BENCH,
    label: '1',
  });
  const loaded = {
    ...h,
    ...applyChargeRule(
      h,
      {
        stemmingLength: 4,
        stemmingMaterialId: stemming.id,
        explosiveId: anfo.id,
        primerOffsetFromToe: 0.5,
      },
      lib,
    ),
  };
  return { ...createBlast('V', newId<'RockMass'>()), holes: [loaded] };
}

/** Valor de la celda más cercana a (x, y) y el centro de esa celda. */
function cellAt(r: ReturnType<typeof computeEnergyGrid>, x: number, y: number) {
  const i = Math.floor((x - r.originX) / r.cellSize);
  const j = Math.floor((y - r.originY) / r.cellSize);
  if (i < 0 || j < 0 || i >= r.nx || j >= r.ny) throw new Error('fuera de la grilla');
  return {
    v: r.values[j * r.nx + i] ?? NaN,
    cx: r.originX + (i + 0.5) * r.cellSize,
    cy: r.originY + (j + 0.5) * r.cellSize,
  };
}

describe('energía', () => {
  it('Holmberg–Persson contra la solución analítica (β/2α = 1)', () => {
    // Con α = 0.75, β = 1.5: S = ∫ q dx / (r² + x²) = q/r · [atan(L₁/r) + atan(L₂/r)]; v = K·S^α.
    // Plano a z = 4.75 (mitad de la carga: la carga va de z = 11 a z = −1.5) → L₁ = L₂ = 6.25 m.
    const nearField = { k: 0.7, alpha: 0.75, beta: 1.5 };
    const r = computeEnergyGrid(singleHoleBlast(), lib, {
      ...DEFAULT_ENERGY_OPTIONS,
      nearField,
      elevation: 4.75,
      cellSize: 0.5,
      cutoff: 30,
    });
    const q = linearChargeDensity(anfo, 0.2);
    for (const x of [1, 3, 6]) {
      const { v, cx, cy } = cellAt(r, x, 0.1);
      const rr = Math.hypot(cx, cy);
      const S = (q / rr) * 2 * Math.atan(6.25 / rr);
      expect(v / (0.7 * Math.pow(S, 0.75))).toBeCloseTo(1, 2); // error < 0.5 %
    }
  });

  it('densidad de carga: la integral sobre el plano es la carga lineal q [kg/m]', () => {
    const r = computeEnergyGrid(singleHoleBlast(), lib, {
      ...DEFAULT_ENERGY_OPTIONS,
      metric: 'chargeDensity',
      sigma: 1,
      elevation: 4.75,
      cellSize: 0.2,
    });
    let total = 0;
    for (const v of r.values) total += v;
    total *= r.cellSize * r.cellSize;
    expect(total / linearChargeDensity(anfo, 0.2)).toBeCloseTo(1, 2);
  });

  it('taladro inclinado: el máximo sigue al eje en la cota evaluada', () => {
    const b = singleHoleBlast();
    const h = b.holes[0];
    if (!h) throw new Error('falta');
    // Inclinado 20° hacia el Este: a z = 4.75 el eje está en x = (15 − 4.75)·tan 20° = 3.73 m.
    const inclined = {
      ...b,
      holes: [
        {
          ...h,
          inclination: (20 * Math.PI) / 180,
          azimuth: Math.PI / 2,
          length: 16.5 / Math.cos((20 * Math.PI) / 180),
        },
      ],
    };
    const r = computeEnergyGrid(inclined, lib, {
      ...DEFAULT_ENERGY_OPTIONS,
      elevation: 4.75,
      cellSize: 0.25,
    });
    let best = 0;
    let bx = 0;
    for (let k = 0; k < r.values.length; k++) {
      if ((r.values[k] ?? 0) > best) {
        best = r.values[k] ?? 0;
        bx = r.originX + ((k % r.nx) + 0.5) * r.cellSize;
      }
    }
    expect(bx).toBeCloseTo(3.73, 0);
    expect(r.contourLevels.length).toBeGreaterThan(0);
    expect(r.areaAbove[0]).toBeGreaterThan(r.areaAbove.at(-1) ?? Infinity);
  });

  it('marching squares: campo f = x da contornos verticales en x = nivel', () => {
    const nx = 10;
    const ny = 6;
    const values = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) values[j * nx + i] = i + 0.5; // f = x en centros
    const c = marchingSquares({ originX: 0, originY: 0, cellSize: 1, nx, ny, values }, [3.25, 7.6]);
    expect(c.levels.length).toBe(2 * (ny - 1));
    for (let k = 0; k < c.levels.length; k++) {
      expect(c.segments[k * 4]).toBeCloseTo(c.levels[k] ?? NaN, 5);
      expect(c.segments[k * 4 + 2]).toBeCloseTo(c.levels[k] ?? NaN, 5);
    }
  });
});

describe('energía con varios taladros', () => {
  it('PPV: el valor es el máximo entre taladros, no la suma', () => {
    const one = singleHoleBlast();
    const h = one.holes[0];
    if (!h) throw new Error('falta');
    // Dos taladros a 10 m (α = 0.75, β = 1.5 para tener solución cerrada): en cada punto el valor
    // es el del taladro más cercano, v = K·S(r_min)^α, no K·(S₁ + S₂)^α.
    const two = {
      ...one,
      holes: [h, { ...h, id: newId<'Hole'>(), collar: { ...h.collar, x: 10 } }],
    };
    const nearField = { k: 0.7, alpha: 0.75, beta: 1.5 };
    const r = computeEnergyGrid(two, lib, {
      ...DEFAULT_ENERGY_OPTIONS,
      nearField,
      elevation: 4.75,
      cellSize: 0.5,
      cutoff: 30,
    });
    const q = linearChargeDensity(anfo, 0.2);
    const S = (rr: number) => (q / rr) * 2 * Math.atan(6.25 / rr);
    for (const x of [3, 4.6, 7.2]) {
      const { v, cx, cy } = cellAt(r, x, 0.1);
      const rMin = Math.min(Math.hypot(cx, cy), Math.hypot(cx - 10, cy));
      expect(v / (0.7 * Math.pow(S(rMin), 0.75))).toBeCloseTo(1, 2);
    }
  });
});

describe('Holmberg–Persson: ejemplo resuelto de R1 F25 (X-D1 HOLMBERG Fit)', () => {
  // q = 75,75 kg/m, columna de 8,7 m al fondo de un taladro de 16 m, geófono en superficie (G = 0),
  // K = 982 mm/s, α = 1,2068. Esperado: 36 mm/s a 100 m; 184 a 50 m; 6,9 a 200 m; 2,6 a 300 m.
  const cases: [number, number, number][] = [
    [100, 36, 0.01],
    [50, 184, 0.005],
    [200, 6.9, 0.005],
    [300, 2.6, 0.005],
  ];
  const base = {
    linearCharge: 75.75,
    chargeLength: 8.7,
    chargeBottomDepth: 16,
    k: 982,
    alpha: 1.2068,
  };

  it('forma cerrada PPV = K·[(q/R)·Δθ]^α', () => {
    for (const [R, expected, tol] of cases) {
      const v = holmbergPerssonPpv({ ...base, distance: R });
      expect(Math.abs(v / expected - 1)).toBeLessThanOrEqual(tol);
    }
  });

  it('la grilla (integral por tramos, β = 2α) coincide con la forma cerrada en campo cercano', () => {
    const D = 0.311;
    const q = 75.75;
    const ex: Explosive = {
      ...anfo,
      id: newId<'Explosive'>(),
      density: q / ((Math.PI / 4) * D * D),
    };
    const lib2 = { ...lib, explosives: [ex] };
    const h = createHole({
      position: { x: 0, y: 0 },
      template: { ...DEFAULT_HOLE_TEMPLATE, diameter: D, subdrill: 0 },
      bench: DEFAULT_BENCH,
      label: '1',
    });
    const hole = {
      ...h,
      length: 16,
      decks: [
        // De fondo a boca: 8,7 m de carga y 7,3 m de taco.
        { id: newId<'Deck'>(), kind: 'explosive' as const, explosiveId: ex.id, length: 8.7 },
        { id: newId<'Deck'>(), kind: 'stemming' as const, materialId: stemming.id, length: 7.3 },
      ],
    };
    // Un segundo taladro igual a 400 m solo extiende la grilla (queda fuera del radio de 30 m).
    const far = { ...hole, id: newId<'Hole'>(), collar: { ...hole.collar, x: 400 } };
    const blast = { ...createBlast('F25', newId<'RockMass'>()), holes: [hole, far] };
    const r = computeEnergyGrid(blast, lib2, {
      ...DEFAULT_ENERGY_OPTIONS,
      nearField: { k: 0.982, alpha: 1.2068, beta: 2 * 1.2068 },
      elevation: hole.collar.z,
      cellSize: 1,
      cutoff: 30,
    });
    // Campo cercano (R ≲ 3·L_c ≈ 26 m, P-17): la grilla contra la forma cerrada validada arriba.
    for (const R of [5, 10, 20]) {
      const { v, cx, cy } = cellAt(r, R, 0.5);
      const exact = holmbergPerssonPpv({ ...base, k: 0.982, distance: Math.hypot(cx, cy) });
      expect(Math.abs(v / exact - 1)).toBeLessThanOrEqual(0.01);
    }
  });
});

describe('VPPc (P-17)', () => {
  const rock = { tensileStrength: 8e6, vp: 4500, youngModulus: 45e9 };
  it('sin dato del usuario: RT·Vp/E (8 MPa · 4500 m/s / 45 GPa = 0,8 m/s, dentro de 0,7–1,0 de roca dura)', () => {
    expect(criticalPpv(rock)).toEqual({ value: 0.8, computed: true });
  });
  it('el dato de retroanálisis manda; sin RT, Vp o VPPc no hay valor', () => {
    expect(criticalPpv({ ...rock, vppc: 3.11 })).toEqual({ value: 3.11, computed: false });
    expect(criticalPpv({ youngModulus: 45e9 })).toBeNull();
  });
});

describe('energía solo en la roca (A7b)', () => {
  it('delante de la cara libre, más allá del talud, no hay energía', async () => {
    const { buildExample, EXAMPLE_SPECS } = await import('../examples/examples');
    const project = buildExample(EXAMPLE_SPECS.muckpile);
    const blast = project.blasts[0];
    if (!blast) throw new Error('sin voladura');
    // Plano a media altura (3505): la cara a 75° está 5·cot 75° = 1,34 m delante de la cresta.
    const opts = { ...DEFAULT_ENERGY_OPTIONS, elevation: 3505, cellSize: 0.5 };
    const clipped = computeEnergyGrid(blast, project.library, opts);
    const open = computeEnergyGrid(blast, project.library, { ...opts, clipToRock: false });
    const at = (g: typeof clipped, x: number, y: number) => {
      const i = Math.floor((x - g.originX) / g.cellSize);
      const j = Math.floor((y - g.originY) / g.cellSize);
      return g.values[j * g.nx + i] ?? NaN;
    };
    const x = 345_200 + 22.5; // frente a un taladro de la primera fila
    const crest = 8_512_400 + 14;
    expect(at(open, x, crest + 1.8)).toBeGreaterThan(0);
    expect(at(clipped, x, crest + 1.8)).toBe(0); // aire: 1,8 m > 1,34 m
    expect(at(clipped, x, crest + 0.5)).toBeGreaterThan(0); // roca del talud
    expect(at(clipped, x, crest - 2)).toBe(at(open, x, crest - 2)); // dentro del perímetro, igual
  });
});
