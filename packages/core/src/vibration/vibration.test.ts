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
  airblastAt,
  chargePerDelay,
  computeVibration,
  DEFAULT_VIBRATION_OPTIONS,
  distanceForPpv,
  lundborgRange,
  offsetHullRound,
  pascalToDb,
  ppvAt,
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
