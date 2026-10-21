import { describe, expect, it } from 'vitest';
import { applyChargeRule } from '../charging/charge';
import { holeToe } from '../geometry/hole';
import {
  createEmptyProject,
  createHole,
  DEFAULT_BENCH,
  DEFAULT_HOLE_TEMPLATE,
} from '../model/factories';
import { newId } from '../model/ids';
import type { Blast, Hole, MonitoringPoint, Project } from '../model/types';
import {
  DEFAULT_KIND_PPV_LIMITS,
  defaultVibrationLaw,
  distanceToSegment3,
  isUndergroundBlast,
} from './monitoring';
import { computeVibration, DEFAULT_VIBRATION_OPTIONS, ppvAt, ppvLimitFor } from './vibration';

const opts = { ...DEFAULT_VIBRATION_OPTIONS, skipGrid: true };

function point(
  name: string,
  position: MonitoringPoint['position'],
  kind?: MonitoringPoint['kind'],
): MonitoringPoint {
  return { id: newId<'MonitoringPoint'>(), name, position, ...(kind ? { kind } : {}) };
}

/** Taladro horizontal de frente (`ug-face`) hacia el norte: 3 m de carga al fondo y 1 m de taco. */
function horizontalBlast(): { project: Project; blast: Blast; hole: Hole } {
  const project = createEmptyProject();
  const lib = project.library;
  const anfo = lib.explosives[0];
  const stem = lib.stemmingMaterials[0];
  const base = project.blasts[0];
  if (!anfo || !stem || !base) throw new Error('proyecto incompleto');
  const hole: Hole = {
    id: newId<'Hole'>(),
    label: 'F-1',
    collar: { x: 100, y: 50, z: -200 },
    diameter: 0.045,
    length: 4,
    inclination: Math.PI / 2,
    azimuth: 0,
    subdrill: 0,
    decks: [
      { id: newId<'Deck'>(), kind: 'explosive', length: 3, explosiveId: anfo.id },
      { id: newId<'Deck'>(), kind: 'stemming', length: 1, materialId: stem.id },
    ],
    initiators: [],
    status: 'designed',
    tags: ['ug-face'],
  };
  const blast: Blast = { ...base, holes: [hole] };
  return { project: { ...project, blasts: [blast] }, blast, hole };
}

describe('vibración bajo tierra (puntos 3D y taladros ug-*)', () => {
  it('un alivio vacío sin tiempo no cuenta como «sin tiempo (carga individual)»', () => {
    const { project, blast, hole } = horizontalBlast();
    const relief: Hole = {
      ...hole,
      id: newId<'Hole'>(),
      label: 'A-1',
      collar: { x: 100.2, y: 50, z: -200 },
      decks: [],
      tags: ['ug-relief'],
    };
    const both: Blast = { ...blast, holes: [hole, relief] };
    const r = computeVibration({ ...project, blasts: [both] }, both, opts);
    // Solo el taladro cargado sin tiempo cuenta.
    expect(r.notInitiated).toBe(1);
  });

  it('taladro horizontal → punto en la labor: distancia 3D al segmento de carga', () => {
    const { project, blast } = horizontalBlast();
    // Carga entre y = 51 y y = 54 (fondo), a z = −200.
    const ahead = point('Frente', { x: 100, y: 60, z: -200 }, 'underground-working');
    const side = point('Hastial', { x: 103, y: 52, z: -200 }, 'underground-working');
    const above = point('Talud', { x: 100, y: 52.5, z: 0 }, 'slope');
    const r = computeVibration({ ...project, monitoringPoints: [ahead, side, above] }, blast, opts);
    expect(r.underground).toBe(true);
    const [a, s, t] = r.receivers;
    if (!a || !s || !t) throw new Error('faltan receptores');
    expect(a.distance).toBeCloseTo(6, 9);
    expect(s.distance).toBeCloseTo(3, 9);
    expect(t.distance).toBeCloseTo(200, 9);
    // PPV con la carga del taladro (sin tiempo = carga propia) y la ley genérica.
    const law = project.siteModels.vibrationLaws[0];
    if (!law) throw new Error('sin ley');
    expect(r.mic).toBeGreaterThan(0);
    expect(a.ppv).toBeCloseTo(ppvAt(law, 6, r.mic), 12);
    // La labor está del mismo lado que la voladura; el talud en superficie, no.
    expect(a.crossing).toBe(false);
    expect(t.crossing).toBe(true);
    // Límite por defecto del tipo (sin tabla).
    expect(t.limit).toEqual(DEFAULT_KIND_PPV_LIMITS.slope);
    expect(a.limit?.ppvMax).toBe(0.254);
  });

  it('voladura superficial → punto en una labor bajo el banco (distancia 3D correcta)', () => {
    const project = createEmptyProject();
    const lib = project.library;
    const anfo = lib.explosives[0];
    const stem = lib.stemmingMaterials[0];
    const base = project.blasts[0];
    if (!anfo || !stem || !base) throw new Error('proyecto incompleto');
    const h0 = createHole({
      position: { x: 0, y: 0 },
      template: DEFAULT_HOLE_TEMPLATE,
      bench: DEFAULT_BENCH,
      label: '1',
    });
    const hole = {
      ...h0,
      ...applyChargeRule(
        h0,
        {
          stemmingLength: 4,
          stemmingMaterialId: stem.id,
          explosiveId: anfo.id,
          primerOffsetFromToe: 0.5,
        },
        lib,
      ),
    };
    const blast: Blast = { ...base, holes: [hole] };
    const toe = holeToe(hole);
    const centroidZ = hole.collar.z - (4 + hole.length) / 2;
    // Labor 80 m bajo el fondo y 30 m al este.
    const at = { x: 30, y: 0, z: toe.z - 80 };
    const labor = point('Galería 3370', at, 'underground-working');
    const legacy = point('Sin tipo', at);
    const r = computeVibration(
      { ...project, blasts: [blast], monitoringPoints: [labor, legacy] },
      blast,
      opts,
    );
    expect(r.underground).toBe(false);
    const [l, g] = r.receivers;
    if (!l || !g) throw new Error('faltan receptores');
    // En la labor: al fondo de la carga (el punto más cercano de la columna).
    expect(l.distance).toBeCloseTo(Math.hypot(30, 80), 9);
    expect(l.crossing).toBe(true);
    // Sin tipo: como siempre, al centroide de la carga.
    expect(g.distance).toBeCloseTo(Math.hypot(30, centroidZ - at.z), 9);
    expect(g.crossing).toBe(false);
    expect(l.ppv).toBeGreaterThan(g.ppv);
  });

  it('puntos de la mina se suman a los del proyecto (el del proyecto gana con el mismo id)', () => {
    const { project, blast } = horizontalBlast();
    const own = point('Propio', { x: 100, y: 60, z: -200 }, 'underground-working');
    const mine = point('Comunidad', { x: 400, y: 50, z: 10 }, 'community');
    const r = computeVibration({ ...project, monitoringPoints: [own] }, blast, {
      ...opts,
      extraPoints: [mine, { ...own, name: 'Copia' }],
    });
    expect(r.receivers.map((x) => [x.name, x.shared])).toEqual([
      ['Propio', false],
      ['Comunidad', true],
    ]);
  });

  it('límites por tipo: las filas del EIA no gobiernan labores ni taludes', () => {
    const eia = [{ from: 0, ppvMax: 0.005, source: 'EIA' }];
    expect(ppvLimitFor({ kind: 'community' }, 100, eia)?.ppvMax).toBe(0.005);
    expect(ppvLimitFor({}, 100, eia)?.ppvMax).toBe(0.005);
    expect(ppvLimitFor({ kind: 'underground-working' }, 100, eia)?.ppvMax).toBe(0.254);
    const rows = [...eia, { kind: 'slope' as const, from: 0, ppvMax: 0.1, source: 'Geotecnia' }];
    expect(ppvLimitFor({ kind: 'slope' }, 100, rows)).toEqual({ ppvMax: 0.1, source: 'Geotecnia' });
    expect(ppvLimitFor({ kind: 'other' }, 100, [])).toBeNull();
    expect(ppvLimitFor({ kind: 'community' }, 100, [])?.ppvMax).toBe(0.0127);
  });

  it('ley por defecto: la subterránea para voladuras ug-*', () => {
    const { project, blast } = horizontalBlast();
    const ug = {
      id: newId<'VibrationLaw'>(),
      name: 'UG',
      scaling: 'square-root' as const,
      k: 0.5,
      beta: 1.4,
      context: 'underground' as const,
    };
    const p = {
      ...project,
      siteModels: {
        ...project.siteModels,
        vibrationLaws: [...project.siteModels.vibrationLaws, ug],
      },
    };
    expect(isUndergroundBlast(blast)).toBe(true);
    expect(defaultVibrationLaw(p, blast)?.name).toBe('UG');
    expect(defaultVibrationLaw(p, { holes: [] })?.name).toBe('Genérica (USBM)');
    expect(computeVibration(p, blast, opts).law?.name).toBe('UG');
  });

  it('distancia a segmento 3D', () => {
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 0, y: 0, z: -10 };
    expect(distanceToSegment3({ x: 3, y: 4, z: -5 }, a, b)).toBeCloseTo(5, 12);
    expect(distanceToSegment3({ x: 0, y: 0, z: -13 }, a, b)).toBeCloseTo(3, 12);
    expect(distanceToSegment3({ x: 0, y: 0, z: 2 }, a, a)).toBeCloseTo(2, 12);
  });
});

describe('criterios de daño en roca', () => {
  it('Bauer y Calder y ley no calibrada', async () => {
    const { rockDamageClass, isUncalibratedLaw } = await import('./monitoring');
    expect(rockDamageClass(0.1)).toBe('none');
    expect(rockDamageClass(0.3)).toBe('minor-slabbing');
    expect(rockDamageClass(1)).toBe('strong-cracking');
    expect(rockDamageClass(3)).toBe('breakup');
    expect(isUncalibratedLaw({})).toBe(true);
    expect(isUncalibratedLaw({ fit: { zone: '', n: 5, r2: 0.9 } })).toBe(false);
  });
});
