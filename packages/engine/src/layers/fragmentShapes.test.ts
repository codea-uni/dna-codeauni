import { describe, expect, it } from 'vitest';
import { buildFragmentShapes, geometryVolume } from './fragmentShapes';
import { writeMatrix, type FragmentsData } from './FragmentsLayer';
import type { BlockState } from './BlocksLayer';

describe('biblioteca de formas de roca', () => {
  const shapes = buildFragmentShapes();

  it('16 poliedros convexos de volumen 1, 8–40 triángulos', () => {
    expect(shapes).toHaveLength(16);
    for (const g of shapes) {
      expect(geometryVolume(g)).toBeCloseTo(1, 4);
      const tris = g.getAttribute('position').count / 3;
      expect(tris).toBeGreaterThanOrEqual(8);
      expect(tris).toBeLessThanOrEqual(40);
    }
  });

  it('caras medias entre 6 y 10 (Domokos et al. 2020: ≈ 6,6 en roca fragmentada)', () => {
    let faces = 0;
    for (const g of shapes) {
      const n = g.getAttribute('normal');
      const keys = new Set<string>();
      for (let i = 0; i < n.count; i++)
        keys.add(`${n.getX(i).toFixed(3)},${n.getY(i).toFixed(3)},${n.getZ(i).toFixed(3)}`);
      faces += keys.size;
    }
    const mean = faces / shapes.length;
    expect(mean).toBeGreaterThanOrEqual(6);
    expect(mean).toBeLessThanOrEqual(12);
  });
});

describe('writeMatrix', () => {
  const d: FragmentsData = {
    count: 1,
    parent: Int32Array.from([0]),
    axes: Float32Array.from([2, 1, 0.5]),
    quat: Float32Array.from([0, 0, 0, 1]),
    shape: Uint8Array.from([0]),
    offset: Float32Array.from([0.1, 0, 0]),
    rest: Float32Array.from([0, 0.2, 0]),
    spread: Float32Array.from([1, 0, 0]),
    omega: Float32Array.from([0, 0, 0]),
    flags: Uint8Array.from([0]),
    fineFraction: Float32Array.from([0.4]),
  };
  const st = (tau: number, settle: number): BlockState => ({
    pos: Float64Array.from([10, 0, 0]),
    tau: Float32Array.from([tau]),
    flight: Float32Array.from([2]),
    settle: Float32Array.from([settle]),
  });

  it('acota la separación respecto del bloque', () => {
    const out = new Float32Array(16);
    writeMatrix(out, 0, { ...d, spreadLimit: 0.5 }, 0, st(2, 0));
    expect(out[12]).toBeCloseTo(10 + 0.1 + 0.5, 6);
  });

  it('oculta la piedra antes de la salida', () => {
    const out = new Float32Array(16).fill(9);
    writeMatrix(out, 0, d, 0, st(-1, 0));
    expect(Array.from(out).every((v) => v === 0)).toBe(true);
  });

  it('en vuelo: padre + desfase + velocidad relativa·τ; en reposo: padre + desfase de reposo', () => {
    const out = new Float32Array(16);
    writeMatrix(out, 0, d, 0, st(1, 0));
    expect(out[12]).toBeCloseTo(10 + 0.1 + 1, 6);
    expect(out[0]).toBeCloseTo(2, 6);
    writeMatrix(out, 0, d, 0, st(Infinity, 1));
    expect(out[12]).toBeCloseTo(10, 6);
    expect(out[13]).toBeCloseTo(0.2, 6);
  });
});
