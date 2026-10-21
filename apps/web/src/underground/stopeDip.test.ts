import { describe, expect, it } from 'vitest';
import { stopeLeanFor } from './location';
import { DEFAULT_RING, stopeBoundary } from './model';

const DEG = Math.PI / 180;

describe('tajeo inclinado en el abanico', () => {
  it('vertical: rectángulo; con buzamiento: paralelogramo que se corre con la altura', () => {
    const rect = stopeBoundary(DEFAULT_RING);
    expect(rect.map((p) => p.u)).toEqual([-7.5, 7.5, 7.5, -7.5]);
    const leaning = stopeBoundary({ ...DEFAULT_RING, stopeDip: 45 * DEG, stopeLeanSide: 'left' });
    // A 45°, el techo (v = 20) se corre 20 m a la izquierda y la base (v = −3) 3 m a la derecha.
    expect(leaning[0]?.u).toBeCloseTo(-4.5, 9);
    expect(leaning[2]?.u).toBeCloseTo(-12.5, 9);
    expect(leaning[3]?.u).toBeCloseTo(-27.5, 9);
  });

  it('buzamiento aparente: tajeo que baja al Este, anillo avanzando al Norte → techo a la izquierda', () => {
    const dip = { dip: 65 * DEG, dipAzimuth: 90 * DEG };
    const across = stopeLeanFor(dip, 0);
    expect(across.stopeLeanSide).toBe('left');
    expect(across.stopeDip / DEG).toBeCloseTo(65, 6);
    // Avanzando al Sur, la derecha es el Oeste: el techo se corre a la derecha.
    expect(stopeLeanFor(dip, 180).stopeLeanSide).toBe('right');
    // Avanzando al Este, el plano del anillo es Norte-Sur: no se ve inclinado.
    expect(stopeLeanFor(dip, 90).stopeDip / DEG).toBeCloseTo(90, 6);
    // A 45° del rumbo, el buzamiento aparente es menor que el real (más tendido).
    expect(stopeLeanFor(dip, 45).stopeDip / DEG).toBeLessThan(65);
  });
});
