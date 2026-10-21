import { describe, expect, it } from 'vitest';
import { CRS_PRESETS, LOCAL_MINE_CRS, crsLabel, searchCrsPresets } from './crsPresets';
import { isKnownCrs, reprojectXyz } from './reproject';

describe('sistemas de coordenadas por país', () => {
  it('Perú, Chile y Argentina con sus zonas; las locales no se reproyectan', () => {
    const of = (c: string) => CRS_PRESETS.filter((p) => p.country === c).map((p) => p.epsg);
    expect(of('PE')).toEqual(expect.arrayContaining([32717, 32718, 32719]));
    expect(of('CL')).toEqual([32718, 32719]);
    // POSGAR 2007 fajas 1–7 = EPSG 5343–5349 (registro EPSG) y UTM 19S–21S.
    expect(of('AR')).toEqual([5343, 5344, 5345, 5346, 5347, 5348, 5349, 32719, 32720, 32721]);
    expect(of('local')).toEqual([LOCAL_MINE_CRS]);
    expect(isKnownCrs(LOCAL_MINE_CRS)).toBe(false);
    // Todos los demás atajos se pueden reproyectar entre sí.
    for (const p of CRS_PRESETS) if (p.country !== 'local') expect(isKnownCrs(p.epsg)).toBe(true);
  });

  it('busca por país sin tildes, por zona y por código', () => {
    expect(searchCrsPresets('peru 18s').map((p) => p.epsg)).toEqual([32718, 24878]);
    expect(searchCrsPresets('Perú').every((p) => p.country === 'PE')).toBe(true);
    expect(searchCrsPresets('faja 3').map((p) => p.epsg)).toEqual([5345]);
    expect(searchCrsPresets('argentina 20s').map((p) => p.epsg)).toEqual([32720]);
    expect(searchCrsPresets('32719').map((p) => p.country)).toEqual(['PE', 'CL', 'AR']);
    expect(searchCrsPresets('local').map((p) => p.epsg)).toEqual([LOCAL_MINE_CRS]);
    expect(searchCrsPresets('  ')).toHaveLength(CRS_PRESETS.length);
    expect(searchCrsPresets('bolivia')).toEqual([]);
  });

  it('nombre legible de un código', () => {
    expect(crsLabel(32718)).toBe('WGS 84 / UTM 18S');
    expect(crsLabel(5347)).toBe('POSGAR 2007 / Argentina faja 5');
    expect(crsLabel(LOCAL_MINE_CRS)).toBe('Coordenadas locales de mina');
    expect(crsLabel(2000)).toBe('EPSG 2000');
  });

  it('POSGAR 2007 faja 3: el meridiano central (66° O) a 30° S es E 3 500 000, N ≈ 6 681 852', () => {
    // EPSG 5345: falso Este 3 500 000 m sobre λ0 = −66°, falso Norte 0 en el polo sur. El Norte es
    // el cuadrante meridiano de GRS 80 (10 001 965,729 m, Moritz 1980) menos el arco de meridiano
    // del ecuador a 30° (3 320 113,40 m).
    const p = [-66, -30, 0];
    reprojectXyz(p, 4326, 5345);
    expect(p[0]).toBeCloseTo(3_500_000, 3);
    expect(Math.abs((p[1] ?? 0) - (10_001_965.729 - 3_320_113.4))).toBeLessThan(1);
  });
});
