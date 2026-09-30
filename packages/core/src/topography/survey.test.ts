import { describe, expect, it } from 'vitest';
import { decodeAsset } from './asset';
import { buildSurvey } from './survey';

describe('buildSurvey', () => {
  it('codifica cada parte y resume límites y conteos', () => {
    const { survey, assets } = buildSurvey(
      {
        name: 'Topo sep',
        surveyDate: '2026-09-30',
        format: 'dxf',
        files: ['tajo.dxf'],
        epsg: 32719,
      },
      {
        tin: {
          vertices: new Float64Array([0, 0, 10, 10, 0, 11, 0, 10, 12, 10, 10, 9]),
          triangles: new Uint32Array([0, 1, 2, 1, 3, 2]),
        },
        lines: {
          coords: new Float64Array([-5, 2, 10, 15, 2, 10]),
          offsets: new Uint32Array([0, 2]),
          roles: new Uint8Array([1]),
          closed: new Uint8Array([0]),
        },
      },
    );
    expect(survey.stats).toEqual({ points: 4, triangles: 2, lines: 1 });
    expect(survey.bounds).toEqual({ minX: -5, minY: 0, minZ: 9, maxX: 15, maxY: 10, maxZ: 12 });
    expect(survey.epsg).toBe(32719);
    expect(assets).toHaveLength(2);
    expect(survey.assets.tin).toBe(assets[0]?.hash);
    expect(decodeAsset(assets[1]?.bytes ?? new Uint8Array()).kind).toBe('lines');
  });
});
