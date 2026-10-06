import { describe, expect, it } from 'vitest';
import { cellAt, rowAt } from './XrPanel';

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

  it('celda bajo el rayo en una fila de varios botones', () => {
    expect(cellAt(0.1, 3)).toBe(0);
    expect(cellAt(0.5, 3)).toBe(1);
    expect(cellAt(1, 3)).toBe(2);
    expect(cellAt(0.7, 1)).toBe(0);
    expect(cellAt(-0.1, 2)).toBe(-1);
  });
});
