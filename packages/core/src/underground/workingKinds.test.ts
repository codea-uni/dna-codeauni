import { describe, expect, it } from 'vitest';
import type { WorkingsData } from '../topography/asset';
import {
  solidDip,
  workingDips,
  defaultWorkingKind,
  workingKindFromAxis,
  workingKindFromName,
  workingKinds,
  workingTriangleOwners,
  workingTrianglesByKind,
} from './workingKinds';
import { buildWorkings } from './workings';

const line = (...pts: [number, number, number][]) => pts.map(([x, y, z]) => ({ x, y, z }));

describe('tipo de labor', () => {
  it('por geometría: chimenea, rampa y galería', () => {
    expect(workingKindFromAxis(line([0, 0, 0], [2, 0, 30]))).toBe('raise');
    expect(workingKindFromAxis(line([0, 0, 0], [100, 0, -12]))).toBe('ramp');
    expect(workingKindFromAxis(line([0, 0, 0], [100, 0, 1]))).toBe('drift');
    expect(workingKindFromAxis(line([0, 0, 0], [100, 0, 30]))).toBe('drift');
  });

  it('por nombre (capas usuales) antes que por geometría', () => {
    expect(workingKindFromName('TJ-420')).toBe('stope');
    expect(workingKindFromName('Tajeo 3')).toBe('stope');
    expect(workingKindFromName('RAMPA_NEG')).toBe('ramp');
    expect(workingKindFromName('CH 12')).toBe('raise');
    expect(workingKindFromName('XC-5')).toBe('crosscut');
    expect(workingKindFromName('By-pass 2')).toBe('bypass');
    expect(workingKindFromName('Acceso principal')).toBe('access');
    expect(workingKindFromName('GAL 420')).toBe('drift');
    expect(workingKindFromName('CHANCADO')).toBeNull();
    expect(defaultWorkingKind('TJ 1', line([0, 0, 0], [100, 0, -12]))).toBe('stope');
  });

  it('tipos guardados mandan; cada triángulo va a su labor', () => {
    const w: WorkingsData = buildWorkings(
      {
        solids: [],
        axes: [
          { name: 'GAL 1', points: line([0, 0, 0], [50, 0, 0]) },
          { name: 'RP 2', points: line([0, 50, 0], [50, 50, -5]) },
        ],
        warnings: [],
      },
      { profile: { kind: 'rectangular', width: 4, height: 4 } },
    );
    expect(workingKinds(w)).toEqual(['drift', 'ramp']);
    expect(workingKinds(w, ['stope'])).toEqual(['stope', 'ramp']);
    const owners = workingTriangleOwners(w);
    const half = owners.length / 2;
    expect(owners[0]).toBe(0);
    expect(owners[owners.length - 1]).toBe(1);
    expect(owners.filter((o) => o === 0).length).toBe(half);
    const byKind = workingTrianglesByKind(w, ['stope', 'ramp'], owners);
    expect(byKind.get('stope')?.length).toBe(half * 3);
    expect(byKind.get('ramp')?.length).toBe(half * 3);
  });
});

describe('buzamiento de los tajeos', () => {
  // Tajeo de la mina modelo: base x 120–142 a z 1895, techo corrido 14 m al oeste a z 1925.
  const v = [
    [120, -100, 1895],
    [142, -100, 1895],
    [142, -75, 1895],
    [120, -75, 1895],
    [106, -100, 1925],
    [128, -100, 1925],
    [128, -75, 1925],
    [106, -75, 1925],
  ].flat();
  const faces = [
    [0, 3, 2, 1],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
  ];
  const tris = faces.flatMap((f) => [f[0], f[1], f[2], f[0], f[2], f[3]] as number[]);

  it('paralelepípedo inclinado: 65° y baja hacia el Este', () => {
    const d = solidDip(v, tris);
    expect(d).not.toBeNull();
    expect(((d?.dip ?? 0) * 180) / Math.PI).toBeCloseTo((Math.atan2(30, 14) * 180) / Math.PI, 6);
    expect(((d?.dipAzimuth ?? 0) * 180) / Math.PI).toBeCloseTo(90, 6);
  });

  it('caja vertical → 90°; los ejes generados no tienen buzamiento', () => {
    const box = v.map((c, i) => (i % 3 === 0 && i >= 12 ? c + 14 : c));
    expect(((solidDip(box, tris)?.dip ?? 0) * 180) / Math.PI).toBeCloseTo(90, 6);
    const w = buildWorkings(
      {
        axes: [{ name: 'EJE', points: line([0, 0, 0], [50, 0, 0]) }],
        solids: [{ name: 'TAJEO', vertices: v, triangles: tris }],
        warnings: [],
      },
      { profile: { kind: 'arched', width: 4, height: 4 } },
    );
    const dips = workingDips(w);
    expect(dips[0]).toBeNull();
    expect(((dips[1]?.dip ?? 0) * 180) / Math.PI).toBeCloseTo(65.0, 0);
  });
});
