import { readFileSync } from 'node:fs';
import { createEmptyProject, DEFAULT_BENCH, DEFAULT_HOLE_TEMPLATE, newId } from '@cronos/core';
import { describe, expect, it } from 'vitest';
import { computeApi } from './computeApi';

describe('computeApi', () => {
  it('ping delega en core', () => {
    expect(computeApi.ping('hola')).toBe('pong: hola');
  });

  it('topografía: puntos → TIN, curvas e índice', async () => {
    // Pirámide de base 20 × 20 m y cima a 10 m: la curva de cota 5 existe y en la cima no hay curva.
    const csv = 'E,N,Z\n0,0,0\n20,0,0\n20,20,0\n0,20,0\n10,10,10\n';
    const files = [{ name: 'p.csv', bytes: new TextEncoder().encode(csv) }];
    expect((await computeApi.topographyInspect(files)).format).toBe('points');
    const r = await computeApi.topographyImport(files, 'points', {}, {});
    expect(r.stats).toMatchObject({ points: 5, triangles: 4 });
    const tin = r.parts.tin;
    if (!tin) throw new Error('sin TIN');
    const c = computeApi.topographyContours(tin, { interval: 5 });
    expect(Array.from(new Set(c.levels))).toContain(5);
    expect(Array.from(c.levels)).not.toContain(10); // la cima es un solo punto
    const index = computeApi.topographyIndex(tin);
    expect(index).not.toBeNull();
    expect(computeApi.topographyHillshade(tin, { maxSize: 32 })?.width).toBeGreaterThan(0);
  });

  it('topografía: nube LAZ reducida y triangulada', async () => {
    const bytes = new Uint8Array(
      readFileSync(new URL('./topography/fixtures/grilla-20x10.laz', import.meta.url)),
    );
    const files = [{ name: 'grilla.laz', bytes }];
    const info = await computeApi.topographyInspect(files);
    expect(info).toMatchObject({ format: 'las', cloud: { count: 200, compressed: true } });
    const r = await computeApi.topographyImport(files, 'las', { cloudCell: 0 }, {});
    // 199 puntos (sin el de ruido) en una grilla de 1,5 × 2 m.
    expect(r.stats.points).toBe(199);
    expect(r.warnings[0]).toEqual({ code: 'las.read', params: { read: 200, kept: 199 } });
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

  it('pila de material: cálculo, sección, exportación y comparación (A7)', async () => {
    const example = await computeApi.buildExample('muckpile');
    const project = example.project;
    const blast = project.blasts[0];
    if (!blast) throw new Error('sin voladura');
    const r = computeApi.computeMuckpile(project, blast.id, null);
    if (!r) throw new Error('sin pila');
    expect(r.stats.blocks).toBeGreaterThan(1000);
    expect(Math.abs(r.stats.volumeError)).toBeLessThan(0.02);
    const x = 345_220;
    const p = computeApi.muckpileSection(r.grids, { x, y: 8_512_390 }, { x, y: 8_512_460 });
    expect(p.throw.value).toBeGreaterThan(0);
    const stl = computeApi.muckpileExport('stl', {
      after: r.grids.after,
      origin: project.coordinateSystem.origin,
    });
    expect(stl).toBeInstanceOf(Uint8Array);
    const csv = computeApi.muckpileExport('vectors', {
      after: r.grids.after,
      blocks: r.blocks,
      blast,
      origin: project.coordinateSystem.origin,
    });
    expect(typeof csv === 'string' && csv.split('\n').length).toBeGreaterThan(r.stats.blocks);
  });
});
