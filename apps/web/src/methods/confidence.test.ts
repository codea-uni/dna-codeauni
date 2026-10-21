import { describe, expect, it } from 'vitest';
import { confidenceKey } from './confidence';

describe('respaldo de un método en palabras', () => {
  it('toma el primer nivel del texto del catálogo', () => {
    expect(confidenceKey('R3')).toBe('md.level.R3');
    expect(confidenceKey('R1 · [CG]')).toBe('md.level.R1');
    expect(confidenceKey('[CG] · R0')).toBe('md.level.CG');
    expect(confidenceKey('[P] ley · [V] rango de velocidades')).toBe('md.level.P');
    expect(confidenceKey('?')).toBe('md.level.unknown');
  });
});
