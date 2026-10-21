import { describe, expect, it } from 'vitest';
import { createBlast, createEmptyProject } from '../model/factories';
import { newId } from '../model/ids';
import { createDefaultLibrary } from '../model/library';
import type { Hole } from '../model/types';
import { computeTiming } from '../timing/timing';
import { kuzRamInputsFromBlast } from '../fragmentation/fragmentation';
import { createDefaultRockMass } from '../model/factories';
import { couplingGroups } from './analysis';
import { blastForShot, projectForShot, resolveShot, shotTag, undergroundShots } from './shots';

/**
 * A8 (prueba de usabilidad, subterránea): el frente y los abanicos son voladas distintas. Con el
 * mismo número de retardo (500 ms) en un taladro del frente y dos del abanico, antes salían
 * «F-7, A1-4, A2-14 juntos a 500 ms» y la fragmentación promediaba los dos diseños.
 */

function must<T>(x: T | null | undefined): T {
  if (x === null || x === undefined) throw new Error('valor ausente');
  return x;
}

const lib = createDefaultLibrary();
const bulk = must(lib.explosives.find((e) => e.family === 'emulsion' && e.form === 'bulk'));
const electronic = must(lib.detonators.find((d) => d.type === 'electronic'));

function hole(label: string, x: number, tags: string[], delayMs: number): Hole {
  return {
    id: newId<'Hole'>(),
    label,
    collar: { x, y: 0, z: 1 },
    diameter: 0.045,
    length: 3.5,
    inclination: Math.PI / 2,
    azimuth: 0,
    subdrill: 0,
    decks: [{ id: newId<'Deck'>(), kind: 'explosive', length: 3, explosiveId: bulk.id }],
    initiators: [
      {
        id: newId<'InHoleInitiator'>(),
        detonatorId: electronic.id,
        depth: 3,
        delay: delayMs / 1000,
      },
    ],
    status: 'designed',
    tags,
  };
}

function twoShots() {
  const f7 = hole('F-7', 0, ['ug-face'], 500);
  const f8 = hole('F-8', 0.8, ['ug-face'], 525);
  const cut = hole('F-1', 0.3, ['ug-face', 'ug-cut'], 0);
  const a14 = hole('A1-4', 60, ['ug-ring'], 500);
  const a214 = hole('A2-14', 62, ['ug-ring'], 502);
  const blast = {
    ...createBlast('GL-420', createEmptyProject().rockMasses[0]?.id ?? newId<'RockMass'>()),
    holes: [f7, cut, a14, f8, a214],
  };
  return { blast, f7, f8, cut, a14, a214 };
}

describe('disparos subterráneos (cada diseño es su propia volada)', () => {
  it('la marca del diseño identifica el disparo; las auxiliares no', () => {
    const { blast, cut } = twoShots();
    expect(shotTag(cut)).toBe('ug-face');
    expect(shotTag({ tags: [] })).toBe('');
    expect(undergroundShots(blast).map((s) => [s.tag, s.holeIds.length])).toEqual([
      ['ug-face', 3],
      ['ug-ring', 2],
    ]);
  });

  it('no acopla un taladro del frente con los del abanico aunque salgan a 500 ms', () => {
    const { blast, a14, a214 } = twoShots();
    const t = Float64Array.from(blast.holes, (h) => h.initiators[0]?.delay ?? NaN);
    const groups = couplingGroups(blast.holes, t, lib, 0.008);
    // Solo A1-4 y A2-14 (mismo abanico, 2 ms entre ellos); F-7 no entra.
    expect(groups.map((g) => g.holeIds)).toEqual([[a14.id, a214.id]]);
  });

  it('los tiempos de la voladura no suman taladros de disparos distintos por ventana', () => {
    const { blast, a14, a214 } = twoShots();
    const timing = computeTiming(blast, lib, { coincidenceWindow: 0.008 });
    expect(timing.coincidentGroups).toEqual([[a14.id, a214.id]]);
    // Ventana de 8 ms: a lo sumo 2 taladros (los del abanico), no 3 con F-7.
    expect(timing.maxHolesPerWindow).toBe(2);
  });

  it('la voladura de un disparo deja solo sus taladros, su red de inicio y sus excavaciones', () => {
    const { blast, f7, a14 } = twoShots();
    const full = {
      ...blast,
      initiation: {
        ...blast.initiation,
        initiationPoints: [
          { id: newId<'InitiationPoint'>(), at: { kind: 'hole' as const, holeId: f7.id }, time: 0 },
          {
            id: newId<'InitiationPoint'>(),
            at: { kind: 'hole' as const, holeId: a14.id },
            time: 0,
          },
        ],
      },
      excavations: [
        { tag: 'ug-face', kind: 'drive' as const, sections: [] },
        { tag: 'ug-ring', kind: 'stope' as const, sections: [] },
      ],
    };
    const face = blastForShot(full, 'ug-face');
    expect(face.holes.map((h) => h.label)).toEqual(['F-7', 'F-1', 'F-8']);
    expect(face.initiation.initiationPoints).toHaveLength(1);
    expect(face.excavations?.map((e) => e.tag)).toEqual(['ug-face']);

    const project = { ...createEmptyProject(), blasts: [full] };
    const rings = projectForShot(project, full.id, 'ug-ring');
    expect(rings.blasts[0]?.holes.map((h) => h.label)).toEqual(['A1-4', 'A2-14']);
    // Sin disparo elegido, el mismo proyecto.
    expect(projectForShot(project, full.id, null)).toBe(project);
  });

  it('el disparo elegido se respeta; si ya no existe se toma el primero; con uno solo, null', () => {
    const { blast } = twoShots();
    expect(resolveShot(blast, 'ug-ring')).toBe('ug-ring');
    expect(resolveShot(blast, 'ug-sublevel')).toBe('ug-face');
    expect(resolveShot(blast, null)).toBe('ug-face');
    expect(resolveShot(blastForShot(blast, 'ug-face'), 'ug-face')).toBeNull();
  });

  it('Kuz-Ram de un disparo de abanicos: H = largo de taladro y B = burden entre anillos', () => {
    const { blast } = twoShots();
    const rings = blastForShot(
      {
        ...blast,
        bench: { ...blast.bench, height: 15 },
        excavations: [{ tag: 'ug-ring', kind: 'stope', sections: [], burden: 1.8 }],
      },
      'ug-ring',
    );
    // 2 taladros de 3 kg/m³ de factor de carga con m kg cada uno: V = m/K por taladro.
    const perHole = Float64Array.from([20, 20]);
    const inputs = must(
      kuzRamInputsFromBlast(
        rings,
        lib,
        { perHole, loadingFactor: 2, holeIds: rings.holes.map((h) => h.id) },
        createDefaultRockMass(),
      ),
    );
    // No hay banco: el largo de los taladros (3,5 m), no los 15 m del banco por defecto.
    expect(inputs.benchHeight).toBeCloseTo(3.5, 9);
    expect(inputs.burden).toBeCloseTo(1.8, 9);
    // S = V/(B·H) = (20/2)/(1,8·3,5) m.
    expect(inputs.spacing).toBeCloseTo(10 / (1.8 * 3.5), 9);
  });
});
