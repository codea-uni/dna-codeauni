import { describe, expect, it } from 'vitest';
import { createDefaultLibrary } from '../model/library';
import type { Explosive } from '../model/types';
import { exportExplosivesCsv, importExplosivesCsv } from './catalogCsv';
import { parseCsv } from './csv';

describe('catálogo de explosivos en CSV (H-401)', () => {
  it('ida y vuelta sin perder propiedades, fuente ni versión', () => {
    const original = createDefaultLibrary().explosives.map((e) => ({
      ...e,
      criticalDiameter: 0.05,
      densityRange: { min: 750, max: 850 },
    }));
    const r = importExplosivesCsv(parseCsv(exportExplosivesCsv(original), ',', true));
    expect(r.errors).toEqual([]);
    const withoutId = (e: Explosive) => ({ ...e, id: '' });
    expect(r.explosives.map(withoutId)).toEqual(original.map(withoutId));
  });

  it('energía en kcal/kg (1 kcal = 4,184 kJ) y filas inválidas con su línea', () => {
    const csv =
      'name;density_kg_m3;vod_m_s;energy_kcal_kg;family\nANFO;800;3800;900;anfo\nMalo;;3800;900;anfo\n';
    const r = importExplosivesCsv(parseCsv(csv));
    expect(r.explosives[0]?.energy).toBeCloseTo(900 * 4184, 6);
    expect(r.explosives[0]?.family).toBe('anfo');
    expect(r.errors.map((e) => e.line)).toEqual([3]);
  });
});
