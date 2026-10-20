import { readFileSync } from 'node:fs';
import {
  createEmptyProject,
  DEFAULT_BENCH,
  DEFAULT_HOLE_TEMPLATE,
  detectMapping,
  EXAMPLES,
  newId,
  parseBlockModelCsv,
} from '@cronos/core';
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

describe('computeApi: roca desde modelo geotécnico', () => {
  it('sin modelo activo no cambia nada; activo usa A y densidad por bloque', async () => {
    const example = EXAMPLES.find((e) => e.id === 'production');
    if (!example) throw new Error('sin ejemplo');
    const { project } = await example.build();
    const blast = project.blasts[0];
    if (!blast) throw new Error('sin voladura');
    // Un bloque de arenisca blanda de 10 × 10 × 40 m bajo cada taladro.
    const rows = ['XC,YC,ZC,XSIZE,YSIZE,ZSIZE,LITO,UCS,RMR,DENSITY'];
    const zc = blast.bench.floorElevation + blast.bench.height / 2;
    const cells = new Set<string>();
    for (const h of blast.holes) {
      const key = `${String(Math.floor(h.collar.x / 10))},${String(Math.floor(h.collar.y / 10))}`;
      if (cells.has(key)) continue;
      cells.add(key);
      const [i, j] = key.split(',').map(Number);
      rows.push(
        `${String((i ?? 0) * 10 + 5)},${String((j ?? 0) * 10 + 5)},${String(zc)},10,10,40,ARENISCA,40,35,2.3`,
      );
    }
    const blocks = parseBlockModelCsv(new TextEncoder().encode(rows.join('\n')));
    const mapping = detectMapping(blocks);
    const survey = {
      id: newId<'TopographySurvey'>(),
      name: 'Geotecnia',
      surveyDate: '2026-10-20',
      source: { format: 'blockmodel' as const, files: ['g.csv'] },
      bounds: { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 },
      stats: { points: 0, triangles: 0, lines: 0 },
      assets: {},
      blockModel: { ...mapping, useForRock: false },
    };
    computeApi.setRockModels([{ surveyId: survey.id, blocks }]);
    const off = { ...project, topography: [...project.topography, survey] };
    const base = computeApi.fragmentationInputs(project, blast.id);
    const baseCharge = computeApi.analyzeBlast(project, blast.id, { isochroneInterval: 0 })?.charge;
    expect(computeApi.fragmentationInputs(off, blast.id)).toEqual(base);
    expect(computeApi.analyzeBlast(off, blast.id, { isochroneInterval: 0 })?.charge.tonnage).toBe(
      baseCharge?.tonnage,
    );
    expect(computeApi.holeRocks(off, blast.id)).toBeNull();

    const on = {
      ...project,
      topography: [
        ...project.topography,
        { ...survey, blockModel: { ...mapping, useForRock: true } },
      ],
    };
    const soft = computeApi.fragmentationInputs(on, blast.id);
    expect(soft?.rockFactor).toBeLessThan(base?.rockFactor ?? 0);
    const tonnage = computeApi.analyzeBlast(on, blast.id, { isochroneInterval: 0 })?.charge.tonnage;
    // Tonelaje = volumen × 2,3 t/m³ (densidad del bloque, en float32).
    expect((tonnage ?? 0) / (baseCharge?.volume ?? 1)).toBeCloseTo(2300, 3);
    const rocks = computeApi.holeRocks(on, blast.id);
    expect(rocks?.summary.inModel).toBe(blast.holes.length);
    expect(rocks?.summary.byLithology[0]?.name).toBe('ARENISCA');
    expect(rocks?.paths.length).toBe(project.monitoringPoints?.length ?? 0);
    computeApi.setRockModels([]);
    expect(computeApi.fragmentationInputs(on, blast.id)).toEqual(base);
  });
});
