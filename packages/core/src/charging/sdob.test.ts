import { describe, expect, it } from 'vitest';
import { sdobBand, stemmingForSdob } from './sdob';

describe('SDOB: bandas y taco inverso (A4)', () => {
  it('bandas con los cortes de R1 F12 / P-20 (0,62; 0,92; 1,44; 1,84)', () => {
    const cuts = [0.62, 0.92, 1.44, 1.84];
    expect([0.5, 0.62, 0.9, 0.92, 1.4, 1.44, 1.8, 1.84, 2.4].map((v) => sdobBand(v, cuts))).toEqual(
      [0, 1, 1, 2, 2, 3, 3, 4, 4],
    );
  });
  it('CR-02 fila 13: con SD = 1,459 y W = 211,65 kg (Ø 11") el taco inverso es 7,30 m', () => {
    expect(stemmingForSdob(1.459, 211.65, 11 * 0.0254)).toBeCloseTo(7.3, 2);
  });
});
