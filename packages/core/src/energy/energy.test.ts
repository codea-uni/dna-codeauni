import { describe, expect, it } from 'vitest';
import { applyChargeRule, linearChargeDensity } from '../charging/charge';
import { createBlast, createHole, DEFAULT_BENCH, DEFAULT_HOLE_TEMPLATE } from '../model/factories';
import { newId } from '../model/ids';
import { createDefaultLibrary } from '../model/library';
import type { Blast } from '../model/types';
import { marchingSquares } from './contours';
import { computeEnergyGrid, DEFAULT_ENERGY_OPTIONS } from './energy';

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
