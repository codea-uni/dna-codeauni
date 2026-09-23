import { describe, expect, it } from 'vitest';
import { degToRad } from '../units/units';
import { holeToe, lengthToFloor } from './hole';

describe('geometría de taladro', () => {
  it('taladro vertical: el fondo está bajo la boca', () => {
    const toe = holeToe({
      collar: { x: 10, y: 20, z: 100 },
      length: 16,
      inclination: 0,
      azimuth: 1,
    });
    expect(toe.x).toBeCloseTo(10);
    expect(toe.y).toBeCloseTo(20);
    expect(toe.z).toBeCloseTo(84);
  });

  it('taladro inclinado 30° hacia el Este (azimut 90°)', () => {
    // Cálculo manual: horizontal = 10·sin30° = 5; vertical = 10·cos30° = 8.660
    const toe = holeToe({
      collar: { x: 0, y: 0, z: 0 },
      length: 10,
      inclination: degToRad(30),
      azimuth: degToRad(90),
    });
    expect(toe.x).toBeCloseTo(5, 9);
    expect(toe.y).toBeCloseTo(0, 9);
    expect(toe.z).toBeCloseTo(-8.660254, 5);
  });

  it('longitud hasta el piso con sobreperforación', () => {
    // Banco de 15 m + 1.5 m de sobreperforación, vertical → 16.5 m
    expect(lengthToFloor(115, 100, 1.5, 0)).toBeCloseTo(16.5);
    // Inclinado 20°: 16.5 / cos20° = 17.559
    expect(lengthToFloor(115, 100, 1.5, degToRad(20))).toBeCloseTo(17.5589, 4);
    expect(lengthToFloor(90, 100, 1, 0)).toBe(0);
  });
});
