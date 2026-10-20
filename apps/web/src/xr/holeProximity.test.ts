/* eslint-disable @typescript-eslint/no-non-null-assertion -- datos de prueba fijos */
import { createHole, DEFAULT_BENCH, DEFAULT_HOLE_TEMPLATE } from '@cronos/core';
import { describe, expect, it } from 'vitest';
import { HoleProximity } from './holeProximity';
const hole = (x: number) =>
  createHole({
    position: { x, y: 0 },
    template: DEFAULT_HOLE_TEMPLATE,
    bench: DEFAULT_BENCH,
    label: String(x),
  });
const holes = [hole(0), hole(10)];
const head = (x: number, height = 1.7) => ({ x, y: 0, z: holes[0]!.collar.z + height });

describe('ficha por cercanía en VR', () => {
  it('espera quietud y mantiene la ficha al cruzar el umbral de entrada', () => {
    const p = new HoleProximity();
    expect(p.update(holes, head(5), 0, null)).toBeNull();
    expect(p.update(holes, head(5), 1100, null)).toBeNull();
    expect(p.update(holes, head(5), 1200, null)).toBe(holes[0]);
    expect(p.update(holes, head(6.5), 1500, null)).toBe(holes[0]);
    expect(p.update(holes, head(8.1), 1800, null)).toBeNull();
    expect(p.update(holes, head(8.1), 3100, null)).toBe(holes[1]);
  });
  it('limita altura de los ojos, y desactiva fuera de escala real', () => {
    const p = new HoleProximity();
    p.update(holes, head(0, 16), 0, null);
    expect(p.update(holes, head(0, 16), 2000, null)).toBeNull();
    p.update(holes, head(0), 2100, null);
    expect(p.update(holes, head(0), 3400, null)).toBe(holes[0]);
    expect(p.update(holes, head(0, 17), 3500, null)).toBe(holes[0]);
    expect(p.update(holes, head(0, 19), 3600, null)).toBeNull();
    expect(p.update(holes, null, 5000, null)).toBeNull();
  });
  it('no sustituye una ficha explícita ni reabre una cerrada hasta alejarse', () => {
    const p = new HoleProximity();
    p.update(holes, head(0), 0, null);
    expect(p.update(holes, head(0), 1500, holes[1]!.id)).toBeNull();
    p.update(holes, head(0), 1600, null);
    expect(p.update(holes, head(0), 2900, null)).toBe(holes[0]);
    p.dismiss(holes[0]!.id);
    expect(p.update(holes, head(0), 4500, null)).toBeNull();
    p.update(holes, head(-10), 5000, null);
    p.update(holes, head(0), 5500, null);
    expect(p.update(holes, head(0), 7000, null)).toBe(holes[0]);
  });
  it('descarta taladros eliminados o mallas reemplazadas', () => {
    const p = new HoleProximity();
    p.update(holes, head(0), 0, null);
    p.update(holes, head(0), 1500, null);
    expect(p.update([], head(0), 2000, null)).toBeNull();
  });
});
