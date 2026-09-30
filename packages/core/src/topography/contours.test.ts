import { describe, expect, it } from 'vitest';
import { contoursFromTin } from './contours';
import { decimateGrid } from './decimate';
import { hillshade } from './hillshade';

/**
 * Pirámide de base 20 × 20 m y cima a 10 m (valor esperado del fixture, no una fórmula minera):
 * con curvas cada 2 m hay 4 niveles internos (2, 4, 6, 8); el 0 es la base y el 10 la cima.
 */
const pyramid = {
  vertices: Float64Array.from([0, 0, 0, 20, 0, 0, 20, 20, 0, 0, 20, 0, 10, 10, 10]),
  triangles: Uint32Array.from([0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4]),
};

describe('curvas de nivel', () => {
  it('corta la pirámide en las cotas esperadas, con maestras', () => {
    const c = contoursFromTin(pyramid, { interval: 2, majorEvery: 2 });
    expect([...new Set(c.levels)].sort((a, b) => a - b)).toEqual([0, 2, 4, 6, 8]);
    // Cada nivel interno da un cuadrado de 4 segmentos (uno por cara).
    expect(c.levels.filter((l) => l === 4).length).toBe(4);
    // El cuadrado de cota 4 está a 6 m del centro (la cara baja 1 m por metro).
    const i = c.levels.indexOf(4);
    const d = Math.max(
      Math.abs((c.segments[i * 4] ?? 0) - 10),
      Math.abs((c.segments[i * 4 + 1] ?? 0) - 10),
    );
    expect(d).toBeCloseTo(6, 6); // el épsilon de cota desplaza el corte ~1e-9 m
    expect(c.major[i]).toBe(1);
  });

  it('sin intervalo no hay curvas', () => {
    expect(contoursFromTin(pyramid, { interval: 0 }).segments.length).toBe(0);
  });
});

describe('reducción de nubes', () => {
  it('conserva la cota mínima por celda', () => {
    const pts = Float64Array.from([0.1, 0.1, 5, 0.2, 0.3, 3, 0.4, 0.2, 4, 2.1, 0.1, 7]);
    const out = decimateGrid(pts, { cell: 1, keep: 'min' });
    expect(out.length / 3).toBe(2);
    const zs = [out[2], out[5]].sort();
    expect(zs).toEqual([3, 7]);
  });
});

describe('sombreado', () => {
  it('rasteriza la pirámide con transparencia fuera y la cima más alta', () => {
    const h = hillshade(pyramid, { maxSize: 21 });
    if (!h) throw new Error('sin ráster');
    expect(h.zMax).toBe(10);
    expect(h.georef).toMatchObject({ originX: 0, originY: 20, pixelSizeY: -h.georef.pixelSizeX });
    const alpha = (r: number, c: number) => h.rgba[(r * h.width + c) * 4 + 3];
    expect(alpha(Math.floor(h.height / 2), Math.floor(h.width / 2))).toBe(255);
    // La cara iluminada (luz desde el Noroeste) es más clara que la opuesta.
    const light = (r: number, c: number) => h.rgba[(r * h.width + c) * 4] ?? 0;
    expect(light(5, 5)).toBeGreaterThan(light(15, 15));
  });
});
