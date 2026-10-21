import { describe, expect, it } from 'vitest';
import { holeToe } from '../geometry/hole';
import {
  createBlast,
  createDefaultRockMass,
  createEmptyProject,
  createHole,
  DEFAULT_BENCH,
} from '../model/factories';
import type { Blast, HoleTemplate } from '../model/types';
import { asDrilledHole, asDrilledProject, drillDeviationReport, surveyPath } from './asDrilled';
import {
  holesWithoutSurvey,
  holesWithSurvey,
  matchDrillSurvey,
  readBoretrakPhd,
  readDeviationCsv,
  readDrillSurvey,
} from './surveyFiles';

const DEG = Math.PI / 180;
const template: HoleTemplate = { diameter: 0.1, inclination: 0, azimuth: 0, subdrill: 1 };

/** Malla 3 × 3 de 4 m con taladros verticales de 16 m, etiquetas T01…T09. */
function grid(): Blast {
  const blast = createBlast('Prueba', createDefaultRockMass().id, {
    ...DEFAULT_BENCH,
    floorElevation: 0,
    height: 15,
  });
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      const n = r * 3 + c + 1;
      blast.holes.push(
        createHole({
          position: { x: c * 4, y: r * 4 },
          template,
          bench: blast.bench,
          label: `T${String(n).padStart(2, '0')}`,
        }),
      );
    }
  return blast;
}

/** Binario .phd mínimo: cabecera + «Hole No» + lecturas «Original». */
function phd(holes: { no: number; readings: [number, number, number][] }[]): Uint8Array {
  const records: Uint8Array[] = [];
  const rec = (label: string, a = 0, b = 0, c = 0) => {
    const r = new Uint8Array(36);
    for (let i = 0; i < 22; i++) r[i] = i < label.length ? label.charCodeAt(i) : 32;
    const v = new DataView(r.buffer);
    v.setFloat32(22, a, true);
    v.setFloat32(26, b, true);
    v.setFloat32(30, c, true);
    records.push(r);
  };
  rec('Original', 1);
  rec('Carlson Boretrak', -999);
  for (const h of holes) {
    rec(`O_  Hole No:${String(h.no)}`, -999);
    for (const [az, inc, d] of h.readings) rec('Original', az, inc, d);
  }
  const out = new Uint8Array(records.length * 36);
  records.forEach((r, i) => {
    out.set(r, i * 36);
  });
  return out;
}

describe('lectura de archivos de desviación', () => {
  it('lee el .phd de Boretrak por taladro', () => {
    const bytes = phd([
      {
        no: 1,
        readings: [
          [90, 5, 1],
          [90, 6, 2],
        ],
      },
      { no: 2, readings: [[180, 3, 1]] },
    ]);
    const holes = readBoretrakPhd(bytes);
    expect(holes.map((h) => h.name)).toEqual(['1', '2']);
    expect(holes[0]?.stations).toHaveLength(2);
    expect(holes[0]?.stations[1]?.inclination).toBeCloseTo(6 * DEG, 5);
    expect(holes[0]?.stations[1]?.azimuth).toBeCloseTo(90 * DEG, 5);
    expect(readDrillSurvey(bytes, 'deviation.phd').format).toBe('boretrak');
  });

  it('lee un CSV con inclinación o con buzamiento', () => {
    const csv = 'taladro;profundidad;rumbo;inclinacion\nT01;1;90;5\nT01;2;90;6\nT02;1;0;2\n';
    const r = readDeviationCsv(csv);
    expect(r.holes.map((h) => h.name)).toEqual(['T01', 'T02']);
    expect(r.holes[0]?.stations[1]?.inclination).toBeCloseTo(6 * DEG);
    const dip = readDeviationCsv('hole,depth,azimuth,dip\n1,1,90,-85\n');
    expect(dip.holes[0]?.stations[0]?.inclination).toBeCloseTo(5 * DEG);
    expect(readDeviationCsv('a;b\n1;2\n').warnings).toContain('columns');
  });

  it('une por etiqueta o por número final', () => {
    const blast = grid();
    const m = matchDrillSurvey(blast, [
      { name: '1', stations: [] },
      { name: 't02', stations: [] },
      { name: '99', stations: [] },
    ]);
    expect(m.pairs.map((p) => p.hole.label)).toEqual(['T01', 'T02']);
    expect(m.unmatched).toEqual(['99']);
  });
});

describe('perforación real', () => {
  it('reconstruye la trayectoria y el taladro equivalente', () => {
    const blast = grid();
    const hole = blast.holes[0];
    if (!hole) throw new Error('sin taladro');
    // Inclinado 10° al Este de punta a punta.
    const survey = Array.from({ length: 16 }, (_, i) => ({
      depth: i + 1,
      inclination: 10 * DEG,
      azimuth: 90 * DEG,
    }));
    const measured = { ...hole, actual: { survey } };
    const path = surveyPath(measured);
    const toe = path[path.length - 1];
    expect(toe?.x).toBeCloseTo(hole.collar.x + hole.length * Math.sin(10 * DEG), 6);
    const eq = asDrilledHole(measured);
    expect(eq.inclination).toBeCloseTo(10 * DEG, 6);
    expect(eq.azimuth).toBeCloseTo(90 * DEG, 6);
    // La corrección de rumbo gira el fondo.
    expect(asDrilledHole(measured, 90 * DEG).azimuth).toBeCloseTo(180 * DEG, 6);
  });

  it('informa corrimientos, parte sistemática y pares al fondo', () => {
    const blast = grid();
    // Todos se corren 1 m al Sur; T05 además 2 m al Oeste (queda cerca de T04).
    const shift = (dx: number, dy: number, L: number) => {
      const h = Math.hypot(dx, dy);
      const inc = Math.asin(h / L);
      const az = Math.atan2(dx, dy);
      return [{ depth: L, inclination: inc, azimuth: az }];
    };
    const surveyed = blast.holes.map((h) => ({
      name: h.label,
      stations: h.label === 'T05' ? shift(-2, -1, h.length) : shift(0, -1, h.length),
    }));
    const holes = holesWithSurvey(matchDrillSurvey(blast, surveyed));
    const measured = { ...blast, holes };
    const r = drillDeviationReport(measured);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.holes).toHaveLength(9);
    expect(r.maxOffset).toBeCloseTo(Math.hypot(2, 1), 1);
    expect(r.systematic.direction).toBeGreaterThan(180 * DEG);
    expect(r.close.map((p) => [p.labelA, p.labelB].sort().join('-'))).toContain('T04-T05');
    expect(r.far.length).toBeGreaterThan(0);
    expect(r.random).toBeGreaterThan(0);
    // Quitar la medición deja los taladros como estaban.
    expect(holesWithoutSurvey(measured).every((h) => h.actual === undefined)).toBe(true);
  });

  it('el proyecto para simular usa la perforación real solo si está activada', () => {
    const project = createEmptyProject();
    const blast = grid();
    const holes = blast.holes.map((h) => ({
      ...h,
      actual: { survey: [{ depth: h.length, inclination: 8 * DEG, azimuth: 0 }] },
    }));
    const off = { ...project, blasts: [{ ...blast, holes }] };
    expect(asDrilledProject(off)).toBe(off);
    const on = {
      ...off,
      blasts: [
        {
          ...blast,
          holes,
          drillSurvey: { source: 'x', importedAt: '', azimuthCorrection: 0, useInCalc: true },
        },
      ],
    };
    const sim = asDrilledProject(on);
    const h0 = sim.blasts[0]?.holes[0];
    const d0 = blast.holes[0];
    if (!h0 || !d0) throw new Error('sin taladro');
    expect(holeToe(h0).y - holeToe(d0).y).toBeCloseTo(d0.length * Math.sin(8 * DEG), 6);
    expect(sim.blasts[0]?.calcParams.drillDeviation).toBeCloseTo(d0.length * Math.sin(8 * DEG), 4);
  });
});
