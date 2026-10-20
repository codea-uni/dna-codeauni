import { describe, expect, it } from 'vitest';
import { parseWorkingsDxf } from '../underground/workings';
import { dxfLayerName, exportMeshesDxf } from './dxf';

describe('DXF de superficies y labores', () => {
  it('escribe 3DFACE y polilíneas 3D en coordenadas absolutas y se vuelve a leer', () => {
    const text = exportMeshesDxf([
      {
        name: 'Tajeo 3 (norte)',
        color: 1,
        meshes: [
          {
            vertices: [350000, 8600000, 3500, 350010, 8600000, 3500, 350010, 8600010, 3504],
            triangles: [0, 1, 2],
          },
        ],
        lines: [
          [
            { x: 350000, y: 8600005, z: 3500 },
            { x: 350010, y: 8600005, z: 3502 },
          ],
        ],
      },
    ]);
    expect(text).toContain('3DFACE');
    expect(text).toContain('350010');
    expect(text).toContain('8600010');
    expect(text).toContain('TAJEO_3_NORTE');
    const back = parseWorkingsDxf(text);
    expect(back.solids[0]?.triangles.length).toBe(3);
    expect(back.axes[0]?.points.length).toBe(2);
  });

  it('nombres de capa válidos', () => {
    expect(dxfLayerName('Galería 420')).toBe('GALERIA_420');
    expect(dxfLayerName('···')).toBe('CAPA');
  });
});
