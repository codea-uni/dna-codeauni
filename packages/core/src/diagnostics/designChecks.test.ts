import { describe, expect, it } from 'vitest';
import { applyChargeRule } from '../charging/charge';
import { createBlast, createHole, DEFAULT_BENCH, DEFAULT_HOLE_TEMPLATE } from '../model/factories';
import { newId } from '../model/ids';
import { createDefaultLibrary } from '../model/library';
import type { Blast, Hole } from '../model/types';
import { computeTiming } from '../timing/timing';
import { designChecks } from './designChecks';

const lib = createDefaultLibrary();
function first<T>(list: readonly T[]): T {
  const v = list[0];
  if (v === undefined) throw new Error('librería incompleta');
  return v;
}
const anfo = first(lib.explosives);
const stem = first(lib.stemmingMaterials);
const det = first(lib.detonators);

function loaded(x: number, stemming = 4): Hole {
  const h = createHole({
    position: { x, y: 0 },
    template: DEFAULT_HOLE_TEMPLATE,
    bench: DEFAULT_BENCH,
    label: String(x),
  });
  return {
    ...h,
    ...applyChargeRule(
      h,
      {
        stemmingLength: stemming,
        stemmingMaterialId: stem.id,
        explosiveId: anfo.id,
        detonatorId: det.id,
        primerOffsetFromToe: 0.5,
      },
      lib,
    ),
  };
}

function blastOf(holes: Hole[], burden = 5): Blast {
  const pattern = {
    id: newId<'Pattern'>(),
    name: 'P',
    kind: 'square' as const,
    burden,
    spacing: burden,
    origin: { x: 0, y: 0 },
    rowAzimuth: Math.PI / 2,
    rowAdvance: 'right' as const,
    rows: 1,
    holesPerRow: holes.length,
    holeTemplate: DEFAULT_HOLE_TEMPLATE,
  };
  return {
    ...createBlast('V', newId<'RockMass'>()),
    // Cara libre al frente (RM-06): sin ella se avisa voladura confinada.
    freeFaces: [
      {
        id: newId<'FreeFace'>(),
        crest: [
          { x: -10, y: -5, z: 15 },
          { x: 30, y: -5, z: 15 },
        ],
      },
    ],
    patterns: [pattern],
    holes: holes.map((h) => ({ ...h, patternId: pattern.id })),
  };
}

describe('diagnóstico de diseño', () => {
  it('diseño correcto: sin alertas (sin tiempos no evalúa iniciación)', () => {
    // Solo la nota informativa H/Ø (15 m / 0,2 m = 75, fuera de 50–70, R0).
    expect(designChecks(blastOf([loaded(0), loaded(6)]), null).map((c) => c.id)).toEqual([
      'benchDiameter',
    ]);
  });

  it('P-04: sin malla, el taco mínimo es 20·Ø (Ø 0,2 m → 4 m)', () => {
    const b = { ...blastOf([loaded(0, 3.9), loaded(6, 4)]), patterns: [] };
    const holes = b.holes.map((h) => {
      const copy = { ...h };
      delete copy.patternId;
      return copy;
    });
    const checks = designChecks({ ...b, holes }, null);
    expect(checks.find((c) => c.id === 'shortStemming')?.holes).toEqual([holes[0]?.id]);
  });

  it('verificaciones de 02 §6: rigidez, sobreperforación, taco largo y cara libre', () => {
    // B = 8 m: H/B = 15/8 = 1,875 ≤ 2 (CR-01, rigidez pobre); J = 1,5 m → J/B = 0,19 < 0,2;
    // taco 12 m > 1,3·B = 10,4 m; sin cara libre → voladura confinada.
    const b = { ...blastOf([loaded(0, 12)], 8), freeFaces: [] };
    const ids = designChecks(b, null).map((c) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining(['noFreeFace', 'lowStiffness', 'subdrillRange', 'longStemming']),
    );
    // Con B = 5 (H/B = 3, J/B = 0,3, taco 3,5 m = 0,7·B) no salta ninguna
    const ok = designChecks(blastOf([loaded(0, 3.5)], 5), null).map((c) => c.id);
    expect(ok).not.toEqual(expect.arrayContaining(['lowStiffness']));
    expect(ok).not.toContain('subdrillRange');
    expect(ok).not.toContain('longStemming');
  });

  it('taco corto con la regla 0.7 × burden y sin taco', () => {
    // Burden 5 → taco mínimo 3.5 m: 3.4 m es corto, 3.5 m no.
    const b = blastOf([loaded(0, 3.4), loaded(6, 3.5), loaded(12, 0)]);
    const checks = designChecks(b, null);
    expect(checks.find((c) => c.id === 'shortStemming')?.holes).toEqual([b.holes[0]?.id]);
    expect(checks.find((c) => c.id === 'noStemming')?.holes).toEqual([b.holes[2]?.id]);
  });

  it('sin carga, sin detonador, columna excedida y duplicados', () => {
    const base = loaded(0);
    const noDet = { ...loaded(6), initiators: [] };
    const empty = { ...loaded(12), decks: [], initiators: [] };
    const over = {
      ...loaded(18),
      decks: [...loaded(18).decks, { id: newId<'Deck'>(), kind: 'air' as const, length: 2 }],
    };
    const dup = { ...loaded(0.3), id: newId<'Hole'>() };
    const b = blastOf([base, noDet, empty, over, dup]);
    const byId = Object.fromEntries(designChecks(b, null).map((c) => [c.id, c.holes]));
    expect(byId.noDetonator).toEqual([noDet.id]);
    expect(byId.unloaded).toEqual([empty.id]);
    expect(byId.overcharged).toEqual([over.id]);
    expect(new Set(byId.duplicate)).toEqual(new Set([base.id, dup.id]));
  });

  it('con tiempos: cargados sin iniciar y coincidencias; errores primero', () => {
    const b = blastOf([loaded(0), loaded(6)]);
    const timing = computeTiming(b, lib); // sin amarres ni puntos de inicio → nadie iniciado
    const checks = designChecks(b, timing);
    expect(checks[0]?.id).toBe('notInitiated');
    expect(checks[0]?.holes).toHaveLength(2);
    expect(
      checks.every(
        (c, i) =>
          i === 0 ||
          ['error', 'warning', 'info'].indexOf(c.severity) >=
            ['error', 'warning', 'info'].indexOf(checks[i - 1]?.severity ?? 'error'),
      ),
    ).toBe(true);
  });
});

describe('vecinos que disparan juntos', () => {
  it('marca vecinos con Δt < ventana y no a taladros lejanos', () => {
    // Taladros en x = 0, 5, 30 con retardos en taladro 500, 504 y 500 ms (sin red: electrónicos)
    const elec = lib.detonators.find((d) => d.type === 'electronic');
    if (!elec) throw new Error('sin electrónico');
    const holes = [0, 5, 30].map((x, i) => ({
      ...loaded(x),
      initiators: [
        {
          id: newId<'InHoleInitiator'>(),
          detonatorId: elec.id,
          depth: 16,
          delay: [0.5, 0.504, 0.5][i] ?? 0,
        },
      ],
    }));
    const b = blastOf(holes);
    const timing = computeTiming(b, lib);
    const c = designChecks(b, timing).find((x) => x.id === 'coincident');
    // Radio de vecindad 1.5 × 5 = 7.5 m: 0 y 5 son vecinos (Δt 4 ms); 30 dispara con 0 pero está lejos.
    expect(new Set(c?.holes)).toEqual(new Set([holes[0]?.id, holes[1]?.id]));
    // Con Δt de 8 ms justos no hay coincidencia
    const far = holes.map((h, i) => ({
      ...h,
      initiators: h.initiators.map((init) => ({ ...init, delay: [0.5, 0.508, 0.6][i] ?? 0 })),
    }));
    expect(
      designChecks(blastOf(far), computeTiming(blastOf(far), lib)).find(
        (x) => x.id === 'coincident',
      ),
    ).toBeUndefined();
  });
});
