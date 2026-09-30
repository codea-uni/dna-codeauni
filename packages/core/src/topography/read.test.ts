import { describe, expect, it } from 'vitest';
import { detectTopoFormat, inspectTopography, readTopography, worldFileFor } from './read';

const file = (name: string, text: string) => ({ name, bytes: new TextEncoder().encode(text) });

describe('lectura por formato', () => {
  it('reconoce el formato por extensión', () => {
    expect(detectTopoFormat('Tajo.DXF')).toBe('dxf');
    expect(detectTopoFormat('tajo.dtm')).toBe('surpac');
    expect(detectTopoFormat('sup.xml')).toBe('landxml');
    expect(detectTopoFormat('nube.xyz')).toBe('points');
    expect(detectTopoFormat('plano.dwg')).toBeUndefined();
  });

  it('el conjunto toma el formato del primer archivo reconocido y rechaza el resto', () => {
    const r = inspectTopography([
      file('plano.dwg', ''),
      file('a.csv', 'E,N,Z\n1,2,3\n'),
      file('b.dxf', ''),
    ]);
    expect(r.format).toBe('points');
    expect(r.rejected).toEqual(['plano.dwg', 'b.dxf']);
    expect(r.points?.hasHeader).toBe(true);
  });

  it('ráster y nubes: la imagen se lleva su archivo de mundo', () => {
    expect(detectTopoFormat('dem.tif')).toBe('geotiff');
    expect(detectTopoFormat('nube.LAZ')).toBe('las');
    const files = [file('orto.jpg', ''), file('orto.jgw', ''), file('otra.csv', '')];
    const r = inspectTopography(files);
    expect(r.format).toBe('image');
    expect(r.rejected).toEqual(['otra.csv']);
    expect(worldFileFor(files, 'orto.jpg')?.name).toBe('orto.jgw');
    expect(
      worldFileFor([file('a.png', ''), file('b.pgw', ''), file('c.pgw', '')], 'a.png'),
    ).toBeUndefined();
  });

  it('LandXML: EPSG declarado', () => {
    expect(
      inspectTopography([file('s.xml', '<LandXML><CoordinateSystem epsgCode="24878"/></LandXML>')])
        .epsg,
    ).toBe(24878);
  });

  it('Surpac: empareja cada .str con el .dtm del mismo nombre', () => {
    const str = 'x,,,\n0,0,0,0,\n1,0,0,1,\n1,0,10,2,\n1,10,0,3,\n0,0,0,0,END\n';
    const dtm = 'x.str\n0,0,0,0,\nOBJECT,1,\nTRISOLATION,1,\n1,1,2,3,\nEND\n';
    const d = readTopography([file('TAJO.dtm', dtm), file('tajo.str', str)], 'surpac');
    expect(Array.from(d.faces?.triangles ?? [])).toEqual([0, 1, 2]);
  });

  it('varios CSV se unen', () => {
    const d = readTopography(
      [file('a.csv', '1 2 3\n4 5 6\n'), file('b.txt', '7 8 9\n10 11 12\n'), file('c.dxf', '')],
      'points',
      {
        pointColumns: { east: 0, north: 1, elevation: 2 },
      },
    );
    expect(d.points).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});
