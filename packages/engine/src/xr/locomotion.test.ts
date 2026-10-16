import { describe, expect, it } from 'vitest';
import {
  ARC_GRAVITY,
  ARC_SPEED,
  SNAP_ANGLE,
  axis,
  flySpeed,
  flyVelocity,
  snapTurn,
  teleportArc,
} from './locomotion';

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

describe('arco del teletransporte', () => {
  const flat = () => 0;

  it('cae donde lo dice el tiro parabólico (terreno plano)', () => {
    // Tiro a 45° desde 1,7 m: z(t) = 1,7 + v·sen45·t − g·t²/2 = 0 (cinemática, no regla minera).
    const s = Math.SQRT1_2;
    const { hit, points } = teleportArc({ x: 0, y: 0, z: 1.7 }, { x: 0, y: s, z: s }, flat);
    const vs = ARC_SPEED * s;
    const t = (vs + Math.sqrt(vs * vs + 2 * ARC_GRAVITY * 1.7)) / ARC_GRAVITY;
    expect(hit?.y).toBeCloseTo(vs * t, 3);
    expect(hit?.x).toBeCloseTo(0, 9);
    expect(hit?.z).toBe(0);
    expect(points.length).toBeGreaterThan(10);
  });

  it('se detiene en un talud más alto que el punto de partida', () => {
    // Pared vertical de 5 m a 10 m al Norte.
    const wall = (_x: number, y: number) => (y >= 10 ? 5 : 0);
    const { hit } = teleportArc({ x: 0, y: 0, z: 1.7 }, { x: 0, y: 0.8, z: 0.6 }, wall);
    expect(hit?.z).toBe(5);
    expect(hit?.y).toBeGreaterThanOrEqual(10);
  });

  it('sin terreno debajo no hay llegada', () => {
    expect(teleportArc({ x: 0, y: 0, z: 2 }, { x: 0, y: 1, z: 0 }, () => null).hit).toBeNull();
  });
});
