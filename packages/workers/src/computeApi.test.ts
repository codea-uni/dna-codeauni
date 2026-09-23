import { createEmptyProject, DEFAULT_BENCH, DEFAULT_HOLE_TEMPLATE, newId } from '@blastlab/core';
import { describe, expect, it } from 'vitest';
import { computeApi } from './computeApi';

describe('computeApi', () => {
  it('ping delega en core', () => {
    expect(computeApi.ping('hola')).toBe('pong: hola');
  });

  it('genera un patrón', () => {
    const holes = computeApi.generatePattern(
      {
        id: newId<'Pattern'>(),
        name: 'P',
        kind: 'square',
        burden: 5,
        spacing: 5,
        origin: { x: 0, y: 0 },
        rowAzimuth: 0,
        rowAdvance: 'right',
        rows: 2,
        holesPerRow: 3,
        holeTemplate: DEFAULT_HOLE_TEMPLATE,
      },
      DEFAULT_BENCH,
      7,
    );
    expect(holes.map((h) => h.label)).toEqual(['7', '8', '9', '10', '11', '12']);
  });

  it('serializa y parsea', () => {
    const project = createEmptyProject('P');
    const r = computeApi.parseProject(computeApi.serializeProject(project, { appVersion: 't' }));
    expect(r.ok).toBe(true);
  });
});
