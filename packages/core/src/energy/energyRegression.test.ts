import { describe, expect, it } from 'vitest';
import { applyChargeRule } from '../charging/charge';
import { createBlast, createHole, DEFAULT_BENCH, DEFAULT_HOLE_TEMPLATE } from '../model/factories';
import { newId } from '../model/ids';
import { createDefaultLibrary } from '../model/library';
import type { Blast } from '../model/types';
import { computeEnergyGrid, DEFAULT_ENERGY_OPTIONS, type EnergyResult } from './energy';

/**
 * Regresión del plano horizontal (banco): huellas tomadas ANTES de generalizar `computeEnergyGrid`
 * a planos arbitrarios. El caso horizontal no debe cambiar ni un valor.
 */
const lib = createDefaultLibrary();
function first<T>(list: readonly T[]): T {
  const v = list[0];
  if (v === undefined) throw new Error('librería incompleta');
  return v;
}
const anfo = first(lib.explosives);
const stemming = first(lib.stemmingMaterials);

function blastOf(inclinations: readonly number[]): Blast {
  const holes = inclinations.map((inc, k) => {
    const h = createHole({
      position: { x: k * 5, y: (k % 2) * 4 },
      template: { ...DEFAULT_HOLE_TEMPLATE, inclination: inc, azimuth: 0.3 * k },
      bench: DEFAULT_BENCH,
      label: String(k + 1),
    });
    return {
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
  });
  return { ...createBlast('R', newId<'RockMass'>()), holes };
}

function fingerprint(r: EnergyResult) {
  let sum = 0;
  for (const v of r.values) sum += v;
  let rgba = 0;
  for (const v of r.rgba) rgba += v;
  return {
    nx: r.nx,
    ny: r.ny,
    originX: Number(r.originX.toFixed(6)),
    originY: Number(r.originY.toFixed(6)),
    cell: Number(r.cellSize.toFixed(6)),
    sum: Number(sum.toPrecision(10)),
    max: Number(r.max.toPrecision(10)),
    rgba,
    segments: r.contours.segments.length,
    levels: r.contourLevels,
  };
}

const PPV_LEVELS = [0.25, 0.5, 0.7, 1, 2, 5, 10];
const EXPECTED = {
  'vertical nearFieldPpv': {
    nx: 40,
    ny: 31,
    originX: -7.5,
    originY: -7.5,
    cell: 0.625,
    sum: 3971.486745,
    max: 34.57269262,
    rgba: 877064,
    segments: 1216,
    levels: PPV_LEVELS,
  },
  'vertical chargeDensity': {
    nx: 40,
    ny: 31,
    originX: -7.5,
    originY: -7.5,
    cell: 0.625,
    sum: 180.097639,
    max: 0.9323030576,
    rgba: 381066,
    segments: 1256,
    levels: [0.2, 0.4, 0.6, 0.8],
  },
  'inclinados nearFieldPpv': {
    nx: 40,
    ny: 34,
    originX: -7.5,
    originY: -7.5,
    cell: 0.625,
    sum: 4306.558538,
    max: 33.85687982,
    rgba: 962606,
    segments: 1256,
    levels: PPV_LEVELS,
  },
  'inclinados chargeDensity': {
    nx: 40,
    ny: 34,
    originX: -7.5,
    originY: -7.5,
    cell: 0.625,
    sum: 185.1944375,
    max: 0.9412458954,
    rgba: 414942,
    segments: 1320,
    levels: [0.2, 0.4, 0.6, 0.8],
  },
} as const;

describe('energía: regresión del plano horizontal', () => {
  for (const [name, incs] of [
    ['vertical', [0, 0, 0]],
    ['inclinados', [0.2, 0.3, 0]],
  ] as const) {
    for (const metric of ['nearFieldPpv', 'chargeDensity'] as const) {
      it(`${name} · ${metric}`, () => {
        const r = computeEnergyGrid(blastOf(incs), lib, {
          ...DEFAULT_ENERGY_OPTIONS,
          metric,
          elevation: 8,
        });
        expect(fingerprint(r)).toEqual(EXPECTED[`${name} ${metric}`]);
      });
    }
  }
});

describe('energía en un plano arbitrario', () => {
  it('el plano horizontal explícito reproduce el cálculo de banco (taladros inclinados)', () => {
    const blast = blastOf([0.2, 0.3, 0.25]);
    const opts = { ...DEFAULT_ENERGY_OPTIONS, elevation: 8, clipToRock: false, cutoff: 20 };
    const flat = computeEnergyGrid(blast, lib, opts);
    const plane = computeEnergyGrid(blast, lib, {
      ...opts,
      cellSize: flat.cellSize,
      plane: {
        origin: { x: 0, y: 0, z: 8 },
        u: { x: 1, y: 0, z: 0 },
        v: { x: 0, y: 1, z: 0 },
        bounds: {
          minU: flat.originX,
          minV: flat.originY,
          maxU: flat.originX + (flat.nx - 0.5) * flat.cellSize,
          maxV: flat.originY + (flat.ny - 0.5) * flat.cellSize,
        },
      },
    });
    expect(plane.nx).toBe(flat.nx);
    expect(plane.ny).toBe(flat.ny);
    expect(plane.plane).toBeDefined();
    for (let k = 0; k < flat.values.length; k++)
      expect(plane.values[k]).toBeCloseTo(flat.values[k] ?? NaN, 6);
  });

  it('plano vertical perpendicular a taladros horizontales: el halo se centra en cada taladro', () => {
    // Dos taladros horizontales de 4 m hacia el norte (inclinación π/2, azimut 0) a 1 m entre sí.
    const base = blastOf([0, 0]);
    const holes = base.holes.map((h, k) => {
      const flat = {
        ...h,
        collar: { x: k, y: 8, z: 2 },
        azimuth: 0,
        inclination: Math.PI / 2,
        length: 4,
        subdrill: 0,
      };
      return {
        ...flat,
        ...applyChargeRule(
          flat,
          {
            stemmingLength: 0.5,
            stemmingMaterialId: stemming.id,
            explosiveId: anfo.id,
            primerOffsetFromToe: 0.3,
          },
          lib,
        ),
      };
    });
    const blast = { ...base, holes };
    const r = computeEnergyGrid(blast, lib, {
      ...DEFAULT_ENERGY_OPTIONS,
      elevation: 0,
      cutoff: 4,
      cellSize: 0.05,
      plane: {
        origin: { x: 0, y: 10, z: 0 },
        u: { x: 1, y: 0, z: 0 },
        v: { x: 0, y: 0, z: 1 },
        bounds: { minU: -2, minV: 0, maxU: 3, maxV: 4 },
      },
    });
    const at = (a: number, b: number) =>
      r.values[
        Math.floor((b - r.originY) / r.cellSize) * r.nx + Math.floor((a - r.originX) / r.cellSize)
      ] ?? NaN;
    // Máximo junto a los ejes (a = 0 y a = 1, b = 2) y decae con la distancia.
    expect(at(0.06, 2.01)).toBeGreaterThan(at(0.5, 3));
    expect(at(1.06, 2.01)).toBeGreaterThan(at(1.06, 3.5));
    expect(at(0.5, 3)).toBeGreaterThan(at(-1.5, 0.2));
    expect(r.max).toBeGreaterThan(1);
  });

  it('sin cargas cerca del plano devuelve una grilla vacía', () => {
    const blast = blastOf([0]);
    const r = computeEnergyGrid(blast, lib, {
      ...DEFAULT_ENERGY_OPTIONS,
      elevation: 0,
      cutoff: 2,
      plane: { origin: { x: 0, y: 0, z: 500 }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 1, z: 0 } },
    });
    expect(r.nx).toBe(0);
  });
});
