import { describe, expect, it } from 'vitest';
import { compassRotationDeg } from './compass';

describe('brújula', () => {
  it('planta: Norte arriba; 3D: gira con la cámara', () => {
    expect(compassRotationDeg('plan', 1.2)).toBe(0);
    // Cámara al Sur mirando al Norte (yaw = π): Norte arriba
    expect(compassRotationDeg('3d', Math.PI)).toBeCloseTo(0);
    // Cámara al Norte mirando al Sur (yaw = 0): Norte abajo
    expect(compassRotationDeg('3d', 0)).toBeCloseTo(180);
    // Cámara al Oeste mirando al Este (yaw = 3π/2): el Norte queda a la izquierda (−90° = 270°)
    expect(compassRotationDeg('3d', (3 * Math.PI) / 2)).toBeCloseTo(270);
  });
});
