import { describe, expect, it } from 'vitest';
import { createBlast, createHole, DEFAULT_BENCH } from '../model/factories';
import { newId } from '../model/ids';
import type { Blast, Deck, Explosive, Hole, HoleWater, ProductLibrary } from '../model/types';
import { chargeChecks, waterCompatible } from './chargeChecks';
import { checkOptionsOf } from './designChecks';

const product = (family: Explosive['family'], waterResistance: Explosive['waterResistance']) => ({
  id: newId<'Explosive'>(),
  name: family,
  family,
  form: 'bulk' as const,
  density: 800,
  vod: 4000,
  energy: 3.7e6,
  rws: 1,
  waterResistance,
});
const anfo: Explosive = { ...product('anfo', 'none'), needsBooster: true, criticalDiameter: 0.1 };
const emulsion: Explosive = product('emulsion', 'high');
const primerId = newId<'Primer'>();
const stemmingId = newId<'StemmingMaterial'>();
const lib: ProductLibrary = {
  explosives: [anfo, emulsion],
  detonators: [],
  surfaceConnectors: [],
  primers: [{ id: primerId, name: 'Booster', mass: 0.45 }],
  stemmingMaterials: [{ id: stemmingId, name: 'Grava', density: 1800 }],
};

const exp = (e: Explosive, length: number): Deck => ({
  id: newId<'Deck'>(),
  kind: 'explosive',
  explosiveId: e.id,
  length,
});
const stem = (length: number): Deck => ({
  id: newId<'Deck'>(),
  kind: 'stemming',
  materialId: stemmingId,
  length,
});

function hole(decks: Deck[], boosterDepths: number[], extra: Partial<Hole> = {}): Hole {
  const h = createHole({
    position: { x: 0, y: 0 },
    template: { diameter: 0.2, inclination: 0, azimuth: 0, subdrill: 1.5 },
    bench: DEFAULT_BENCH,
    label: '1',
  });
  return {
    ...h,
    length: 16.5,
    decks,
    initiators: boosterDepths.map((depth) => ({
      id: newId<'InHoleInitiator'>(),
      detonatorId: newId<'Detonator'>(),
      primerId,
      depth,
      delay: 0.5,
    })),
    ...extra,
  };
}

function check(holes: Hole[]) {
  const blast: Blast = { ...createBlast('C', newId<'RockMass'>()), holes };
  return Object.fromEntries(
    chargeChecks(blast, lib, checkOptionsOf(blast)).map((c) => [c.id, c.holes]),
  );
}

describe('revisión de la carga (G4)', () => {
  it('columna que no cierra (R3) y booster por carga continua (RM-05)', () => {
    const ok = hole([exp(anfo, 12), stem(4.5)], [16]);
    const open = hole([exp(anfo, 12), stem(4)], [16]); // 0,5 m sin asignar
    const decked = hole([exp(anfo, 6), stem(2), exp(anfo, 4), stem(4.5)], [16]); // deck superior sin booster
    const both = hole([exp(anfo, 6), stem(2), exp(anfo, 4), stem(4.5)], [16, 7]);
    const r = check([ok, open, decked, both]);
    expect(r.openColumn).toEqual([open.id]);
    expect(r.noBooster).toEqual([decked.id]);
  });

  it('agua (P-09): estática sin ANFO; dinámica solo emulsión', () => {
    const cases: [HoleWater | undefined, Explosive, boolean][] = [
      [undefined, anfo, true],
      ['dry', anfo, true],
      ['static', anfo, false],
      ['static', emulsion, true],
      ['static', product('heavy-anfo', 'limited'), true],
      ['dynamic', product('heavy-anfo', 'limited'), false],
      ['dynamic', emulsion, true],
    ];
    for (const [water, e, ok] of cases)
      expect(waterCompatible(e, water), `${String(water)} ${e.family}`).toBe(ok);
    const wet = hole([exp(anfo, 12), stem(4.5)], [16], { water: 'static' });
    expect(check([wet]).waterIncompatible).toEqual([wet.id]);
  });

  it('diámetro crítico (CK-09): Ø 0,2 m con crítico 0,25 m', () => {
    const small = hole([exp({ ...anfo, criticalDiameter: 0.25 }, 12), stem(4.5)], [16]);
    const lib2 = { ...lib, explosives: [{ ...anfo, criticalDiameter: 0.25 }] };
    const blast: Blast = { ...createBlast('C', newId<'RockMass'>()), holes: [small] };
    expect(chargeChecks(blast, lib2, checkOptionsOf(blast)).map((c) => c.id)).toContain(
      'belowCriticalDiameter',
    );
  });

  it('SDOB (CK-08, DF-20): taco 1 m → severa; taco 3 m → baja; taco 5,5 m → sin aviso', () => {
    // q = 800·π/4·0,2² = 25,13 kg/m; L_w = 2 m, W = 50,3 kg (∛ = 3,69)
    // taco 1 → D = 2 → SD 0,54 < 1,2; taco 0,4 → D = 1,4 → SD 0,38 < 0,4; taco 5,5 → SD 1,76
    const severe = hole([exp(anfo, 16.1), stem(0.4)], [16]);
    const low = hole([exp(anfo, 15.5), stem(1)], [16]);
    const fine = hole([exp(anfo, 11), stem(5.5)], [16]);
    const r = check([severe, low, fine]);
    expect(r.sdobSevere).toEqual([severe.id]);
    expect(r.sdobLow).toEqual([low.id]);
  });
});
