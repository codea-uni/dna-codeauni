/**
 * Precorte y buffer: CR-01 (`docs/theory/04`, ejemplo A.2 y A.3 de `R1`) y el ejemplo `X-PRE
 * Precorte CMcK` de `R1` F26. Valores esperados tal como en la fuente.
 */
import { describe, expect, it } from 'vitest';
import { createBlast, createHole, DEFAULT_BENCH } from '../model/factories';
import { newId } from '../model/ids';
import type { Blast, Explosive, Hole, HoleGroup, ProductLibrary, RockMass } from '../model/types';
import { DEFAULT_CHECK_OPTIONS } from '../diagnostics/designChecks';
import {
  bufferBurden,
  bufferSpacing,
  decouplingRatio,
  presplitBufferDistance,
  presplitChargeDiameter,
  presplitChecks,
  presplitDecoupling,
  presplitHole,
  presplitLoadFactor,
  presplitMaxSpacing,
  presplitPressure,
} from './presplit';

const IN = 0.0254;
const rel = (value: number, expected: number, tol: number) => {
  expect(Math.abs(value - expected) / Math.abs(expected)).toBeLessThanOrEqual(tol);
};

describe('CR-01 precorte (R1 A.3, P1-S5 p69)', () => {
  // Ø 6½", ρ 1,1 g/cc, VOD 3,5 km/s, UCS 50 MPa, RT 8 MPa, seco, 13 de 15 m cargados.
  const D = 6.5 * IN;

  it('imponiendo Pb = UCS: f = 0,0664 y D_exp = 1,80"', () => {
    const f = presplitDecoupling(50e6, 1100, 3500, false);
    rel(f, 0.0664, 0.005);
    rel(presplitChargeDiameter(f, D, 13, 15) / IN, 1.8, 0.005);
  });

  it('con 1¾": f = 0,0628, Pb = 46,6 MPa y E = 1,12–1,13 m', () => {
    const f = decouplingRatio(1.75 * IN, D, 13, 15);
    rel(f, 0.0628, 0.005);
    const pb = presplitPressure(f, 1100, 3500, false);
    rel(pb, 46.6e6, 0.005);
    const e = presplitMaxSpacing(D, pb, 8e6);
    expect(e).toBeGreaterThanOrEqual(1.12);
    expect(e).toBeLessThanOrEqual(1.13);
    // γ con la columna cargada: 1,514 kg/m² (P-18, confirmado por el ingeniero; `04` dice 1,53–1,54).
    rel(presplitLoadFactor(1.75 * IN, 1100, e), 1.514, 0.002);
  });
});

describe('Precorte X-PRE CMcK (R1 F26)', () => {
  // Dh 6,5" (165,1 mm), UCS 100 MPa, RT 8 MPa, ρ 1,1, VOD 5 km/s, seco, R = 1.
  it('E = 2,229 m; carga de 42,2 mm, 1,54 kg/m y γ = 0,691 kg/m²; Pb = 100 MPa', () => {
    const e = presplitMaxSpacing(0.1651, 100e6, 8e6);
    rel(e, 2.229, 0.001);
    const f = presplitDecoupling(100e6, 1100, 5000, false);
    const dc = presplitChargeDiameter(f, 0.1651, 1, 1);
    rel(dc, 0.0422, 0.005);
    rel(presplitLoadFactor(dc, 1100, 1), 1.54, 0.005);
    rel(presplitLoadFactor(dc, 1100, e), 0.691, 0.005);
    rel(presplitPressure(0.0654, 1100, 5000, false), 100e6, 0.005);
  });

  it('con agua el exponente baja a 0,9 y la presión sube (f < 1)', () => {
    expect(presplitPressure(0.0654, 1100, 5000, true)).toBeGreaterThan(
      presplitPressure(0.0654, 1100, 5000, false),
    );
  });
});

describe('CR-01 buffer (R1 A.2)', () => {
  // 9⅞" con W = 380 kg, FC 253 g/t, K_BP 1, H 15 m, ρ_r 2,6 t/m³, SBR = 8,9/8 ≈ 1,1, Q_b 5 m.
  it('B_buf = 5,9 m; S_buf = 1,15·6 = 6,9 m; DST = 3,4 m', () => {
    rel(bufferBurden(380, 253e-6, 15, 2600, 1.1), 5.9, 0.01);
    rel(bufferSpacing(6), 6.9, 1e-9);
    const dst = presplitBufferDistance(
      { diameter: 9.875 * IN, spacing: 6.9, burden: 6 },
      { diameter: 12.25 * IN, spacing: 8.9, burden: 8 },
      5,
    );
    rel(dst, 3.4, 0.01);
  });
});

describe('presplitChecks', () => {
  const emulsion: Explosive = {
    id: newId<'Explosive'>(),
    name: 'Emulsión encartuchada',
    family: 'emulsion',
    form: 'packaged',
    density: 1100,
    vod: 3500,
    energy: 3e6,
    rws: 1,
    waterResistance: 'high',
  };
  const stemmingId = newId<'StemmingMaterial'>();
  const library: ProductLibrary = {
    explosives: [emulsion],
    detonators: [],
    surfaceConnectors: [],
    primers: [],
    stemmingMaterials: [{ id: stemmingId, name: 'Grava', density: 1800 }],
  };
  const hole = (x: number, y: number, diameter: number): Hole => ({
    ...createHole({
      position: { x, y },
      template: { diameter, inclination: 0, azimuth: 0, subdrill: 0 },
      bench: DEFAULT_BENCH,
      label: `${String(x)},${String(y)}`,
    }),
    length: 15,
  });
  const rock: RockMass = {
    id: newId<'RockMass'>(),
    name: 'CR-01',
    density: 2600,
    ucs: 50e6,
    youngModulus: 50e9,
    tensileStrength: 8e6,
  };

  function build(spacing: number, chargeDiameter: number): Blast {
    const group: HoleGroup = {
      id: newId<'HoleGroup'>(),
      name: 'Precorte',
      kind: 'presplit',
      color: '#000000',
    };
    const blast = createBlast('P', rock.id);
    blast.groups = [group];
    blast.holes = [0, 1, 2].map((i) => {
      const h = hole(i * spacing, 0, 6.5 * IN);
      h.groupId = group.id;
      h.decks = [
        { id: newId<'Deck'>(), kind: 'stemming', materialId: stemmingId, length: 2 },
        {
          id: newId<'Deck'>(),
          kind: 'explosive',
          explosiveId: emulsion.id,
          length: 13,
          effectiveDiameter: chargeDiameter,
        },
      ];
      return h;
    });
    return blast;
  }

  const ids = (blast: Blast, fireTime: number[], id: string) =>
    presplitChecks(blast, library, rock, Float64Array.from(fireTime), DEFAULT_CHECK_OPTIONS).find(
      (c) => c.id === id,
    )?.holes.length ?? 0;

  it('CR-01 con 1¾" a 1,1 m: sin avisos; a 1,5 m, espaciamiento mayor que el máximo', () => {
    expect(ids(build(1.1, 1.75 * IN), [0, 0, 0], 'presplitSpacing')).toBe(0);
    expect(ids(build(1.1, 1.75 * IN), [0, 0, 0], 'presplitPressure')).toBe(0);
    expect(ids(build(1.5, 1.75 * IN), [0, 0, 0], 'presplitSpacing')).toBe(3);
  });

  it('el taladro de CR-01 sugiere 1,80" para Pb = UCS', () => {
    const h = build(1.1, 1.75 * IN).holes[0];
    if (!h) throw new Error('sin taladro');
    const p = presplitHole(h, library, rock);
    rel((p?.chargeDiameterForUcs ?? 0) / IN, 1.8, 0.005);
    rel(p?.pb ?? 0, 46.6e6, 0.005);
  });

  it('carga a pleno diámetro: Pb supera la UCS', () => {
    expect(ids(build(1.1, 6.5 * IN), [0, 0, 0], 'presplitPressure')).toBe(3);
  });

  it('adelanto sobre la producción ≥ 100 ms', () => {
    const blast = build(1.1, 1.75 * IN);
    blast.holes.push(hole(0, 5, 0.2));
    expect(ids(blast, [0, 0, 0, 0.05], 'presplitLead')).toBe(3);
    expect(ids(blast, [0, 0, 0, 0.1], 'presplitLead')).toBe(0);
  });
});
