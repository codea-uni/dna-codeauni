import { describe, expect, it } from 'vitest';
import { pickTable, type XrSurface } from './planes';

const head = { x: 0, y: 1.6, z: 0 };
const s = (x: number, y: number, z: number, label?: string): XrSurface => ({
  center: { x, y, z },
  width: 1.5,
  depth: 0.9,
  ...(label ? { label } : {}),
});

describe('mesa para la maqueta', () => {
  it('prefiere una superficie etiquetada como mesa, aunque haya otra más cerca', () => {
    const table = s(3, 0.75, -2, 'table');
    expect(pickTable([s(0.5, 0.8, -0.5), table], head)).toBe(table);
  });

  it('sin etiquetas, la superficie a altura de mesa más cercana (no el piso ni un estante alto)', () => {
    const near = s(0.8, 0.72, -0.6);
    expect(pickTable([s(0, 0, 0, 'floor'), s(0.2, 1.9, -0.2), s(4, 0.7, 0), near], head)).toBe(
      near,
    );
  });

  it('sin superficies útiles no hay mesa', () => {
    expect(pickTable([s(0, 0, 0, 'floor')], head)).toBeNull();
    expect(pickTable([], head)).toBeNull();
  });
});
