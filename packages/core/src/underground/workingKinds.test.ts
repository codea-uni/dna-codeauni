import { describe, expect, it } from 'vitest';
import type { WorkingsData } from '../topography/asset';
import {
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
