import { describe, expect, it } from 'vitest';
import { createBlast, createEmptyProject } from '../model/factories';
import { createDefaultLibrary } from '../model/library';
import type { Blast, Project, Vec3 } from '../model/types';
import { computeMuckpile } from '../muckpile/simulate';
import {
  designByMethod,
  METHOD_DEFAULTS,
  miningMethod,
  pickExplosiveByHint,
  type MiningMethodId,
} from './methods';
import { methodContextToWorld, methodDesignToHoles } from './methodToHoles';
import {
  computeUndergroundMuckpile,
  hasUndergroundCharges,
  UG_PATH_POINTS,
  type UndergroundMuckpileResult,
} from './muckpile';
import { planeFrame } from './transform';

function must<T>(x: T | null | undefined): T {
  if (x === null || x === undefined) throw new Error('valor ausente');
  return x;
}

const lib = createDefaultLibrary();
const detonatorId = must(lib.detonators.find((d) => d.type === 'electronic')).id;

/** Proyecto con la plantilla del método llevada al 3D (taladros, tiempos y excavaciones). */
function scene(
  id: MiningMethodId,
  frame = planeFrame({ origin: { x: 1000, y: 2000, z: 500 }, azimuth: 0.6 }),
): { project: Project; blast: Blast } {
  const explosive = must(
    pickExplosiveByHint(lib, miningMethod(id).explosive, METHOD_DEFAULTS[id].holeDiameter),
  );
  const design = designByMethod(id, {}, explosive);
  const m = miningMethod(id);
  const holes = methodDesignToHoles({
    design,
    frame,
    products: { explosive, detonatorId },
    tag: m.tag,
    holeSeparation: 0.025,
  });
  const project = createEmptyProject('UG', new Date(0), 'underground');
  project.library = lib;
  const blast = createBlast('Ronda', must(project.rockMasses[0]).id);
  blast.holes = holes;
  blast.excavations = design.context.map((c) => ({
    tag: m.tag,
    kind: c.kind,
    sections: methodContextToWorld(frame, c),
  }));
  project.blasts = [blast];
  return { project, blast };
}

function run(id: MiningMethodId, frame?: ReturnType<typeof planeFrame>): UndergroundMuckpileResult {
  const { project, blast } = scene(id, frame);
  return must(computeUndergroundMuckpile(project, blast.id));
}

/** Coordenadas del punto en el marco del túnel: s a lo largo del eje, u y v en la sección. */
function local(frame: ReturnType<typeof planeFrame>, p: Vec3) {
  const d = { x: p.x - frame.origin.x, y: p.y - frame.origin.y, z: p.z - frame.origin.z };
  const dot = (a: Vec3) => d.x * a.x + d.y * a.y + d.z * a.z;
  return { s: dot(frame.forward), u: dot(frame.right), v: dot(frame.up) };
}

describe('pila subterránea: frente de galería', () => {
  const frame = planeFrame({ origin: { x: 1000, y: 2000, z: 500 }, azimuth: 0.6 });
  const r = run('driftMechanized', frame);
  const d = must(r.underground.designs[0]);
  const { blast } = scene('driftMechanized', frame);
  const width = METHOD_DEFAULTS.driftMechanized.width;
  const height = METHOD_DEFAULTS.driftMechanized.height;

  it('casi toda la roca queda en los primeros 25 m de la galería (pocos bloques sueltos lejos)', () => {
    const dist: number[] = [];
    for (let k = 0; k < r.blocks.count; k++) {
      const p = {
        x: r.blocks.destination[3 * k] ?? 0,
        y: r.blocks.destination[3 * k + 1] ?? 0,
        z: r.blocks.destination[3 * k + 2] ?? 0,
      };
      dist.push(-local(frame, p).s);
    }
    dist.sort((a, b) => a - b);
    const p90 = dist[Math.floor(0.9 * (dist.length - 1))] ?? 0;
    expect(p90).toBeLessThan(25);
  });

  it('calcula bloques que salen del frente y forman una pila en la galería', () => {
    expect(hasUndergroundCharges(blast)).toBe(true);
    expect(d.mode).toBe('face');
    expect(r.blocks.count).toBeGreaterThan(300);
    expect(r.blocks.count).toBeLessThan(6000);
    expect(r.blocks.pathPoints).toBe(UG_PATH_POINTS);
    expect(r.blocks.path?.length).toBe(r.blocks.count * UG_PATH_POINTS * 4);
    // Alcance típico de frentes: decenas de metros, calibrable (Persson, Holmberg & Lee 1994).
    expect(d.throw).toBeGreaterThan(5);
    expect(d.throw).toBeLessThan(60);
    expect(d.maxHeight).toBeGreaterThan(0.3);
    expect(d.maxHeight).toBeLessThan(height);
    // Casi todo el material queda detrás del frente (s < avance).
    let behind = 0;
    for (let k = 0; k < r.blocks.count; k++) {
      const p = {
        x: r.blocks.destination[3 * k] ?? 0,
        y: r.blocks.destination[3 * k + 1] ?? 0,
        z: r.blocks.destination[3 * k + 2] ?? 0,
      };
      if (local(frame, p).s < 0) behind++;
    }
    expect(behind / r.blocks.count).toBeGreaterThan(0.6);
  });

  it('conserva el volumen: pila = in situ × esponjamiento', () => {
    expect(r.stats.pileVolume).toBeCloseTo(r.stats.inSituVolume * 1.5, 6);
    expect(Math.abs(r.stats.volumeError)).toBeLessThan(1e-9);
    // In situ ≈ sección × avance (0,9 del perforado).
    expect(d.inSituVolume).toBeGreaterThan(0.9 * d.sectionArea * d.advance);
    expect(d.inSituVolume).toBeLessThan(1.02 * d.sectionArea * d.advance);
  });

  it('ningún bloque sale del túnel: ni bajo el piso ni sobre el techo, ni fuera de las paredes', () => {
    const tol = 0.05;
    for (let k = 0; k < r.blocks.count; k++) {
      const pts: Vec3[] = [
        {
          x: r.blocks.destination[3 * k] ?? 0,
          y: r.blocks.destination[3 * k + 1] ?? 0,
          z: r.blocks.destination[3 * k + 2] ?? 0,
        },
      ];
      const o = {
        x: r.blocks.origin[3 * k] ?? 0,
        y: r.blocks.origin[3 * k + 1] ?? 0,
        z: r.blocks.origin[3 * k + 2] ?? 0,
      };
      for (let q = 0; q < UG_PATH_POINTS; q++) {
        const b = (k * UG_PATH_POINTS + q) * 4;
        pts.push({
          x: o.x + (r.blocks.path?.[b] ?? 0),
          y: o.y + (r.blocks.path?.[b + 1] ?? 0),
          z: o.z + (r.blocks.path?.[b + 2] ?? 0),
        });
      }
      for (const p of pts) {
        const l = local(frame, p);
        expect(l.v).toBeGreaterThanOrEqual(-tol);
        expect(l.v).toBeLessThanOrEqual(height + tol);
        expect(Math.abs(l.u)).toBeLessThanOrEqual(width / 2 + tol);
      }
    }
  });

  it('informa cuánto tapa la pila la sección y el alcance', () => {
    expect(d.blockage.length).toBeGreaterThan(0);
    expect(must(d.maxBlockage).fraction).toBeGreaterThan(0);
    expect(must(d.maxBlockage).fraction).toBeLessThanOrEqual(1);
    expect(r.stats.lastImpact).toBeGreaterThan(r.stats.firstLaunch);
  });

  it('es determinista', () => {
    const again = run('driftMechanized', frame);
    expect(again.blocks.count).toBe(r.blocks.count);
    expect(Array.from(again.blocks.destination)).toEqual(Array.from(r.blocks.destination));
    expect(again.underground.designs).toEqual(r.underground.designs);
  });

  it('la cuenta del worker es rápida (< 2 s)', () => {
    expect(r.elapsedMs).toBeLessThan(2000);
  });
});

describe('pila subterránea: rampa, tajeos y chimeneas', () => {
  it('rampa al 12 %: la pila queda sobre el piso inclinado', () => {
    const frame = planeFrame({
      origin: { x: 0, y: 0, z: 100 },
      azimuth: 1.2,
      gradient: Math.atan(-0.12),
    });
    const r = run('ramp', frame);
    const d = must(r.underground.designs[0]);
    expect(d.mode).toBe('face');
    expect(d.throw).toBeGreaterThan(3);
    for (let k = 0; k < r.blocks.count; k++) {
      const l = local(frame, {
        x: r.blocks.destination[3 * k] ?? 0,
        y: r.blocks.destination[3 * k + 1] ?? 0,
        z: r.blocks.destination[3 * k + 2] ?? 0,
      });
      expect(l.v).toBeGreaterThanOrEqual(-0.15);
      expect(l.v).toBeLessThanOrEqual(METHOD_DEFAULTS.ramp.height + 0.15);
    }
  });

  it.each<MiningMethodId>([
    'longholeFan',
    'longholeParallel',
    'slc',
    'vcr',
    'dropRaise',
    'conventionalRaise',
    'breasting',
  ])('%s: conserva el volumen y cae por gravedad', (id) => {
    const r = run(id);
    expect(r.blocks.count).toBeGreaterThan(50);
    expect(r.blocks.count).toBeLessThan(7000);
    expect(r.stats.pileVolume).toBeCloseTo(r.stats.inSituVolume * 1.5, 4);
    // El centro de masa baja (la roca cae al fondo del tajeo o sale del frente).
    let z0 = 0;
    let z1 = 0;
    let v = 0;
    for (let k = 0; k < r.blocks.count; k++) {
      const w = r.blocks.volume[k] ?? 0;
      z0 += w * (r.blocks.origin[3 * k + 2] ?? 0);
      z1 += w * (r.blocks.destination[3 * k + 2] ?? 0);
      v += w;
    }
    // En los tajeos volados enteros (taladros largos, VCR) el esponjamiento no cabe y la pila
    // llena el tajeo (voladura «ahogada»): ahí solo se pide que no pase el techo.
    if (id === 'longholeParallel' || id === 'vcr') {
      const top = Math.max(
        ...(scene(id).blast.excavations ?? []).flatMap((e) => e.sections.flat().map((p) => p.z)),
      );
      for (let k = 0; k < r.blocks.count; k++)
        expect(r.blocks.destination[3 * k + 2] ?? 0).toBeLessThanOrEqual(top);
    } else expect(z1 / v).toBeLessThan(z0 / v);
    expect(r.elapsedMs).toBeLessThan(2000);
  });
});

describe('Open Pit no cambia', () => {
  it('la pila de banco no lleva trayectoria ni marcas subterráneas', () => {
    const { project, blast } = scene('driftMechanized');
    // Sin taladros ug-* cargados no hay pila subterránea.
    expect(hasUndergroundCharges({ holes: [] })).toBe(false);
    const r = computeMuckpile(project, blast.id);
    expect(r?.blocks.path).toBeUndefined();
  });
});

describe('pila subterránea: sublevel caving (confinado contra el hundido)', () => {
  const frame = planeFrame({ origin: { x: 1000, y: 2000, z: 500 }, azimuth: 0.6 });
  const r = run('slc', frame);

  it('la roca casi no vuela: desplazamiento mediano de pocos metros (0,4–1,6 m medido)', () => {
    const d: number[] = [];
    for (let k = 0; k < r.blocks.count; k++) {
      const dx = (r.blocks.destination[3 * k] ?? 0) - (r.blocks.origin[3 * k] ?? 0);
      const dy = (r.blocks.destination[3 * k + 1] ?? 0) - (r.blocks.origin[3 * k + 1] ?? 0);
      d.push(Math.hypot(dx, dy));
    }
    d.sort((a, b) => a - b);
    expect(r.blocks.count).toBeGreaterThan(0);
    expect(d[Math.floor(0.5 * (d.length - 1))] ?? 0).toBeLessThan(3);
  });
});
