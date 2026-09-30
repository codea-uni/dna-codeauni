import { base64ToBytes, decodeAsset } from '../topography/asset';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BENCH, DEFAULT_CALC_PARAMS, createEmptyProject } from '../model/factories';
import { newId } from '../model/ids';
import type { Pattern, Project } from '../model/types';
import { generatePatternHoles } from '../patterns/pattern';
import { degToRad } from '../units/units';
import { parseProjectFile, serializeProject } from './projectFile';

function sampleProject(): Project {
  const project = createEmptyProject('Rajo Norte');
  const blast = project.blasts[0];
  if (!blast) throw new Error('sin voladura');
  const pattern: Pattern = {
    id: newId<'Pattern'>(),
    name: 'Malla 1',
    kind: 'staggered',
    burden: 6,
    spacing: 7,
    origin: { x: 345_678.123, y: 8_512_345.987 },
    rowAzimuth: degToRad(37),
    rowAdvance: 'right',
    rows: 20,
    holesPerRow: 25,
    clipBoundary: [
      { x: 345_600, y: 8_512_400 },
      { x: 345_900, y: 8_512_400 },
      { x: 345_900, y: 8_512_200 },
      { x: 345_600, y: 8_512_200 },
    ],
    holeTemplate: {
      diameter: 0.2699,
      inclination: degToRad(10),
      azimuth: degToRad(127),
      subdrill: 1.2,
    },
  };
  const holes = generatePatternHoles(pattern, DEFAULT_BENCH, { startNumber: 1 });
  const first = holes[0];
  if (first) {
    first.decks = [
      { id: newId<'Deck'>(), kind: 'explosive', explosiveId: newId<'Explosive'>(), length: 9.5 },
      { id: newId<'Deck'>(), kind: 'stemming', materialId: newId<'StemmingMaterial'>(), length: 5 },
    ];
    first.tags = ['borde'];
  }
  return {
    ...project,
    blasts: [
      {
        ...blast,
        patterns: [pattern],
        holes,
        boundaries: [
          {
            id: newId<'Boundary'>(),
            name: 'P1',
            polygon: pattern.clipBoundary ?? [],
            freeFaceEdges: [0],
          },
        ],
      },
    ],
  };
}

describe('archivo de proyecto', () => {
  it('ida y vuelta sin pérdidas (incluye coordenadas UTM en float64)', () => {
    const project = sampleProject();
    const now = new Date('2026-09-23T12:00:00Z');
    const text = serializeProject(project, { appVersion: '0.1.0', now });
    const parsed = parseProjectFile(text);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.file.project).toEqual({ ...project, updatedAt: now.toISOString() });
    expect(parsed.file.schemaVersion).toBe(14);
    expect(parsed.file.format).toBe('cronos-project');
  });

  it('abre archivos guardados como BlastLab (format "blastlab-project", D-09)', () => {
    const project = sampleProject();
    const legacy = { ...(JSON.parse(serializeProject(project, { appVersion: 'x' })) as object) };
    const r = parseProjectFile(JSON.stringify({ ...legacy, format: 'blastlab-project' }));
    if (!r.ok) throw new Error(r.error);
    expect(r.file.format).toBe('cronos-project');
    expect(r.file.project.id).toBe(project.id);
    expect(parseProjectFile(JSON.stringify({ ...legacy, format: 'otro' })).ok).toBe(false);
  });

  it('rechaza JSON inválido, proyectos mal formados y esquemas futuros', () => {
    expect(parseProjectFile('{nope').ok).toBe(false);
    expect(parseProjectFile('[]').ok).toBe(false);

    const text = serializeProject(sampleProject(), { appVersion: 'x' });
    const broken = JSON.parse(text) as { project: { blasts: { holes: { diameter: number }[] }[] } };
    const hole = broken.project.blasts[0]?.holes[0];
    if (hole) hole.diameter = -1;
    const r = parseProjectFile(JSON.stringify(broken));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('diameter');

    const future = { ...(JSON.parse(text) as object), schemaVersion: 99 };
    const f = parseProjectFile(JSON.stringify(future));
    expect(f.ok).toBe(false);
    if (!f.ok) expect(f.error).toContain('v99');
  });

  it('migra v1 → v2: el perímetro único pasa a la lista de perímetros', () => {
    const project = sampleProject();
    const v2 = JSON.parse(serializeProject(project, { appVersion: 'x' })) as {
      schemaVersion: number;
      project: { blasts: Record<string, unknown>[] };
    };
    // Reconstruye un archivo v1: `boundary` en vez de `boundaries`.
    const blast = v2.project.blasts[0] ?? {};
    const polygon = (blast.boundaries as { polygon: unknown }[])[0]?.polygon;
    delete blast.boundaries;
    blast.boundary = polygon;
    const v1 = { ...v2, schemaVersion: 1 };
    const r = parseProjectFile(JSON.stringify(v1));
    if (!r.ok) throw new Error(r.error);
    const migrated = r.file.project.blasts[0]?.boundaries;
    expect(migrated).toHaveLength(1);
    expect(migrated?.[0]).toMatchObject({ name: 'Perímetro 1', polygon, freeFaceEdges: [] });
    // v1 sin perímetro → lista vacía
    delete blast.boundary;
    const r2 = parseProjectFile(JSON.stringify({ ...v2, schemaVersion: 1 }));
    expect(r2.ok && r2.file.project.blasts[0]?.boundaries).toEqual([]);
  });

  it('migra v2 → v3: grupos, parámetros de cálculo y resistencia al agua por niveles', () => {
    const v3 = JSON.parse(serializeProject(sampleProject(), { appVersion: 'x' })) as {
      project: {
        blasts: Record<string, unknown>[];
        library: { explosives: Record<string, unknown>[] };
      };
    };
    // Reconstruye un archivo v2: sin grupos ni calcParams; resistencia al agua booleana.
    for (const b of v3.project.blasts) {
      delete b.groups;
      delete b.calcParams;
    }
    const [wet, dry] = v3.project.library.explosives;
    if (!wet || !dry) throw new Error('faltan explosivos');
    for (const e of v3.project.library.explosives) delete e.waterResistance;
    wet.waterResistant = true;
    wet.minDiameter = 0.05;
    dry.waterResistant = false;
    const r = parseProjectFile(JSON.stringify({ ...v3, schemaVersion: 2 }));
    if (!r.ok) throw new Error(r.error);
    const blast = r.file.project.blasts[0];
    expect(blast?.groups).toEqual([]);
    expect(blast?.calcParams).toEqual(DEFAULT_CALC_PARAMS);
    const [w, d] = r.file.project.library.explosives;
    expect(w).toMatchObject({ waterResistance: 'high', criticalDiameter: 0.05 });
    expect(w).not.toHaveProperty('waterResistant');
    expect(w).not.toHaveProperty('minDiameter');
    expect(d?.waterResistance).toBe('none');
  });

  it('migra v3 → v4: reliefTime → reliefRate y umbrales nuevos con sus valores por defecto', () => {
    const v4 = JSON.parse(serializeProject(sampleProject(), { appVersion: 'x' })) as {
      project: { blasts: { calcParams: Record<string, unknown> }[] };
    };
    const blast = v4.project.blasts[0];
    if (!blast) throw new Error('sin voladura');
    // Un v3 intermedio: reliefTime, sin convención de sobreperforación ni umbrales nuevos.
    blast.calcParams = {
      micWindow: 0.01,
      detonationGamma: 3,
      reliefTime: 0,
      checks: { minStemmingRatio: 0.8, duplicateDistance: 0.5, neighborFactor: 1.5 },
    };
    const r = parseProjectFile(JSON.stringify({ ...v4, schemaVersion: 3 }));
    if (!r.ok) throw new Error(r.error);
    const cp = r.file.project.blasts[0]?.calcParams;
    expect(cp).toEqual({
      ...DEFAULT_CALC_PARAMS,
      micWindow: 0.01,
      checks: { ...DEFAULT_CALC_PARAMS.checks, minStemmingRatio: 0.8 },
    });
  });

  it('migra v5 → v10: parámetros nuevos de F2 con sus valores por defecto', () => {
    const v6 = JSON.parse(serializeProject(sampleProject(), { appVersion: 'x' })) as {
      project: { blasts: { calcParams: { checks: Record<string, unknown> } }[] };
    };
    const blast = v6.project.blasts[0];
    if (!blast) throw new Error('sin voladura');
    delete blast.calcParams.checks.presplitLead;
    delete blast.calcParams.checks.midEffectiveBurdenRatio;
    delete blast.calcParams.checks.uniformityRange;
    delete (blast.calcParams as Record<string, unknown>).drillDeviation;
    delete (blast.calcParams as Record<string, unknown>).sdobBands;
    delete blast.calcParams.checks.minInterRowDelay;
    delete (blast.calcParams as Record<string, unknown>).displacement;
    const r = parseProjectFile(JSON.stringify({ ...v6, schemaVersion: 5 }));
    if (!r.ok) throw new Error(r.error);
    expect(r.file.project.blasts[0]?.calcParams.checks.presplitLead).toBe(0.1);
    // v6 → v7: aviso intermedio de burden efectivo (P-16)
    expect(r.file.project.blasts[0]?.calcParams.checks.midEffectiveBurdenRatio).toBe(1.5);
    // v7 → v8: desviación de perforación y rango de n de Kuz-Ram
    expect(r.file.project.blasts[0]?.calcParams.drillDeviation).toBe(0.1);
    expect(r.file.project.blasts[0]?.calcParams.checks.uniformityRange).toEqual({
      min: 0.7,
      max: 2,
    });
    // v8 → v9: bandas de SDOB e intervalo mínimo entre filas
    expect(r.file.project.blasts[0]?.calcParams.sdobBands).toEqual([0.62, 0.92, 1.44, 1.84]);
    expect(r.file.project.blasts[0]?.calcParams.checks.minInterRowDelay).toBe(0.035);
    // v9 → v10: desplazamiento
    expect(r.file.project.blasts[0]?.calcParams.displacement.cB).toBe(0.12);
  });

  it('migra v11 → v12: los perímetros usan el piso del banco hasta tener uno propio', () => {
    const v11 = JSON.parse(serializeProject(sampleProject(), { appVersion: 'x' })) as Record<
      string,
      unknown
    >;
    const r = parseProjectFile(JSON.stringify({ ...v11, schemaVersion: 11 }));
    if (!r.ok) throw new Error(r.error);
    expect(r.file.schemaVersion).toBe(14);
    for (const b of r.file.project.blasts[0]?.boundaries ?? [])
      expect(b.floorElevation).toBeUndefined();
    // Un piso propio se conserva al guardar y abrir.
    const project = sampleProject();
    const boundary = project.blasts[0]?.boundaries[0];
    if (!boundary) throw new Error('sin perímetro');
    boundary.floorElevation = 3340;
    const back = parseProjectFile(serializeProject(project, { appVersion: 'x' }));
    if (!back.ok) throw new Error(back.error);
    expect(back.file.project.blasts[0]?.boundaries[0]?.floorElevation).toBe(3340);
  });

  it('migra v12 → v13: parámetros de la pila de material (A7) con sus valores por defecto', () => {
    const v12 = JSON.parse(serializeProject(sampleProject(), { appVersion: 'x' })) as {
      project: { blasts: { calcParams: Record<string, unknown>; domains?: unknown }[] };
    };
    const blast = v12.project.blasts[0];
    if (!blast) throw new Error('sin voladura');
    delete blast.calcParams.muckpile;
    delete blast.domains;
    const r = parseProjectFile(JSON.stringify({ ...v12, schemaVersion: 12 }));
    if (!r.ok) throw new Error(r.error);
    expect(r.file.schemaVersion).toBe(14);
    const m = r.file.project.blasts[0]?.calcParams.muckpile;
    expect(m?.velocityModel).toBe('zhang');
    expect(m?.swell).toBe(1.5);
    expect(m?.reposeAngle).toBeCloseTo((37 * Math.PI) / 180, 12);
    expect(r.file.project.blasts[0]?.domains).toBeUndefined();
    // Un campo guardado se conserva y los que falten se completan.
    blast.calcParams.muckpile = { swell: 1.25 };
    const partial = parseProjectFile(JSON.stringify({ ...v12, schemaVersion: 12 }));
    if (!partial.ok) throw new Error(partial.error);
    expect(partial.file.project.blasts[0]?.calcParams.muckpile.swell).toBe(1.25);
    expect(partial.file.project.blasts[0]?.calcParams.muckpile.blockSize).toBe(1.5);
    // Los dominios se guardan y se abren.
    const project = sampleProject();
    const b = project.blasts[0];
    if (!b) throw new Error('sin voladura');
    b.domains = [
      {
        id: 'd' as never,
        name: 'Mineral',
        material: 'Óxido',
        grade: 0.9,
        color: '#aa8800',
        polygon: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
        ],
      },
    ];
    const back = parseProjectFile(serializeProject(project, { appVersion: 'x' }));
    if (!back.ok) throw new Error(back.error);
    expect(back.file.project.blasts[0]?.domains?.[0]?.grade).toBe(0.9);
  });

  it('migra v13 → v14: cara libre propia por perímetro y lanzamiento según la cara (A7b)', () => {
    const v13 = JSON.parse(serializeProject(sampleProject(), { appVersion: 'x' })) as {
      project: { blasts: { calcParams: { muckpile: Record<string, unknown> } }[] };
    };
    const blast = v13.project.blasts[0];
    if (!blast) throw new Error('sin voladura');
    delete blast.calcParams.muckpile.launchFromFace;
    const r = parseProjectFile(JSON.stringify({ ...v13, schemaVersion: 13 }));
    if (!r.ok) throw new Error(r.error);
    expect(r.file.schemaVersion).toBe(14);
    expect(r.file.project.blasts[0]?.calcParams.muckpile.launchFromFace).toBe(true);
    for (const b of r.file.project.blasts[0]?.boundaries ?? []) expect(b.faceAngle).toBeUndefined();
    // Ángulo y alto propios se conservan al guardar y abrir.
    const project = sampleProject();
    const boundary = project.blasts[0]?.boundaries[0];
    if (!boundary) throw new Error('sin perímetro');
    boundary.faceAngle = 1.1;
    boundary.faceHeight = 12;
    const back = parseProjectFile(serializeProject(project, { appVersion: 'x' }));
    if (!back.ok) throw new Error(back.error);
    expect(back.file.project.blasts[0]?.boundaries[0]).toMatchObject({
      faceAngle: 1.1,
      faceHeight: 12,
    });
  });

  it('migra v10 → v11: la superficie en línea pasa a levantamiento con su asset embebido (D-16)', () => {
    const v11 = JSON.parse(serializeProject(sampleProject(), { appVersion: 'x' })) as {
      project: Record<string, unknown> & { blasts: { bench: Record<string, unknown> }[] };
    };
    const blast = v11.project.blasts[0];
    if (!blast) throw new Error('sin voladura');
    delete v11.project.topography;
    v11.project.surfaces = [
      {
        id: 'sup-1',
        name: 'Topografía agosto',
        kind: 'topography',
        vertices: [100, 200, 3400, 110, 200, 3401, 100, 210, 3402],
        triangles: [0, 1, 2],
      },
    ];
    blast.bench.topSurfaceId = 'sup-1';
    blast.bench.floorSurfaceId = 'sup-1';
    const r = parseProjectFile(JSON.stringify({ ...v11, schemaVersion: 10 }));
    if (!r.ok) throw new Error(r.error);
    const survey = r.file.project.topography[0];
    expect(survey).toMatchObject({
      id: 'sup-1',
      name: 'Topografía agosto',
      source: { format: 'legacy' },
      stats: { points: 3, triangles: 1, lines: 0 },
      bounds: { minX: 100, minY: 200, minZ: 3400, maxX: 110, maxY: 210, maxZ: 3402 },
    });
    expect(r.file.project.blasts[0]?.bench.topographyId).toBe('sup-1');
    expect(r.file.project.blasts[0]?.bench).not.toHaveProperty('floorSurfaceId');
    const hash = survey?.assets.tin ?? '';
    const bytes = base64ToBytes(r.file.embeddedAssets?.[hash] ?? '');
    const asset = decodeAsset(bytes);
    if (asset.kind !== 'tin') throw new Error('tipo');
    expect([...asset.tin.vertices]).toEqual([100, 200, 3400, 110, 200, 3401, 100, 210, 3402]);
    expect([...asset.tin.triangles]).toEqual([0, 1, 2]);
  });

  it('exporta y vuelve a leer los assets embebidos', () => {
    const hash = 'f'.repeat(64);
    const text = serializeProject(sampleProject(), {
      appVersion: 'x',
      embeddedAssets: { [hash]: 'AAEC' },
    });
    const r = parseProjectFile(text);
    if (!r.ok) throw new Error(r.error);
    expect(r.file.embeddedAssets).toEqual({ [hash]: 'AAEC' });
  });
});
