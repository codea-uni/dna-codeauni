import { describe, expect, it } from 'vitest';
import { computeEnergyGrid, DEFAULT_ENERGY_OPTIONS } from '../energy/energy';
import { buildExample, EXAMPLE_SPECS } from '../examples/examples';
import { computeVibration, DEFAULT_VIBRATION_OPTIONS } from './vibration';

/**
 * Mapas evaluados sobre el terreno (receptores a la cota del levantamiento). Los valores esperados
 * salen de invariantes, no de la fórmula: un terreno plano a la cota de evaluación da el mismo
 * mapa que el plano de siempre, y un terreno más alto (más lejos de las cargas) da menos PPV.
 */
const project = buildExample(EXAMPLE_SPECS.production);
const blast = project.blasts[0];
if (!blast) throw new Error('sin voladura');
const top = blast.bench.floorElevation + blast.bench.height;
const flatAt = (z: number) => ({ elevationAt: () => z });

describe('vibración sobre el terreno', () => {
  const plane = computeVibration(project, blast, DEFAULT_VIBRATION_OPTIONS);

  it('un terreno plano a la cota del banco da exactamente el mapa de siempre', () => {
    const draped = computeVibration(project, blast, DEFAULT_VIBRATION_OPTIONS, flatAt(top));
    expect(draped.nx).toBe(plane.nx);
    expect(draped.values).toEqual(plane.values);
  });

  it('con el terreno 40 m más alto los receptores quedan más lejos: el PPV baja en todo el mapa', () => {
    const higher = computeVibration(project, blast, DEFAULT_VIBRATION_OPTIONS, flatAt(top + 40));
    let lower = 0;
    for (let k = 0; k < plane.values.length; k++) {
      const a = plane.values[k] ?? 0;
      const b = higher.values[k] ?? 0;
      expect(b).toBeLessThanOrEqual(a);
      if (b < a) lower++;
    }
    expect(lower).toBeGreaterThan(plane.values.length / 2);
  });

  it('fuera del levantamiento (sin cota) el receptor vuelve a la cota del banco', () => {
    const none = computeVibration(project, blast, DEFAULT_VIBRATION_OPTIONS, {
      elevationAt: () => null,
    });
    expect(none.values).toEqual(plane.values);
  });
});

describe('energía sobre el terreno', () => {
  const lib = project.library;
  const mid = blast.bench.floorElevation + blast.bench.height / 2;
  const options = { ...DEFAULT_ENERGY_OPTIONS, elevation: mid, clipToRock: false };

  it('un terreno plano a la cota del plano reproduce el corte horizontal (otro camino de cálculo)', () => {
    const plane = computeEnergyGrid(blast, lib, options);
    const draped = computeEnergyGrid(blast, lib, { ...options, onTerrain: true }, flatAt(mid));
    expect(plane.onTerrain).toBe(false);
    expect(draped.onTerrain).toBe(true);
    expect(draped.nx).toBe(plane.nx);
    const diffs: number[] = [];
    for (let k = 0; k < plane.values.length; k++) {
      const a = plane.values[k] ?? 0;
      const b = draped.values[k] ?? 0;
      if (a > plane.max * 1e-3) diffs.push(Math.abs(b - a) / a);
    }
    diffs.sort((x, y) => x - y);
    // Iguales salvo junto al eje de cada taladro, donde la tabla radial del plano interpola sobre
    // el gradiente más fuerte (≈ 1 % de las celdas, < 2 %).
    expect(diffs[Math.floor(diffs.length / 2)]).toBeLessThan(1e-4);
    expect(diffs.at(-1)).toBeLessThan(0.02);
  });

  it('sin la opción, la topografía no cambia la cota evaluada (solo recorta el aire)', () => {
    const plane = computeEnergyGrid(blast, lib, options);
    const ignored = computeEnergyGrid(blast, lib, options, flatAt(top + 100));
    expect(ignored.values).toEqual(plane.values);
    expect(ignored.onTerrain).toBe(false);
  });

  it('en la superficie del banco (zona del taco) el PPV máximo es menor que a mitad de banco', () => {
    const plane = computeEnergyGrid(blast, lib, options);
    const surface = computeEnergyGrid(blast, lib, { ...options, onTerrain: true }, flatAt(top));
    expect(surface.max).toBeGreaterThan(0);
    expect(surface.max).toBeLessThan(plane.max);
  });
});
