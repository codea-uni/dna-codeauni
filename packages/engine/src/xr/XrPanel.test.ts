import { describe, expect, it } from 'vitest';
import { rowAt } from './XrPanel';

describe('fila de un panel XR bajo el rayo', () => {
  it('la primera fila está arriba (v cerca de 1)', () => {
    expect(rowAt(0.99, 4)).toBe(0);
    expect(rowAt(0.6, 4)).toBe(1);
    expect(rowAt(0.01, 4)).toBe(3);
    expect(rowAt(0, 4)).toBe(3);
  });

  it('fuera del panel o sin filas', () => {
    expect(rowAt(-0.1, 4)).toBe(-1);
    expect(rowAt(1.1, 4)).toBe(-1);
    expect(rowAt(0.5, 0)).toBe(-1);
  });
});
