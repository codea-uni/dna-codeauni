import { describe, expect, it } from 'vitest';
import { formatInputNumber, parseUserNumber } from './numbers';

// Casos de la skill cronos-entrada-numerica: lo que escribe un ingeniero en un campo.
describe('parseUserNumber', () => {
  it.each([
    ['6,5', 6.5],
    ['6.5', 6.5],
    ['1.234,5', 1234.5],
    ['1,234.5', 1234.5],
    ['1.234.567', 1234567],
    ['1,234,567.25', 1234567.25],
    ['.5', 0.5],
    ['  42 ', 42],
    ['−3', -3],
    ['-0,25', -0.25],
  ])('lee «%s» como %d', (text, expected) => {
    expect(parseUserNumber(text)).toBe(expected);
  });

  it('un solo separador es siempre decimal (punto del teclado numérico)', () => {
    expect(parseUserNumber('1.234')).toBe(1.234);
    expect(parseUserNumber('1,234')).toBe(1.234);
  });

  it('acepta la unidad del campo al final', () => {
    expect(parseUserNumber('7,25 m', 'm')).toBe(7.25);
    expect(parseUserNumber('200mm', 'mm')).toBe(200);
    expect(parseUserNumber('7,25 ft', 'm')).toBeNull();
  });

  it.each([',', '1.2.3', '12,34.5', '6*1,1', '', 'abc', '-', '1,2,3.4,5'])(
    'rechaza «%s»',
    (text) => {
      expect(parseUserNumber(text)).toBeNull();
    },
  );
});

describe('formatInputNumber', () => {
  it('usa el separador decimal del idioma, sin miles', () => {
    expect(formatInputNumber(1234.5, 2, 'es')).toBe('1234,5');
    expect(formatInputNumber(1234.5, 2, 'en')).toBe('1234.5');
  });

  it('recorta ceros a la derecha y respeta la precisión', () => {
    expect(formatInputNumber(6.5, 3, 'es')).toBe('6,5');
    expect(formatInputNumber(6.4999, 2, 'es')).toBe('6,5');
    expect(formatInputNumber(7, 2, 'es')).toBe('7');
    expect(formatInputNumber(-0.25, 2, 'es')).toBe('-0,25');
  });

  it('lo que muestra se vuelve a leer igual', () => {
    for (const v of [0.001, 6.5, 1234.5, 98765.432, -12.75]) {
      for (const locale of ['es', 'en'] as const) {
        expect(parseUserNumber(formatInputNumber(v, 3, locale))).toBe(v);
      }
    }
  });
});
