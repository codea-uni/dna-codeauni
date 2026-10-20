import { describe, expect, it } from 'vitest';
import { analyzeBlast } from '../analysis/analyzeBlast';
import { createBlast, createDefaultRockMass, createEmptyProject } from '../model/factories';
import { newId } from '../model/ids';
import { createDefaultLibrary } from '../model/library';
import type { Blast, Hole, Vec3 } from '../model/types';
import {
  couplingGroups,
  facePlane,
  polygonArea3d,
  ringPlanes,
  rockVp,
  segmentDistance,
  undergroundTimingChecks,
  undergroundVolumes,
  waveCutoffRisks,
} from './analysis';
import { designFaceRound } from './faceDesign';
import { arched } from './profiles';
import { designRing, replicateRings } from './ringDesign';
import { faceFiringTimes, faceRoundToHoles, ringsToHoles } from './toHoles';
import { localToWorld, offsetFrame, planeFrame } from './transform';

function must<T>(x: T | null | undefined): T {
  if (x === null || x === undefined) throw new Error('valor ausente');
  return x;
}

const lib = createDefaultLibrary();
const bulk = must(lib.explosives.find((e) => e.family === 'emulsion' && e.form === 'bulk'));
const detonatorId = must(lib.detonators.find((d) => d.type === 'electronic')).id;
const rock = { ...createDefaultRockMass(), vp: 5000 };

/** Taladro horizontal de frente hacia el norte (boca en x, z), cargado 0,5–3,5 m. */
function faceHole(x: number, z: number, relief = false): Hole {
  return {
    id: newId<'Hole'>(),
    label: `H${String(x)}`,
    collar: { x, y: 0, z },
    diameter: 0.045,
    length: 3.5,
    inclination: Math.PI / 2,
    azimuth: 0,
    subdrill: 0,
    decks: relief
      ? []
      : [{ id: newId<'Deck'>(), kind: 'explosive', length: 3, explosiveId: bulk.id }],
    initiators: [],
    status: 'designed',
    tags: relief ? ['ug-face', 'ug-relief'] : ['ug-face'],
  };
}

const times = (...ms: number[]) => Float64Array.from(ms, (t) => t / 1000);

describe('acoplamiento y corte por onda (subterránea)', () => {
  it('un frente bien secuenciado (vecinos a 0,8 m, 25 ms entre ellos) no da avisos', () => {
    const holes = [faceHole(0, 1), faceHole(0.8, 1), faceHole(1.6, 1), faceHole(0.8, 1.8)];
    const t = times(0, 25, 50, 75);
    expect(couplingGroups(holes, t, lib)).toEqual([]);
    expect(waveCutoffRisks(holes, t, 5000)).toEqual([]);
    expect(undergroundTimingChecks({ holes }, t, lib, rock)).toEqual([]);
  });

  it('dos ayudas con el mismo número → acoplamiento', () => {
    const holes = [faceHole(0, 1), faceHole(0.8, 1), faceHole(1.6, 1)];
    const t = times(0, 100, 103);
    const groups = couplingGroups(holes, t, lib, 0.008);
    expect(groups).toHaveLength(1);
    expect(must(groups[0]).holeIds).toEqual([must(holes[1]).id, must(holes[2]).id]);
    expect(must(groups[0]).spread).toBeCloseTo(0.003, 9);
    const checks = undergroundTimingChecks({ holes }, t, lib, rock);
    expect(checks.map((c) => c.id)).toEqual(['ugCoupling']);
  });

  it('vecinos a 0,4 m: la onda del primero llega antes de que detone el segundo → corte', () => {
    // El alivio vacío a 0,1 m no cuenta.
    const holes = [faceHole(0, 1), faceHole(0.4, 1), faceHole(0.1, 1, true)];
    const t = times(0, 25, 0);
    const risks = waveCutoffRisks(holes, t, 5000);
    expect(risks).toHaveLength(1);
    const r = must(risks[0]);
    expect(r.firstId).toBe(must(holes[0]).id);
    expect(r.secondId).toBe(must(holes[1]).id);
    expect(r.distance).toBeCloseTo(0.4, 9);
    expect(r.arrival).toBeCloseTo(0.4 / 5000, 12);
    expect(r.delay).toBeCloseTo(0.025, 12);
    expect(undergroundTimingChecks({ holes }, t, lib, rock).map((c) => c.id)).toEqual([
      'ugWaveCutoff',
    ]);
    // Con agua la distancia límite se duplica: a 0,8 m también hay riesgo.
    const wet = [faceHole(0, 1), { ...faceHole(0.8, 1), water: 'static' as const }];
    expect(waveCutoffRisks(wet, times(0, 25), 5000)).toHaveLength(1);
    expect(
      waveCutoffRisks(
        wet.map((h) => ({ ...h, water: 'dry' as const })),
        times(0, 25),
        5000,
      ),
    ).toHaveLength(0);
  });

  it('ventana de llegada a un receptor: tiempos distintos pueden llegar juntos', () => {
    const holes = [faceHole(0, 1), faceHole(50, 1)];
    const t = times(0, 9); // 9 ms: no acoplados por disparo
    expect(couplingGroups(holes, t, lib, 0.008)).toHaveLength(0);
    // Receptor 50 m más allá del primero: la onda del primero tarda 10 ms más.
    const receiver = { position: { x: 100, y: 2, z: 1 }, vp: 5000 };
    expect(couplingGroups(holes, t, lib, 0.008, receiver)).toHaveLength(1);
  });

  it('Vp: dato de la roca, si no √(E/ρ)', () => {
    expect(rockVp(rock)).toEqual({ value: 5000, source: 'rock' });
    const est = rockVp(createDefaultRockMass());
    expect(est.source).toBe('estimated');
    expect(est.value).toBeCloseTo(Math.sqrt(50e9 / 2650), 6);
  });

  it('distancia entre segmentos 3D', () => {
    const o: Vec3 = { x: 0, y: 0, z: 0 };
    expect(
      segmentDistance(o, { x: 0, y: 3, z: 0 }, { x: 0.5, y: 1, z: 0 }, { x: 0.5, y: 2, z: 0 }),
    ).toBeCloseTo(0.5, 12);
    expect(
      segmentDistance(o, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 1 }, { x: 0, y: -1, z: 1 }),
    ).toBeCloseTo(1, 12);
  });
});

// Frente real: galería arco-D 4,5 × 4,5 m (caso de `faceDesign.test.ts`).
const profile = arched(4.5, 2.25);
const design = designFaceRound({
  profile,
  holeDiameter: 0.045,
  reliefDiameter: 0.102,
  explosiveDensity: bulk.density,
  rws: bulk.rws,
  maxDrillLength: 4,
});
const frame = planeFrame({ origin: { x: 100, y: 200, z: -300 }, azimuth: Math.PI / 3 });

function faceBlast(holeInterval: number): { blast: Blast; holes: Hole[] } {
  const holes = faceRoundToHoles({
    design,
    frame,
    products: { explosive: bulk, detonatorId },
    delayInterval: 0.1,
    holeInterval,
  });
  const section = (along: number) => profile.points.map((p) => localToWorld(frame, p, along));
  const blast: Blast = {
    ...createBlast('UG', newId<'RockMass'>()),
    holes,
    excavations: [{ tag: 'ug-face', kind: 'round', sections: [section(0), section(design.depth)] }],
    initiation: { system: 'electronic', connections: [], initiationPoints: [], nodes: [] },
  };
  return { blast, holes };
}

function holeTimes(holes: readonly Hole[]): Float64Array {
  return Float64Array.from(holes, (h) => h.initiators[0]?.delay ?? NaN);
}

describe('secuencia continua del frente', () => {
  it('sin separación los taladros del mismo número se acoplan; con 25 ms ninguno', () => {
    const lp = faceBlast(0).holes;
    expect(couplingGroups(lp, holeTimes(lp), lib).length).toBeGreaterThan(0);
    const cont = faceBlast(0.025).holes;
    expect(couplingGroups(cont, holeTimes(cont), lib)).toEqual([]);
  });

  it('los tiempos respetan el orden y el número de retardo', () => {
    const t = faceFiringTimes(design, 0.1, 0.025);
    let prev = -Infinity;
    design.holes.forEach((h, k) => {
      const tk = t[k];
      if (h.delay === null) return expect(tk).toBeNull();
      expect(tk).toBeGreaterThanOrEqual(h.delay * 0.1 - 1e-12);
      expect(must(tk)).toBeGreaterThanOrEqual(prev + 0.025 - 1e-12);
      prev = must(tk);
    });
    // Sin separación: número × intervalo (comportamiento anterior).
    expect(faceFiringTimes(design, 0.1)).toEqual(
      design.holes.map((h) => (h.delay === null ? null : h.delay * 0.1)),
    );
  });

  it('el análisis general incluye los avisos subterráneos y no los de banco', () => {
    const { blast } = faceBlast(0);
    const project = {
      ...createEmptyProject('P'),
      blasts: [{ ...blast, rockMassId: rock.id }],
      rockMasses: [rock],
      library: lib,
    };
    const a = must(analyzeBlast(project, blast.id));
    const ids = a.checks.map((c) => c.id);
    expect(ids).toContain('ugCoupling');
    for (const bench of ['unrelievedBurden', 'partialRelief', 'invertedOrder', 'stemmingEjection'])
      expect(ids).not.toContain(bench);
  });
});

describe('plano del frente y de los abanicos', () => {
  it('el plano del frente es perpendicular al avance, a la mitad de la profundidad', () => {
    const { holes } = faceBlast(0.025);
    const p = must(facePlane(holes, 0.5));
    const n = {
      x: p.u.y * p.v.z - p.u.z * p.v.y,
      y: p.u.z * p.v.x - p.u.x * p.v.z,
      z: p.u.x * p.v.y - p.u.y * p.v.x,
    };
    const f = frame.forward;
    expect(Math.abs(n.x * f.x + n.y * f.y + n.z * f.z)).toBeGreaterThan(0.99);
    expect(p.depth).toBeGreaterThan(0.9 * design.depth);
    expect(p.at).toBeCloseTo(p.depth / 2, 9);
  });
});

describe('cubicación subterránea', () => {
  it('frente: área del perfil × profundidad × eficiencia', () => {
    const { blast } = faceBlast(0.025);
    const [v] = undergroundVolumes(blast, lib, 2700, { advanceEfficiency: 0.9 });
    const face = must(v);
    expect(face.kind).toBe('face');
    expect(face.areaSource).toBe('excavation');
    expect(face.area).toBeCloseTo(profile.area, 6);
    expect(face.depth).toBeCloseTo(design.depth, 6);
    expect(face.volume).toBeCloseTo(profile.area * design.depth * 0.9, 6);
    expect(face.tonnage).toBeCloseTo(face.volume * 2700, 3);
    expect(face.loadingFactor).toBeCloseTo(face.explosive / face.volume, 9);
    // Sobreexcavación del 10 %: el área crece 10 %.
    const [ob] = undergroundVolumes(blast, lib, 2700, { advanceEfficiency: 0.9, overbreak: 0.1 });
    expect(must(ob).volume).toBeCloseTo(face.volume * 1.1, 6);
  });

  it('abanicos: (área del tajeo − galería) × burden × anillos', () => {
    const boundary = [
      { u: -7.5, v: -3 },
      { u: 7.5, v: -3 },
      { u: 7.5, v: 20 },
      { u: -7.5, v: 20 },
    ];
    const drive = arched(4, 2);
    const ring = designRing({
      pivot: { u: 0, v: 1.6 },
      boundary,
      drive: drive.points,
      mode: 'toeSpacing',
      toeSpacing: 2.5,
      holeDiameter: 0.089,
      explosiveDensity: bulk.density,
      burden: 2.2,
      rockDensity: 2700,
    });
    const rf = planeFrame({ origin: { x: 0, y: 0, z: 0 }, azimuth: 0.4 });
    const holes = ringsToHoles({
      ring,
      frame: rf,
      placements: replicateRings(3, 2.2),
      products: { explosive: bulk, detonatorId },
    });
    expect(ringPlanes(holes)).toHaveLength(3);
    const ext = (pts: readonly { u: number; v: number }[]) => [
      pts.map((p) => localToWorld(rf, p, -1.5)),
      pts.map((p) => localToWorld(offsetFrame(rf, 1), p, 0)),
    ];
    const blast: Blast = {
      ...createBlast('UG', newId<'RockMass'>()),
      holes,
      excavations: [
        { tag: 'ug-ring', kind: 'stope', sections: ext(boundary) },
        { tag: 'ug-ring', kind: 'drive', sections: ext(drive.points) },
      ],
    };
    const v = must(undergroundVolumes(blast, lib, 2700)[0]);
    expect(v.kind).toBe('rings');
    expect(v.rings).toBe(3);
    expect(v.burden).toBeCloseTo(2.2, 6);
    expect(v.area).toBeCloseTo(ring.kpis.area, 6);
    expect(v.volume).toBeCloseTo(ring.kpis.area * 2.2 * 3, 6);
    // Con el burden guardado en la excavación manda ese.
    const stored = {
      ...blast,
      excavations: must(blast.excavations).map((e) =>
        e.kind === 'stope' ? { ...e, burden: 2 } : e,
      ),
    };
    expect(must(undergroundVolumes(stored, lib, 2700)[0]).volume).toBeCloseTo(
      ring.kpis.area * 2 * 3,
      6,
    );
    expect(polygonArea3d(must(blast.excavations?.[0]?.sections[0]))).toBeCloseTo(15 * 23, 6);
  });

  it('sin taladros subterráneos no hay cubicación subterránea', () => {
    expect(undergroundVolumes(createBlast('B', newId<'RockMass'>()), lib, 2700)).toEqual([]);
  });
});
