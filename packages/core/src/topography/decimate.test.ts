import { describe, expect, it } from 'vitest';
import { decimateGrid } from './decimate';

// Nube armada a mano: 4 puntos en la celda [0, 1) × [0, 1) y 1 en la celda vecina.
const cloud = Float64Array.from([0.1, 0.1, 3, 0.9, 0.1, 1, 0.1, 0.9, 2, 0.9, 0.9, 5, 1.5, 0.5, 7]);

describe('decimateGrid', () => {
  it('un punto por celda, en el centro de masa, con la cota mínima', () => {
    const out = decimateGrid(cloud, { cell: 1, keep: 'min' });
    expect(Array.from(out)).toEqual([0.5, 0.5, 1, 1.5, 0.5, 7]);
  });

  it('promedio y mediana (la superior de las dos centrales con cantidad par)', () => {
    expect(decimateGrid(cloud, { cell: 1, keep: 'mean' })[2]).toBe(2.75);
    expect(decimateGrid(cloud, { cell: 1, keep: 'median' })[2]).toBe(3);
  });

  it('celda más chica que el espaciado: no reduce', () => {
    expect(decimateGrid(cloud, { cell: 0.1, keep: 'min' })).toHaveLength(15);
  });

  it('una celda con muchos puntos no desborda la pila', () => {
    const many = new Float64Array(300_000 * 3).map((_, i) => (i % 3 === 2 ? -i : 0.5));
    expect(decimateGrid(many, { cell: 10, keep: 'min' })[2]).toBe(-(300_000 * 3 - 1));
  });
});
