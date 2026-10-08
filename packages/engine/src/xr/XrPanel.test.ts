import { describe, expect, it } from 'vitest';
import { cellAt, rowAt, rowHeight, sliderAt } from './XrPanel';

describe('fila de un panel XR bajo el rayo', () => {
  it('la primera fila está arriba (v cerca de 1)', () => {
    const h = [60, 60, 60, 60];
    expect(rowAt(0.99, h)).toBe(0);
    expect(rowAt(0.6, h)).toBe(1);
    expect(rowAt(0.01, h)).toBe(3);
    expect(rowAt(0, h)).toBe(3);
  });

  it('con filas de distinto alto', () => {
    // 100 px arriba (íconos) y 50 abajo: el tercio inferior es la segunda fila.
    expect(rowAt(0.4, [100, 50])).toBe(0);
    expect(rowAt(0.3, [100, 50])).toBe(1);
  });

  it('fuera del panel o sin filas', () => {
    expect(rowAt(-0.1, [60])).toBe(-1);
    expect(rowAt(1.1, [60])).toBe(-1);
    expect(rowAt(0.5, [])).toBe(-1);
  });

  it('celda bajo el rayo en una fila de varios botones', () => {
    expect(cellAt(0.1, 3)).toBe(0);
    expect(cellAt(0.5, 3)).toBe(1);
    expect(cellAt(1, 3)).toBe(2);
    expect(cellAt(0.7, 1)).toBe(0);
    expect(cellAt(-0.1, 2)).toBe(-1);
  });

  it('las filas con íconos o sliders son más altas', () => {
    expect(rowHeight([{ label: 'a', icon: '▶' }])).toBeGreaterThan(rowHeight([{ label: 'a' }]));
    expect(rowHeight([{ label: 'a', slider: 0.5 }])).toBeGreaterThan(rowHeight([{ label: 'a' }]));
  });
});

describe('valor de un slider bajo el rayo', () => {
  it('va de 0 a 1 a lo ancho de la pista y se recorta en los márgenes', () => {
    expect(sliderAt(0.5, 1, 0)).toBeCloseTo(0.5, 2);
    expect(sliderAt(0, 1, 0)).toBe(0);
    expect(sliderAt(1, 1, 0)).toBe(1);
  });

  it('en la segunda de dos celdas', () => {
    expect(sliderAt(0.75, 2, 1)).toBeCloseTo(0.5, 1);
    expect(sliderAt(0.51, 2, 1)).toBe(0);
  });
});
