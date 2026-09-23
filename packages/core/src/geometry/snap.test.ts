import { describe, expect, it } from 'vitest';
import { DEFAULT_HOLE_TEMPLATE } from '../model/factories';
import { newId } from '../model/ids';
import type { Pattern } from '../model/types';
import { snapPoint, type SnapOptions } from './snap';

const pattern: Pattern = {
  id: newId<'Pattern'>(),
  name: 'P',
  kind: 'square',
  burden: 5,
  spacing: 5,
  origin: { x: 0, y: 0 },
  rowAzimuth: Math.PI / 2,
  rowAdvance: 'left',
  rows: 2,
  holesPerRow: 2,
  holeTemplate: DEFAULT_HOLE_TEMPLATE,
};

const all: SnapOptions = { grid: true, gridSize: 1, holes: true, pattern: true, tolerance: 0.5 };
const noHoles = { nearestHole: () => null, patterns: [pattern] };

describe('snapping', () => {
  it('sin modos activos devuelve el punto original', () => {
    const r = snapPoint(1.23, 4.56, { ...all, grid: false, holes: false, pattern: false }, noHoles);
    expect(r).toEqual({ x: 1.23, y: 4.56, kind: 'none' });
  });

  it('taladro tiene prioridad', () => {
    const r = snapPoint(5.2, 5.1, all, {
      nearestHole: () => ({ x: 5.3, y: 5.3 }),
      patterns: [pattern],
    });
    expect(r.kind).toBe('hole');
    expect(r.x).toBe(5.3);
  });

  it('nodo de patrón dentro de la tolerancia', () => {
    const r = snapPoint(10.3, 4.8, all, noHoles);
    expect(r.kind).toBe('pattern');
    expect(r.x).toBeCloseTo(10);
    expect(r.y).toBeCloseTo(5);
  });

  it('grilla cuando nada más captura', () => {
    const r = snapPoint(12.4, 7.6, all, noHoles);
    expect(r).toEqual({ x: 12, y: 8, kind: 'grid' });
  });
});
