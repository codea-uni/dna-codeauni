import { describe, expect, it } from 'vitest';
import { applyChargeRule } from '../charging/charge';
import {
  createEmptyProject,
  createHole,
  DEFAULT_BENCH,
  DEFAULT_HOLE_TEMPLATE,
} from '../model/factories';
import { newId } from '../model/ids';
import { polygonSignedArea } from '../geometry/polygon';
import type { Blast, Project, VibrationLaw } from '../model/types';
import { withDownholeDetonator } from '../timing/tieUp';
import {
  admissibleCharge,
  airblastAt,
  chargePerDelay,
  computeVibration,
  DEFAULT_VIBRATION_OPTIONS,
  distanceForPpv,
  lundborgRange,
  offsetHullRound,
  pascalToDb,
  ppvAt,
  ppvLimitFor,
} from './vibration';

const law: VibrationLaw = {
  id: newId<'VibrationLaw'>(),
  name: 'USBM',
  scaling: 'square-root',
  k: 1.14,
  beta: 1.6,
};

describe('leyes de atenuación', () => {
  it('PPV por distancia escalada (raíz cuadrada y cúbica) y su inversa', () => {
    // 1.14 · (100/√300)^−1.6 = 0.068961 m/s = 68.96 mm/s
    expect(ppvAt(law, 100, 300) * 1000).toBeCloseTo(68.9607, 3);
    // Raíz cúbica: SD = 100 / 300^(1/3) = 14.938 → 1.14 · 14.938^−1.6 = 0.015589 m/s
    expect(ppvAt({ ...law, scaling: 'cube-root' }, 100, 300)).toBeCloseTo(
      1.14 * Math.pow(100 / Math.cbrt(300), -1.6),
      12,
    );
    expect(distanceForPpv(law, ppvAt(law, 250, 420), 420)).toBeCloseTo(250, 9);
    expect(ppvAt(law, 100, 0)).toBe(0);
  });

  it('sobrepresión en Pa y dB', () => {
    // 185 kPa · (300 / 300^(1/3))^−1.2 = 1929.63 Pa → 20·log10(1929.63 / 20 µPa) = 159.69 dB
    const p = airblastAt({ k: 185e3, beta: 1.2 }, 300, 300);
    expect(p).toBeCloseTo(1929.633, 2);
    expect(pascalToDb(p)).toBeCloseTo(159.6889, 3);
    expect(pascalToDb(20)).toBeCloseTo(120, 9);
  });

  it('Lundborg: Ø 200 mm (7.87″) → 260 · 7.874^(2/3) = 1029 m', () => {
    const params = createEmptyProject().siteModels.flyrock;
    expect(lundborgRange(params, 0.2)).toBeCloseTo(1029.05, 1);
    expect(lundborgRange({ ...params, safetyFactor: 1.5 }, 0.2)).toBeCloseTo(1543.58, 1);
  });

  it('carga por retardo con ventana de 8 ms (sin tiempo = carga propia)', () => {
    const t = Float64Array.from([0, 0.005, 0.02, 0.025, NaN, 0.033]);
    const kg = Float64Array.from([100, 200, 300, 400, 50, 10]);
    // 0 y 5 ms juntos (300); 20↔25 (Δ5 ms) → 700; 25↔33 (Δ8 ms, no cuenta) → el de 33 ms queda solo (10)
    expect([...chargePerDelay(t, kg, 0.008)]).toEqual([300, 300, 700, 700, 50, 10]);
    // Simultáneos: [0, 8) suma los dos de 0 ms (200); el de 8 ms queda fuera y solo (100)
    const tie = Float64Array.from([0.008, 0, 0]);
    expect([...chargePerDelay(tie, new Float64Array(3).fill(100), 0.008)]).toEqual([100, 200, 200]);
  });

  it('zona de exclusión: envolvente expandida con esquinas redondeadas', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 5, y: 5 },
    ];
    const zone = offsetHullRound(square, 5, 8);
    // 100 + 4·(10·5) + círculo de r = 5 aproximado por un 32-gono (16·25·sin(2π/32) = 78.03)
    expect(Math.abs(polygonSignedArea(zone))).toBeCloseTo(100 + 200 + 78.03, 0);
    expect(offsetHullRound([{ x: 0, y: 0 }], 3).length).toBeGreaterThan(8);
  });
});

function project3Holes(): { project: Project; blast: Blast } {
  const project = createEmptyProject();
  const lib = project.library;
  const anfo = lib.explosives[0];
  const stem = lib.stemmingMaterials[0];
  const det = lib.detonators[0];
  const base = project.blasts[0];
  if (!anfo || !stem || !det || !base) throw new Error('proyecto incompleto');
  const holes = [0, 1, 2].map((i) => {
    const h = createHole({
      position: { x: i * 6, y: 0 },
      template: DEFAULT_HOLE_TEMPLATE,
      bench: DEFAULT_BENCH,
      label: String(i + 1),
    });
    const loaded = {
      ...h,
      ...applyChargeRule(
        h,
        {
          stemmingLength: 4,
          stemmingMaterialId: stem.id,
          explosiveId: anfo.id,
          primerOffsetFromToe: 0.5,
        },
        lib,
      ),
    };
    // Retardos en taladro de 0, 25 y 50 ms con un solo punto de inicio → cada taladro en su retardo.
    return { ...loaded, initiators: withDownholeDetonator(loaded, det.id, i * 0.025) };
  });
  const [h0] = holes;
  if (!h0) throw new Error('falta');
  const blast: Blast = {
    ...base,
    holes,
    initiation: {
      ...base.initiation,
      connections: [
        {
          id: newId<'Connection'>(),
          from: { kind: 'hole', holeId: h0.id },
          to: { kind: 'hole', holeId: holes[1]?.id ?? h0.id },
          connectorId: lib.surfaceConnectors[0]?.id ?? ('' as never),
          delayOverride: 0,
        },
        {
          id: newId<'Connection'>(),
          from: { kind: 'hole', holeId: h0.id },
          to: { kind: 'hole', holeId: holes[2]?.id ?? h0.id },
          connectorId: lib.surfaceConnectors[0]?.id ?? ('' as never),
          delayOverride: 0,
        },
      ],
      initiationPoints: [
        { id: newId<'InitiationPoint'>(), at: { kind: 'hole', holeId: h0.id }, time: 0 },
      ],
    },
  };
  const vib = project.siteModels.vibrationLaws[0];
  if (!vib) throw new Error('sin ley');
  return {
    project: {
      ...project,
      blasts: [blast],
      monitoringPoints: [
        { id: newId<'MonitoringPoint'>(), name: 'PC1', position: { x: 6, y: 200, z: 15 } },
      ],
    },
    blast,
  };
}

describe('vibración de una voladura', () => {
  it('punto de control: PPV del taladro que gobierna, con su carga por retardo', () => {
    const { project, blast } = project3Holes();
    const r = computeVibration(project, blast, DEFAULT_VIBRATION_OPTIONS);
    // Carga por taladro: 25.133 kg/m · 12.5 m = 314.16 kg; retardos separados → MIC = 314.16 kg
    expect(r.mic).toBeCloseTo(314.159, 2);
    const pc = r.receivers[0];
    if (!pc) throw new Error('sin receptor');
    // Taladro central: centroide de carga a (6, 0, 15 − 10.25 = 4.75); R = √(200² + 10.25²) = 200.262 m
    expect(pc.distance).toBeCloseTo(Math.hypot(200, 10.25), 3);
    expect(pc.ppv).toBeCloseTo(
      1.14 * Math.pow(Math.hypot(200, 10.25) / Math.sqrt(314.159), -1.6),
      6,
    );
    expect(pc.airblastDb).toBeCloseTo(
      pascalToDb(185e3 * Math.pow(Math.hypot(200, 10.25) / Math.cbrt(314.159), -1.2)),
      3,
    );
    expect(r.flyrock.range).toBeCloseTo(1029.05, 1);
  });

  it('taladros simultáneos suman su carga por retardo', () => {
    const { project, blast } = project3Holes();
    const holes = blast.holes.map((h) => ({
      ...h,
      initiators: h.initiators.map((i) => ({ ...i, delay: 0.5 })),
    }));
    const r = computeVibration(project, { ...blast, holes }, DEFAULT_VIBRATION_OPTIONS);
    expect(r.mic).toBeCloseTo(3 * 314.159, 1);
  });

  it('grilla: con cargas iguales coincide con el cálculo exacto en cada celda', () => {
    const { project, blast } = project3Holes();
    const r = computeVibration(project, blast, { ...DEFAULT_VIBRATION_OPTIONS, extent: 100 });
    for (const [x, y] of [
      [40, 30],
      [-20, 60],
      [6, -80],
    ] as const) {
      const i = Math.floor((x - r.originX) / r.cellSize);
      const j = Math.floor((y - r.originY) / r.cellSize);
      const cx = r.originX + (i + 0.5) * r.cellSize;
      const cy = r.originY + (j + 0.5) * r.cellSize;
      const exact = Math.max(
        ...[0, 6, 12].map(
          (hx) => 1.14 * Math.pow(Math.hypot(cx - hx, cy, 10.25) / Math.sqrt(314.159), -1.6),
        ),
      );
      expect((r.values[j * r.nx + i] ?? 0) / exact).toBeCloseTo(1, 5);
    }
    // Distancia al nivel de 2 mm/s con la MIC: √314.16 · (1.14/0.002)^(1/1.6)
    expect(r.distanceForLevel[0]).toBeCloseTo(
      Math.sqrt(314.159) * Math.pow(1.14 / 0.002, 1 / 1.6),
      3,
    );
  });
});

describe('G6: PPV en puntos de monitoreo, límites y MIC admisible', () => {
  // docs/theory/04, ejemplo a mano de CR-06: K = 1140 mm/s (1,14 m/s), β = 1,6, Q = 100 kg
  const cr06: VibrationLaw = { ...law, k: 1.14, beta: 1.6 };

  it('CR-06: 200 m → 9,4462 mm/s y 300 m → 4,9375 mm/s (±1 %)', () => {
    expect((ppvAt(cr06, 200, 100) * 1000) / 9.4462).toBeCloseTo(1, 2);
    expect((ppvAt(cr06, 300, 100) * 1000) / 4.9375).toBeCloseTo(1, 2);
  });

  it('H-603: la MIC admisible invierte la ley (9,4462 mm/s a 200 m → 100 kg)', () => {
    expect(admissibleCharge(cr06, 200, 0.0094462)).toBeCloseTo(100, 2);
    expect(
      admissibleCharge(
        { ...cr06, scaling: 'cube-root' },
        200,
        ppvAt({ ...cr06, scaling: 'cube-root' }, 200, 100),
      ),
    ).toBeCloseTo(100, 6);
  });

  it('límite por punto o por tabla (estructura y distancia, P-12)', () => {
    const limits = [
      { from: 0, to: 90, ppvMax: 0.032, source: 'curso' },
      { from: 90, ppvMax: 0.026, source: 'curso' },
      { structure: 'vivienda', from: 0, ppvMax: 0.005, source: 'EIA' },
    ];
    expect(ppvLimitFor({}, 50, limits)).toEqual({ ppvMax: 0.032, source: 'curso' });
    expect(ppvLimitFor({}, 90, limits)?.ppvMax).toBe(0.026);
    expect(ppvLimitFor({ structure: 'vivienda' }, 500, limits)).toEqual({
      ppvMax: 0.005,
      source: 'EIA',
    });
    expect(ppvLimitFor({ ppvLimit: 0.01 }, 500, limits)?.ppvMax).toBe(0.01);
    expect(ppvLimitFor({}, 50, [])).toBeNull();
  });

  it('K y β del punto, excedencia, MIC admisible y centroide informativo (P-07)', () => {
    const { project, blast } = project3Holes();
    const base = project.monitoringPoints?.[0];
    if (!base) throw new Error('sin punto');
    const near = { ...base, id: newId<'MonitoringPoint'>(), name: 'Cerca', ppvLimit: 0.001 };
    const own = { ...base, id: newId<'MonitoringPoint'>(), name: 'Propio', k: 0.5, beta: 1.2 };
    const p = { ...project, monitoringPoints: [base, near, own] };
    const r = computeVibration(p, blast, DEFAULT_VIBRATION_OPTIONS);
    const [a, b, c] = r.receivers;
    if (!a || !b || !c) throw new Error('faltan receptores');
    // Tabla por defecto del proyecto (curso, P-12): a 200 m, 26 mm/s
    expect(a.limit?.ppvMax).toBe(0.026);
    expect(a.exceeds).toBe(a.ppv > 0.026);
    // Límite del punto de 1 mm/s: se excede; la MIC admisible devuelve ese PPV a esa distancia
    expect(b.exceeds).toBe(true);
    expect(ppvAt(b.law ?? cr06, b.distance, b.admissibleCharge ?? 0)).toBeCloseTo(0.001, 9);
    // K y β propios
    expect(c.ppv).toBeCloseTo(0.5 * Math.pow(c.distance / Math.sqrt(c.charge), -1.2), 9);
    // Cada taladro en su ventana: carga 314,16 kg; el centroide es el propio taladro
    expect(a.charge).toBeCloseTo(314.159, 2);
    expect(a.centroid?.distance).toBeCloseTo(a.distance, 6);
  });

  it('P-10: MIC con ventana ampliada por la dispersión pirotécnica (w + 2σ)', () => {
    const { project, blast } = project3Holes();
    // Nonel de la librería: σ = 7,5 ms → ventana 8 + 15 = 23 ms. Con 0, 20 y 40 ms se agrupan de a dos.
    const holes = blast.holes.map((h, i) => ({
      ...h,
      initiators: h.initiators.map((init) => ({ ...init, delay: i * 0.02 })),
    }));
    const r = computeVibration(project, { ...blast, holes }, DEFAULT_VIBRATION_OPTIONS);
    expect(r.mic).toBeCloseTo(314.159, 2);
    expect(r.micExtended?.window).toBeCloseTo(0.023, 9);
    expect(r.micExtended?.mic).toBeCloseTo(2 * 314.159, 2);
  });
});
