import { describe, expect, it } from 'vitest';
import { createDefaultLibrary } from '@cronos/core';
import {
  cartridgeFits,
  explosivesForHole,
  genericSmallCartridge,
  mainExplosivePatch,
  parseRodLength,
} from './model';

describe('largo de barra en metros o pies', () => {
  it("14' (barra de 14 pies) = 4,2672 m", () => {
    // 1 pie internacional = 0,3048 m exactos.
    expect(parseRodLength("14'")).toBeCloseTo(4.2672, 9);
    expect(parseRodLength('14 ft')).toBeCloseTo(4.2672, 9);
    expect(parseRodLength('14 pies')).toBeCloseTo(4.2672, 9);
  });

  it('en metros, con coma o punto; sin unidad, la de presentación', () => {
    expect(parseRodLength('4,2')).toBeCloseTo(4.2, 12);
    expect(parseRodLength('3.7 m')).toBeCloseTo(3.7, 12);
    expect(parseRodLength('12', 'ft')).toBeCloseTo(12 * 0.3048, 12);
    expect(parseRodLength('catorce')).toBeNull();
  });
});

describe('cartuchos según la broca del frente', () => {
  const lib = createDefaultLibrary();
  const big = lib.explosives.find((e) => e.cartridge && e.cartridge.diameter > 0.06);
  const small = lib.explosives.find(
    (e) => e.cartridge && e.cartridge.diameter > 0.03 && e.cartridge.diameter < 0.033,
  );
  const bulk = lib.explosives.find((e) => e.form === 'bulk');

  it('con broca de 45 mm el cartucho de 2½″ (63,5 mm) va aparte, como «no entra»', () => {
    if (!big || !small) throw new Error('biblioteca sin cartuchos');
    const g = explosivesForHole(lib, 0.045);
    expect(g.tooLarge).toContain(big);
    expect(g.fits).toContain(small);
    expect(cartridgeFits(0.045, big)).toBe(false);
    // Ordenados de menor a mayor: el primer encartuchado que entra es el más delgado.
    const ds = g.fits.map((e) => e.cartridge?.diameter ?? 0);
    expect([...ds].sort((a, b) => a - b)).toEqual(ds);
  });

  it('elegir el explosivo principal fija el diámetro del cartucho y no cambia el contorno', () => {
    if (!small || !bulk || !big) throw new Error('biblioteca incompleta');
    const form = { contourExplosiveId: null, cartridgeDiameter: 0.032 };
    const p = mainExplosivePatch(form, small, big);
    expect(p.cartridgeDiameter).toBeCloseTo(0.0635, 9);
    // El contorno seguía al principal: queda en el anterior.
    expect(p.contourExplosiveId).toBe(small.id);
    expect(mainExplosivePatch({ ...form, contourExplosiveId: 'x' }, small, bulk)).toMatchObject({
      contourExplosiveId: 'x',
      cartridgeDiameter: 0,
    });
  });

  it('el genérico 1¼″ × 8″ mide 31,75 × 203,2 mm', () => {
    const g = genericSmallCartridge(undefined);
    expect(g.cartridge.diameter).toBeCloseTo(0.03175, 9);
    expect(g.cartridge.length).toBeCloseTo(0.2032, 9);
    // m = ρ·π·d²/4·L con ρ = 1150 kg/m³.
    expect(g.cartridge.mass).toBeCloseTo((1150 * Math.PI * 0.03175 ** 2 * 0.2032) / 4, 9);
  });
});
