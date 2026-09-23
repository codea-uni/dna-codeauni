import { describe, expect, it } from 'vitest';
import { degToRad, ftToM, mToFt, mToMm, mmToM, msToS, radToDeg, sToMs } from './units';

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
});
