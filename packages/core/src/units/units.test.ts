import { describe, expect, it } from 'vitest';
import {
  degToRad,
  diameterFromDisplay,
  diameterToDisplay,
  ftToM,
  lengthFromDisplay,
  lengthToDisplay,
  mToFt,
  mToMm,
  mmToM,
  msToS,
  radToDeg,
  sToMs,
} from './units';

describe('conversiones de unidades', () => {
  it('grados ↔ radianes', () => {
    expect(degToRad(180)).toBeCloseTo(Math.PI, 12);
    expect(radToDeg(Math.PI / 2)).toBeCloseTo(90, 12);
  });

  it('diámetro de taladro: 311 mm (12¼") ↔ m', () => {
    expect(mmToM(311)).toBeCloseTo(0.311, 12);
    expect(mToMm(0.311)).toBeCloseTo(311, 9);
  });

  it('retardos: 17 ms ↔ s', () => {
    expect(msToS(17)).toBeCloseTo(0.017, 12);
    expect(sToMs(0.042)).toBeCloseTo(42, 9);
  });

  it('pies ↔ metros (1 ft = 0.3048 m exactos)', () => {
    expect(ftToM(1)).toBeCloseTo(0.3048, 12);
    expect(mToFt(15)).toBeCloseTo(49.2126, 4);
  });

  it('unidades de visualización (H-104): CR-01, Ø 12¼" = 311,15 mm; B = 25,52 ft = 7,779 m', () => {
    // docs/theory/04 CR-01: Ø = 12¼" (0,31115 m) y Ash B = 25,5 ft ≈ 7,78 m
    expect(diameterToDisplay(0.31115, 'in')).toBeCloseTo(12.25, 12);
    expect(diameterToDisplay(0.31115, 'mm')).toBeCloseTo(311.15, 9);
    expect(diameterFromDisplay(12.25, 'in')).toBeCloseTo(0.31115, 12);
    expect(lengthFromDisplay(25.520833, 'ft')).toBeCloseTo(7.779, 3);
    expect(lengthToDisplay(15, 'm')).toBe(15);
    expect(lengthFromDisplay(lengthToDisplay(123.456, 'ft'), 'ft')).toBeCloseTo(123.456, 12);
  });
});
