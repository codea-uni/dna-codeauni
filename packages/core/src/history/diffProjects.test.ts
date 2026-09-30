import { describe, expect, it } from 'vitest';
import {
  createBlast,
  createEmptyProject,
  createHole,
  DEFAULT_BENCH,
  DEFAULT_HOLE_TEMPLATE,
} from '../model/factories';
import type { DeckId, DetonatorId, Hole, InHoleInitiatorId, Project } from '../model/types';
import { deepEqual, diffProjects, isEmptyDiff } from './diffProjects';

/**
 * Pruebas del historial de versiones (D-14). No es una fórmula minera: el valor esperado de cada
 * prueba es el cambio que el propio fixture hace a mano (un taladro movido, uno quitado…).
 */

function hole(i: number): Hole {
  return createHole({
    position: { x: i * 5, y: 0 },
    template: DEFAULT_HOLE_TEMPLATE,
    bench: DEFAULT_BENCH,
    label: `H${i + 1}`,
  });
}

/** Proyecto con una voladura de 6 taladros, cada uno con un detonador a 500 ms. */
function base(): Project {
  const p = createEmptyProject('Banco 3400', new Date('2026-09-30T10:00:00Z'));
  const blast = p.blasts[0];
  if (!blast) throw new Error('sin voladura');
  blast.holes = Array.from({ length: 6 }, (_, i) => ({
    ...hole(i),
    initiators: [
      {
        id: `i${i}` as InHoleInitiatorId,
        detonatorId: 'det' as DetonatorId,
        depth: 14,
        delay: 0.5,
      },
    ],
  }));
  return p;
}

function at<T>(list: readonly T[], i: number): T {
  const v = list[i];
  if (v === undefined) throw new Error(`índice ${i}`);
  return v;
}

describe('diffProjects', () => {
  it('dos copias iguales no tienen diferencias', () => {
    const a = base();
    const d = diffProjects(a, structuredClone(a));
    expect(isEmptyDiff(d.summary)).toBe(true);
    expect(d.blasts.map((b) => b.kind)).toEqual(['unchanged']);
  });

  it('cuenta cada tipo de cambio de taladro una vez', () => {
    const a = base();
    const b = structuredClone(a);
    const holes = at(b.blasts, 0).holes;
    // H1 movido 0,5 m al Norte; H2 movido 5 mm (bajo la tolerancia de 0,01 m: no cuenta)
    at(holes, 0).collar.y += 0.5;
    at(holes, 1).collar.x += 0.005;
    // H3 con otro diámetro; H4 con otra carga; H5 con otro retardo de fondo; H6 quitado; uno nuevo
    at(holes, 2).diameter = 0.165;
    at(holes, 3).decks = [{ id: 'd1' as DeckId, kind: 'air', length: 1 }];
    at(at(holes, 4).initiators, 0).delay = 0.525;
    holes.splice(5, 1);
    holes.push(hole(10));

    const d = diffProjects(a, b);
    expect(d.summary).toMatchObject({
      holesAdded: 1,
      holesRemoved: 1,
      holesMoved: 1,
      holesGeometry: 1,
      holesCharge: 1,
      holesTiming: 1,
      holesOther: 0,
      blastsAdded: 0,
      blastsRemoved: 0,
      blastFields: [],
      projectFields: [],
    });
    const h1 = at(d.blasts, 0).holes.find((h) => h.label === 'H1');
    expect(h1?.moved).toBeCloseTo(0.5, 12);
    expect(at(d.blasts, 0).holes.find((h) => h.label === 'H2')).toBeUndefined();
  });

  it('otros datos del taladro (etiqueta, grupo, estado) se cuentan aparte', () => {
    const a = base();
    const b = structuredClone(a);
    at(at(b.blasts, 0).holes, 0).label = 'H1b';
    at(at(b.blasts, 0).holes, 1).status = 'drilled';
    const d = diffProjects(a, b);
    expect(d.summary).toMatchObject({ holesOther: 2, holesMoved: 0, holesTiming: 0 });
  });

  it('la tolerancia de movimiento es un parámetro', () => {
    const a = base();
    const b = structuredClone(a);
    at(at(b.blasts, 0).holes, 1).collar.x += 0.005;
    expect(diffProjects(a, b, { moveTolerance: 0.001 }).summary.holesMoved).toBe(1);
    expect(diffProjects(a, b).summary.holesMoved).toBe(0);
  });

  it('voladuras agregadas y quitadas llevan sus taladros', () => {
    const a = base();
    const b = structuredClone(a);
    const rockId = at(b.rockMasses, 0).id;
    const extra = createBlast('Voladura 2', rockId);
    extra.holes = [hole(0), hole(1)];
    b.blasts = [extra];
    const d = diffProjects(a, b);
    expect(d.summary).toMatchObject({
      blastsAdded: 1,
      blastsRemoved: 1,
      holesAdded: 2,
      holesRemoved: 6,
    });
  });

  it('cambios de voladura y de proyecto se nombran por campo', () => {
    const a = base();
    const b = structuredClone(a);
    b.name = 'Banco 3400 (rev. B)';
    b.coordinateSystem = { ...b.coordinateSystem, epsg: 32719 };
    b.updatedAt = '2026-10-01T00:00:00Z'; // cambia al guardar: no es un cambio del diseño
    at(b.blasts, 0).bench = { ...at(b.blasts, 0).bench, height: 12 };
    const d = diffProjects(a, b);
    expect(d.projectFields).toEqual(['name', 'coordinateSystem']);
    expect(d.summary.blastFields).toEqual(['bench']);
    expect(d.summary.holesMoved).toBe(0);
  });
});

describe('deepEqual', () => {
  it('compara estructuras y trata una clave ausente igual que undefined', () => {
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual({ a: 1 }, [1])).toBe(false);
    expect(deepEqual(null, {})).toBe(false);
  });
});
