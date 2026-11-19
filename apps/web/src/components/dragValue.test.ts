import { describe, expect, it } from 'vitest';
import { dragValue } from './dragValue';

// Arrastrar la etiqueta de un campo numérico (interfaz, no dominio): los valores esperados salen
// de la regla documentada en dragValue: un paso cada 4 px, o el rango completo en 600 px.
describe('dragValue', () => {
  const burden = { start: 2, decimals: 2, step: 0.1 };

  it('sin rango avanza un paso cada 4 px, en ambos sentidos', () => {
    expect(dragValue(burden, 40, false, false)).toBe(3);
    expect(dragValue(burden, -40, false, false)).toBe(1);
  });

  it('Mayús ×10 y Alt ÷10, como las flechas', () => {
    expect(dragValue(burden, 40, true, false)).toBe(12);
    expect(dragValue(burden, 40, false, true)).toBe(2.1);
  });

  it('con rango recorre todo el rango en unos 600 px y no sale de él', () => {
    const width = { start: 0, decimals: 0, step: 1, min: 0, max: 600 };
    expect(dragValue(width, 120, false, false)).toBe(120);
    expect(dragValue(width, 10_000, false, false)).toBe(600);
    expect(dragValue(width, -50, false, false)).toBe(0);
  });

  it('un campo entero da enteros', () => {
    const rows = { start: 3, decimals: 0, step: 1, integer: true };
    expect(dragValue(rows, 5, false, false)).toBe(4);
    expect(Number.isInteger(dragValue(rows, 7, false, true))).toBe(true);
  });
});
