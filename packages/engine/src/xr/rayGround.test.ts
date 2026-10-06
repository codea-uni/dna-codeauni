import { describe, expect, it } from 'vitest';
import { rayGround } from './rayGround';

const s = Math.SQRT1_2;

describe('rayo contra el terreno', () => {
  it('terreno plano: a 45° desde 10 m de altura cae a 10 m de distancia horizontal', () => {
    const hit = rayGround({ x: 0, y: 0, z: 10 }, { x: 0, y: s, z: -s }, () => 0, 1000);
    expect(hit?.point.y).toBeCloseTo(10, 4);
    expect(hit?.point.z).toBe(0);
    expect(hit?.distance).toBeCloseTo(10 * Math.SQRT2, 4);
  });

  it('ladera z = x/2: un rayo horizontal a 5 m la corta en x = 10', () => {
    const hit = rayGround({ x: 0, y: 0, z: 5 }, { x: 1, y: 0, z: 0 }, (x) => x / 2, 1000);
    expect(hit?.point.x).toBeCloseTo(10, 4);
  });

  it('sin cruce: rayo hacia arriba, fuera del terreno o más allá del alcance', () => {
    expect(rayGround({ x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: 1 }, () => 0, 1000)).toBeNull();
    expect(rayGround({ x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: -1 }, () => null, 1000)).toBeNull();
    expect(rayGround({ x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: -1 }, () => 0, 5)).toBeNull();
  });

  it('origen bajo el terreno: sin cruce', () => {
    expect(rayGround({ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: -1 }, () => 0, 100)).toBeNull();
  });
});
