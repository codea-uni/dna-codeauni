import { describe, expect, it } from 'vitest';
import { boundsGap, farFromLayers } from './validate';

const box = (minX: number, minY: number, maxX: number, maxY: number) => ({
  minX,
  minY,
  maxX,
  maxY,
});

describe('separación entre capas', () => {
  it('0 si se superponen; distancia entre bordes si no', () => {
    expect(boundsGap(box(0, 0, 10, 10), box(5, 5, 20, 20))).toBe(0);
    expect(boundsGap(box(0, 0, 10, 10), box(13, 0, 20, 10))).toBe(3);
    // Esquina con esquina: 3-4-5.
    expect(boundsGap(box(0, 0, 10, 10), box(13, 14, 20, 20))).toBe(5);
  });

  it('modelo de bloques en UTM 19S frente a una topografía en UTM 18S: cientos de km', () => {
    // Caso de la prueba de usabilidad: bloques en E≈617 000 N≈7 759 000 y topografía en
    // E≈350 000 N≈8 600 000 (dos zonas distintas cargadas como si fueran la misma).
    const blocks = box(616_500, 7_758_500, 617_500, 7_759_500);
    const topo = box(349_000, 8_599_000, 351_000, 8_601_000);
    const gap = farFromLayers(blocks, [topo]);
    expect(gap).not.toBeNull();
    expect((gap ?? 0) / 1000).toBeGreaterThan(850);
    expect((gap ?? 0) / 1000).toBeLessThan(900);
  });

  it('null sin otras capas o si alguna está cerca', () => {
    expect(farFromLayers(box(0, 0, 1, 1), [])).toBeNull();
    expect(farFromLayers(box(0, 0, 1, 1), [box(50_000, 0, 51_000, 1), box(2, 2, 3, 3)])).toBeNull();
  });
});
