import { describe, expect, it } from 'vitest';
import {
  createHole,
  DEFAULT_BENCH,
  DEFAULT_HOLE_TEMPLATE,
  nextHoleNumber,
  numberHolesFromFirstFree,
} from './factories';

const hole = (label: string) =>
  createHole({
    position: { x: 0, y: 0 },
    template: DEFAULT_HOLE_TEMPLATE,
    bench: DEFAULT_BENCH,
    label,
  });

describe('numeración de la malla de reemplazo', () => {
  it('vuelve a 1..N aunque la malla anterior agotó cientos de etiquetas', () => {
    const generated = ['1672', '1673', '1674'].map(hole);
    const numbered = numberHolesFromFirstFree(generated, []);
    expect(numbered.map((h) => h.label)).toEqual(['1', '2', '3']);
    expect(numbered.map((h) => h.id)).toEqual(generated.map((h) => h.id));
    expect(generated.map((h) => h.label)).toEqual(['1672', '1673', '1674']);
  });
  it('con otras mallas ocupa huecos sin duplicar ni modificar sus etiquetas', () => {
    const remaining = ['1', '3', '5', 'R1'].map(hole);
    const numbered = numberHolesFromFirstFree(
      Array.from({ length: 5 }, () => hole('999')),
      remaining,
    );
    expect(numbered.map((h) => h.label)).toEqual(['2', '4', '6', '7', '8']);
    expect(remaining.map((h) => h.label)).toEqual(['1', '3', '5', 'R1']);
  });
  it('conserva máximo + 1 para los demás usos de nextHoleNumber', () => {
    expect(nextHoleNumber(['1', '3', '1672', 'R1'].map(hole))).toBe(1673);
  });
});
