import { describe, expect, it } from 'vitest';
import { PointIndex } from './spatialIndex';

function grid(n: number): PointIndex<string> {
  const ids: string[] = [];
  const xs = new Float64Array(n * n);
  const ys = new Float64Array(n * n);
  let k = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      ids.push(`${i}-${j}`);
      xs[k] = i * 5;
      ys[k] = j * 5;
      k++;
    }
  }
  return new PointIndex(ids, xs, ys);
}

describe('PointIndex', () => {
  it('índice vacío', () => {
    const idx = new PointIndex<string>([], new Float64Array(), new Float64Array());
    expect(idx.nearest(0, 0, 10)).toBeNull();
    expect(idx.inBox(0, 0, 1, 1)).toEqual([]);
  });

  it('más cercano con distancia máxima y exclusión', () => {
    const idx = grid(10);
    expect(idx.nearest(10.4, 14.2, 2)?.id).toBe('2-3');
    expect(idx.nearest(12.5, 12.5, 1)).toBeNull();
    expect(idx.nearest(10, 15, 6, (id) => id === '2-3')?.id).not.toBe('2-3');
  });

  it('caja y lazo', () => {
    const idx = grid(10);
    expect(idx.inBox(-1, -1, 6, 6).sort()).toEqual(['0-0', '0-1', '1-0', '1-1']);
    const triangle = [
      { x: -1, y: -1 },
      { x: 12, y: -1 },
      { x: -1, y: 12 },
    ];
    expect(idx.inPolygon(triangle).sort()).toEqual(['0-0', '0-1', '0-2', '1-0', '1-1', '2-0']);
  });
});
