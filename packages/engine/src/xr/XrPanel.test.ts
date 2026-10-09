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

  it('con la manija arriba: la franja no es una fila', () => {
    // 20 px de manija + 2 filas de 40: la manija ocupa el 20 % de arriba.
    expect(rowAt(0.9, [40, 40], 20)).toBe(-1);
    expect(rowAt(0.7, [40, 40], 20)).toBe(0);
    expect(rowAt(0.3, [40, 40], 20)).toBe(1);
  });

  it('celdas con anchos distintos (pesos)', () => {
    // 3 : 1 → la primera ocupa los tres cuartos de la izquierda.
    expect(cellAt(0.6, [3, 1])).toBe(0);
    expect(cellAt(0.8, [3, 1])).toBe(1);
    expect(cellAt(0.5, [1, 1])).toBe(cellAt(0.5, 2));
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

  it('con pesos iguales da lo mismo que con celdas iguales', () => {
    expect(sliderAt(0.8, [1, 1], 1)).toBeCloseTo(sliderAt(0.8, 2, 1), 9);
  });
});

describe('anclaje de la leyenda', () => {
  it('diferencia de rumbos en (−π, π]', async () => {
    const { angleDiff } = await import('./XrSession');
    expect(angleDiff(0.1, -0.1)).toBeCloseTo(0.2);
    expect(angleDiff(3, -3)).toBeCloseTo(6 - 2 * Math.PI);
    expect(angleDiff(-3, 3)).toBeCloseTo(2 * Math.PI - 6);
  });
});
