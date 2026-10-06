import { describe, expect, it } from 'vitest';
import { SNAP_ANGLE, axis, flySpeed, flyVelocity, snapTurn } from './locomotion';

describe('locomoción XR', () => {
  it('zona muerta y reescalado del stick', () => {
    expect(axis(0.1)).toBe(0);
    expect(axis(1)).toBe(1);
    expect(axis(-1)).toBe(-1);
  });

  it('stick adelante con la cabeza mirando a −Z avanza hacia −Z', () => {
    const v = flyVelocity({ x: 0, y: -1 }, 0, 0, 10);
    expect(v.x).toBeCloseTo(0, 12);
    expect(v.z).toBeCloseTo(-10, 12);
  });

  it('stick a la derecha con la cabeza girada 90° a la izquierda avanza hacia −Z', () => {
    // Mirando a −X, la derecha es −Z.
    const v = flyVelocity({ x: 1, y: 0 }, 0, Math.PI / 2, 10);
    expect(v.x).toBeCloseTo(0, 12);
    expect(v.z).toBeCloseTo(-10, 12);
  });

  it('stick derecho hacia arriba sube', () => {
    expect(flyVelocity({ x: 0, y: 0 }, -1, 0, 5).y).toBeCloseTo(5, 12);
  });

  it('la velocidad crece con la altura y es fija en la maqueta', () => {
    expect(flySpeed(0, 1)).toBe(4);
    expect(flySpeed(100, 1)).toBe(64);
    expect(flySpeed(10_000, 1)).toBe(250);
    expect(flySpeed(100, 1 / 1000)).toBe(0.6);
  });

  it('giro por saltos: un salto por empuje, se rearma al centro', () => {
    let s = snapTurn(true, 0.9);
    expect(s.angle).toBe(-SNAP_ANGLE);
    s = snapTurn(s.armed, 0.95);
    expect(s.angle).toBe(0);
    s = snapTurn(s.armed, 0.1);
    expect(s.armed).toBe(true);
    expect(snapTurn(s.armed, -0.8).angle).toBe(SNAP_ANGLE);
  });
});
