import { describe, expect, it } from 'vitest';
import { holeToe } from '../geometry/hole';
import { DEFAULT_BENCH, DEFAULT_HOLE_TEMPLATE } from '../model/factories';
import { newId } from '../model/ids';
import { generatePatternHoles } from '../patterns/pattern';
import {
  DEFAULT_CSV_UNITS,
  exportHolesCsv,
  guessHoleMapping,
  importHolesFromCsv,
  parseCsv,
  parseNumber,
} from './csv';

const defaults = { diameter: 0.2, subdrill: 1.5, bench: DEFAULT_BENCH, startNumber: 1 };

describe('CSV', () => {
  it('parsea comillas, separador ; y coma decimal', () => {
    const t = parseCsv('Nombre;Este;Norte\r\n"A;1";350000,5;8500000,25\r\n"B ""x""";1;2\r\n\r\n');
    expect(t.delimiter).toBe(';');
    expect(t.headers).toEqual(['Nombre', 'Este', 'Norte']);
    expect(t.rows).toEqual([
      ['A;1', '350000,5', '8500000,25'],
      ['B "x"', '1', '2'],
    ]);
    expect(parseNumber('1.234,5')).toBe(1234.5);
    expect(parseNumber('abc')).toBeNaN();
  });

  it('adivina el mapeo por encabezados en español e inglés', () => {
    const m = guessHoleMapping([
      'Taladro',
      'Este',
      'Norte',
      'Cota',
      'Longitud',
      'Diámetro (mm)',
      'Inclinación',
      'Azimut',
    ]);
    expect(m).toMatchObject({
      label: 0,
      x: 1,
      y: 2,
      z: 3,
      length: 4,
      diameter: 5,
      inclination: 6,
      azimuth: 7,
    });
    expect(guessHoleMapping(['hole_id', 'toe_x', 'x', 'y', 'z'])).toMatchObject({
      label: 0,
      toeX: 1,
      x: 2,
    });
  });

  it('ida y vuelta sin pérdida de geometría (UTM, inclinados)', () => {
    const holes = generatePatternHoles(
      {
        id: newId<'Pattern'>(),
        name: 'P',
        kind: 'staggered',
        burden: 6,
        spacing: 7,
        origin: { x: 345_678.1234, y: 8_512_345.9876 },
        rowAzimuth: 0.6,
        rowAdvance: 'left',
        rows: 4,
        holesPerRow: 5,
        holeTemplate: {
          ...DEFAULT_HOLE_TEMPLATE,
          inclination: 0.2,
          azimuth: 2.1,
          diameter: 0.2699,
        },
      },
      DEFAULT_BENCH,
      { startNumber: 1 },
    );
    const text = exportHolesCsv(holes);
    const table = parseCsv(text);
    const { holes: back, errors } = importHolesFromCsv(
      table,
      guessHoleMapping(table.headers),
      DEFAULT_CSV_UNITS,
      defaults,
    );
    expect(errors).toEqual([]);
    expect(back).toHaveLength(holes.length);
    back.forEach((h, i) => {
      const o = holes[i];
      if (!o) throw new Error('falta');
      expect(h.label).toBe(o.label);
      expect(h.collar.x).toBeCloseTo(o.collar.x, 4);
      expect(h.collar.y).toBeCloseTo(o.collar.y, 4);
      expect(h.length).toBeCloseTo(o.length, 4);
      expect(h.diameter).toBeCloseTo(o.diameter, 6);
      expect(h.inclination).toBeCloseTo(o.inclination, 6);
      expect(h.azimuth).toBeCloseTo(o.azimuth, 6);
      expect(holeToe(h).z).toBeCloseTo(holeToe(o).z, 3);
      expect([h.row, h.col]).toEqual([o.row, o.col]);
    });
  });

  it('unidades imperiales, buzamiento desde la horizontal y longitud hasta piso', () => {
    const table = parseCsv('id,x,y,z,dip,az,dia\nA,100,200,49.2126,80,90,7.875\nB,x,1,1,0,0,1\n');
    const { holes, errors } = importHolesFromCsv(
      table,
      { label: 0, x: 1, y: 2, z: 3, inclination: 4, azimuth: 5, diameter: 6 },
      { length: 'ft', diameter: 'in', angle: 'deg', inclination: 'fromHorizontal' },
      defaults,
    );
    expect(errors).toEqual([{ line: 3, message: 'X o Y de boca no numéricos' }]);
    const h = holes[0];
    if (!h) throw new Error('falta');
    expect(h.collar.x).toBeCloseTo(30.48); // 100 ft
    expect(h.collar.z).toBeCloseTo(15, 4); // 49.2126 ft
    expect(h.diameter).toBeCloseTo(0.200025, 6); // 7⅞″
    expect(h.inclination).toBeCloseTo((10 * Math.PI) / 180, 9); // 80° desde la horizontal = 10° desde la vertical
    expect(h.azimuth).toBeCloseTo(Math.PI / 2, 9);
    // (15 − 0 + 1.5) / cos 10° = 16.754 m
    expect(h.length).toBeCloseTo(16.7545, 3);
  });

  it('geometría desde boca y fondo', () => {
    const table = parseCsv('x,y,z,toe_x,toe_y,toe_z\n0,0,15,3,4,3\n');
    const { holes } = importHolesFromCsv(
      table,
      guessHoleMapping(table.headers),
      DEFAULT_CSV_UNITS,
      defaults,
    );
    const h = holes[0];
    if (!h) throw new Error('falta');
    expect(h.length).toBeCloseTo(13); // √(3² + 4² + 12²)
    expect(h.inclination).toBeCloseTo(Math.atan2(5, 12));
    expect(h.azimuth).toBeCloseTo(Math.atan2(3, 4));
    expect(h.label).toBe('1');
  });
});
