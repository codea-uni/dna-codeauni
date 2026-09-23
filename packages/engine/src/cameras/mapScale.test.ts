import { describe, expect, it } from 'vitest';
import { formatCoordinate, formatDistance, niceStep, scaleBar, ticks } from './mapScale';

describe('escala del mapa', () => {
  it('paso redondo', () => {
    expect([0.7, 1, 1.3, 3, 7, 12, 480].map(niceStep)).toEqual([1, 1, 2, 5, 10, 20, 500]);
  });

  it('marcas múltiplos del paso dentro del rango', () => {
    expect(ticks(345_671, 345_712, 10)).toEqual([345_680, 345_690, 345_700, 345_710]);
    expect(ticks(-1.2, 1.2, 0.5)).toEqual([-1, -0.5, 0, 0.5, 1]);
    expect(ticks(0, 1e9, 1)).toEqual([]); // demasiadas → ninguna
  });

  it('barra de escala: largo redondo que entra en el ancho máximo', () => {
    expect(scaleBar(0.5, 120)).toEqual({ meters: 50, pixels: 100 });
    expect(scaleBar(0.1, 120)).toEqual({ meters: 10, pixels: 100 });
    expect(scaleBar(3, 120).meters).toBe(200);
  });

  it('formatos', () => {
    expect(formatDistance(0.004)).toBe('4 mm');
    expect(formatDistance(0.35)).toBe('35 cm');
    expect(formatDistance(7.256)).toBe('7,26 m');
    expect(formatDistance(1234)).toBe('1.234 m');
    expect(formatDistance(25_000)).toBe('25 km');
    expect(formatCoordinate(8_512_345, 10)).toBe('8 512 345');
    expect(formatCoordinate(12.5, 0.5)).toBe('12,5');
    expect(formatCoordinate(-40, 10)).toBe('−40');
  });
});
