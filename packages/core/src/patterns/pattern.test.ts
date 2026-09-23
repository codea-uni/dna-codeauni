import { describe, expect, it } from 'vitest';
import { DEFAULT_BENCH, DEFAULT_HOLE_TEMPLATE } from '../model/factories';
import { newId } from '../model/ids';
import type { Pattern } from '../model/types';
import { degToRad } from '../units/units';
import {
  centeredPatternOrigin,
  fitPatternToPolygon,
  generatePatternHoles,
  nearestPatternNode,
  patternNodePosition,
} from './pattern';

function pattern(overrides: Partial<Pattern> = {}): Pattern {
  return {
    id: newId<'Pattern'>(),
    name: 'P1',
    kind: 'rectangular',
    burden: 5,
    spacing: 6,
    origin: { x: 100, y: 200 },
    rowAzimuth: degToRad(90), // filas hacia el Este
    rowAdvance: 'right', // avance hacia el Sur
    rows: 3,
    holesPerRow: 4,
    holeTemplate: DEFAULT_HOLE_TEMPLATE,
    ...overrides,
  };
}

describe('generación de patrones', () => {
  it('rectangular: filas hacia el Este, avance hacia el Sur', () => {
    const p = pattern();
    expect(patternNodePosition(p, 0, 1).x).toBeCloseTo(106);
    expect(patternNodePosition(p, 0, 1).y).toBeCloseTo(200);
    expect(patternNodePosition(p, 1, 0).x).toBeCloseTo(100);
    expect(patternNodePosition(p, 1, 0).y).toBeCloseTo(195);
  });

  it('rowAdvance left invierte el sentido de avance', () => {
    const p = pattern({ rowAdvance: 'left' });
    expect(patternNodePosition(p, 1, 0).y).toBeCloseTo(205);
  });

  it('tresbolillo desplaza medio espaciamiento las filas impares', () => {
    const p = pattern({ kind: 'staggered' });
    expect(patternNodePosition(p, 1, 0).x).toBeCloseTo(103);
    expect(patternNodePosition(p, 2, 0).x).toBeCloseTo(100);
  });

  it('genera filas × columnas con etiquetas consecutivas, fila y columna', () => {
    const holes = generatePatternHoles(pattern(), DEFAULT_BENCH, { startNumber: 10 });
    expect(holes).toHaveLength(12);
    expect(holes[0]?.label).toBe('10');
    expect(holes[11]?.label).toBe('21');
    expect(holes[5]?.row).toBe(1);
    expect(holes[5]?.col).toBe(1);
    // Banco de 15 m + 1.5 m de sobreperforación, vertical.
    expect(holes[0]?.collar.z).toBe(15);
    expect(holes[0]?.length).toBeCloseTo(16.5);
    expect(new Set(holes.map((h) => h.id)).size).toBe(12);
  });

  it('recorta al polígono', () => {
    const clipBoundary = [
      { x: 99, y: 201 },
      { x: 108, y: 201 },
      { x: 108, y: 189 },
      { x: 99, y: 189 },
    ];
    const holes = generatePatternHoles(pattern({ clipBoundary }), DEFAULT_BENCH, {
      startNumber: 1,
    });
    // Columnas 0 y 1 (x = 100, 106) × filas 0..2 (y = 200, 195, 190)
    expect(holes).toHaveLength(6);
  });

  it('rechaza burden o espaciamiento no positivos', () => {
    expect(() =>
      generatePatternHoles(pattern({ burden: 0 }), DEFAULT_BENCH, { startNumber: 1 }),
    ).toThrow();
  });

  it('nodo más cercano, también en tresbolillo', () => {
    const p = pattern({ kind: 'staggered' });
    const n = nearestPatternNode(p, 103.4, 195.6);
    expect(n.row).toBe(1);
    expect(n.col).toBe(0);
    expect(n.position.x).toBeCloseTo(103);
    const far = nearestPatternNode(p, 100 + 6 * 20 + 0.2, 200 + 0.1);
    expect(far.col).toBe(20);
  });

  it('ajuste a un polígono: la red cubre todos los puntos interiores', () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 50, y: 10 },
      { x: 40, y: 45 },
      { x: -5, y: 30 },
    ];
    for (const kind of ['rectangular', 'staggered'] as const) {
      const base = pattern({ kind, rowAzimuth: degToRad(30) });
      const fit = fitPatternToPolygon(base, polygon);
      const holes = generatePatternHoles(
        { ...base, ...fit, clipBoundary: polygon },
        DEFAULT_BENCH,
        {
          startNumber: 1,
        },
      );
      // Área = 1.637,5 m² (fórmula del área de Gauss) / 30 m² por taladro ≈ 55 taladros
      expect(holes.length).toBeGreaterThan(45);
      expect(holes.length).toBeLessThan(65);
    }
  });

  it('origen centrado', () => {
    const p = pattern({ rows: 3, holesPerRow: 5 });
    const origin = centeredPatternOrigin(p, { x: 0, y: 0 });
    const q = { ...p, origin };
    const first = patternNodePosition(q, 0, 0);
    const last = patternNodePosition(q, 2, 4);
    expect((first.x + last.x) / 2).toBeCloseTo(0);
    expect((first.y + last.y) / 2).toBeCloseTo(0);
  });
});
