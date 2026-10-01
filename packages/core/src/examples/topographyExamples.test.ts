import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeBlast } from '../analysis/analyzeBlast';
import { holeBench } from '../geometry/boundary';
import { lengthToFloor } from '../geometry/hole';
import { parseProjectFile, serializeProject } from '../io/projectFile';
import { bytesToBase64, decodeAsset } from '../topography/asset';
import { blastHolesOffBench } from '../topography/design';
import { imageSize } from '../topography/raster';
import { SurfaceIndex } from '../topography/surfaceIndex';
import type { Blast, Project, TopographySurvey } from '../model/types';
import {
  buildMineExample,
  buildPitExample,
  buildSectorExample,
  type ExampleBuild,
} from './topographyExamples';

describe.each([
  ['tajo con curvas de nivel', () => Promise.resolve(buildPitExample()), 3370, 3325],
  ['sector con ortofoto', () => Promise.resolve(buildSectorExample()), 3370, 3355],
  ['mina sobre levantamiento DXF', buildMineExample, 3450, undefined],
] as const)('ejemplo con topografía: %s', (_name, build, floor, nextFloor) => {
  let project: Project;
  let assets: ExampleBuild['assets'];
  let blast: Blast;
  let survey: TopographySurvey;
  let byHash: Map<string, Uint8Array>;
  let ground: SurfaceIndex;
  beforeAll(async () => {
    ({ project, assets } = await build());
    const b = project.blasts[0];
    const t = project.topography[0];
    if (!b || !t) throw new Error('ejemplo incompleto');
    blast = b;
    survey = t;
    byHash = new Map(assets.map((a) => [a.hash, a.bytes]));
    const tinAsset = survey.assets.tin ? byHash.get(survey.assets.tin) : undefined;
    const tin = tinAsset ? decodeAsset(tinAsset) : undefined;
    if (tin?.kind !== 'tin') throw new Error('sin TIN');
    ground = SurfaceIndex.build(tin.tin);
  });

  it('el banco usa el levantamiento y sus assets vienen con el proyecto', () => {
    expect(blast.bench.topographyId).toBe(survey.id);
    expect(survey.assets.lines && byHash.has(survey.assets.lines)).toBe(true);
    expect(survey.stats.triangles).toBeGreaterThan(1000);
  });

  it('cada boca está sobre el terreno y llega al piso de su perímetro + J', () => {
    expect(blast.holes.length).toBeGreaterThan(15);
    for (const h of blast.holes) {
      expect(h.collar.z).toBeCloseTo(ground.elevationAt(h.collar.x, h.collar.y) ?? NaN, 6);
      const f = holeBench(blast, h).floorElevation;
      expect(f).toBe(floor);
      expect(h.length).toBeCloseTo(lengthToFloor(h.collar.z, f, h.subdrill, h.inclination), 9);
    }
    expect(blastHolesOffBench(blast)).toBe(false);
  });

  it('la cara libre sale de la cresta y el próximo perímetro tiene su propio piso', () => {
    const [first, next] = blast.boundaries;
    expect(first?.freeFaceEdges.length).toBeGreaterThan(3);
    expect(first?.floorElevation).toBe(floor);
    if (nextFloor === undefined) expect(next).toBeUndefined();
    else {
      expect(next?.floorElevation).toBe(nextFloor);
      expect(next?.freeFaceEdges).toEqual([]);
    }
  });

  it('se analiza completo y se guarda y abre con la topografía embebida', () => {
    const a = analyzeBlast(project, blast.id);
    expect(a?.charge.loadedHoles).toBe(blast.holes.length);
    expect(a?.timing.notInitiated).toBe(0);
    const embeddedAssets = Object.fromEntries(assets.map((x) => [x.hash, bytesToBase64(x.bytes)]));
    const parsed = parseProjectFile(
      serializeProject(project, { appVersion: 'test', embeddedAssets }),
    );
    if (!parsed.ok) throw new Error(parsed.error);
    expect(Object.keys(parsed.file.embeddedAssets ?? {})).toHaveLength(assets.length);
  });
});

describe('ortofoto del sector', () => {
  it('PNG de 520 × 400 px a 0,5 m/px georreferenciada sobre el levantamiento', () => {
    const { project, assets } = buildSectorExample();
    const hash = project.topography[0]?.assets.image;
    const bytes = assets.find((a) => a.hash === hash)?.bytes;
    if (!bytes) throw new Error('sin ortofoto');
    const asset = decodeAsset(bytes);
    if (asset.kind !== 'image') throw new Error('no es imagen');
    expect(imageSize(asset.image.bytes)).toEqual({ mime: 'image/png', width: 520, height: 400 });
    expect(asset.image.georef).toMatchObject({ pixelSizeX: 0.5, pixelSizeY: -0.5, rotation: 0 });
  });
});

describe('mina sobre levantamiento DXF', () => {
  it('el TIN recortado del DXF llega completo y la malla sigue a la cresta', async () => {
    const { project } = await buildMineExample();
    // Conteos del recorte que imprime scripts/topo-example.js sobre «new topo.dxf».
    expect(project.topography[0]?.stats).toEqual({ points: 45396, triangles: 89873, lines: 2 });
    const blast = project.blasts[0];
    const boundary = blast?.boundaries[0];
    if (!blast || !boundary) throw new Error('sin voladura');
    // Todo el frente (los tramos de 5 m de la cresta) es cara libre; los costados y el fondo no.
    const n = boundary.polygon.length;
    expect(boundary.freeFaceEdges).toEqual(Array.from({ length: n - 3 }, (_, i) => i));
    // Filas paralelas a la cresta: la primera fila es la más cercana a ella (al Sur).
    const rows = Math.max(...blast.holes.map((h) => h.row ?? 0));
    const meanY = (r: number) => {
      const ys = blast.holes.filter((h) => h.row === r).map((h) => h.collar.y);
      return ys.reduce((a, b) => a + b, 0) / ys.length;
    };
    expect(rows + 1).toBe(7);
    expect(meanY(0)).toBeLessThan(meanY(rows));
  });
});
