import { describe, expect, it } from 'vitest';
import { analyzeBlast } from '../analysis/analyzeBlast';
import { holeBench } from '../geometry/boundary';
import { lengthToFloor } from '../geometry/hole';
import { parseProjectFile, serializeProject } from '../io/projectFile';
import { bytesToBase64, decodeAsset } from '../topography/asset';
import { blastHolesOffBench } from '../topography/design';
import { imageSize } from '../topography/raster';
import { SurfaceIndex } from '../topography/surfaceIndex';
import { buildPitExample, buildSectorExample } from './topographyExamples';

describe.each([
  ['tajo con curvas de nivel', buildPitExample, 3370, 3325],
  ['sector con ortofoto', buildSectorExample, 3370, 3355],
] as const)('ejemplo con topografía: %s', (_name, build, floor, nextFloor) => {
  const { project, assets } = build();
  const blast = project.blasts[0];
  const survey = project.topography[0];
  if (!blast || !survey) throw new Error('ejemplo incompleto');
  const byHash = new Map(assets.map((a) => [a.hash, a.bytes]));
  const tinAsset = survey.assets.tin ? byHash.get(survey.assets.tin) : undefined;
  const tin = tinAsset ? decodeAsset(tinAsset) : undefined;
  if (tin?.kind !== 'tin') throw new Error('sin TIN');
  const ground = SurfaceIndex.build(tin.tin);

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
    expect(next?.floorElevation).toBe(nextFloor);
    expect(next?.freeFaceEdges).toEqual([]);
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
