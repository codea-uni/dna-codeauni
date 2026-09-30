import { describe, expect, it } from 'vitest';
import { inspectDxfTopography, parseDxfTopography } from './dxfTopography';
import { parseLandXml } from './landxml';
import { parsePoints } from './points';
import { parseSurpac } from './surpac';

// Fixtures armados a mano: el valor esperado es el que define el propio archivo (formato y
// geometría, no fórmulas mineras).
const bytes = (s: string) => new TextEncoder().encode(s);

describe('puntos CSV/TXT', () => {
  it('PNEZD sin encabezado: descarta el número de punto y reconoce el Norte por sus 7 cifras', () => {
    const r = parsePoints(
      bytes('1,8512345.50,345678.25,4250.1,BORDE\n2,8512350.00,345680.00,4251.0,BORDE\n'),
    );
    expect(r.hasHeader).toBe(false);
    expect(r.columns).toEqual({ north: 1, east: 2, elevation: 3 });
    expect(r.points).toEqual([345678.25, 8512345.5, 4250.1, 345680, 8512350, 4251]);
  });

  it('encabezado con nombres, separador «;» y coma decimal', () => {
    const r = parsePoints(bytes('Este;Norte;Cota\n345678,25;8512345,5;4250\n'));
    expect(r.hasHeader).toBe(true);
    expect(r.delimiter).toBe(';');
    expect(r.points).toEqual([345678.25, 8512345.5, 4250]);
  });

  it('XYZ separado por espacios, con comentarios y filas malas', () => {
    const r = parsePoints(
      bytes('# nube\n345678.0 8512345.0 4250.0\n345679.0 8512346.0 x\n345680.0 8512347.0 4251.0\n'),
    );
    expect(r.delimiter).toBe(' ');
    expect(r.points).toEqual([345678, 8512345, 4250, 345680, 8512347, 4251]);
    expect(r.warnings).toContainEqual({ code: 'points.badRows', params: { n: 1 } });
  });

  it('sin tres columnas numéricas avisa', () => {
    expect(parsePoints(bytes('a,b\n1,2\n')).warnings[0]?.code).toBe('points.noColumns');
  });
});

describe('Surpac .str/.dtm', () => {
  // Cadena 1 = cuadrado cerrado (Y, X, Z por registro), cadena 0 separa, END termina.
  const str = [
    'mina,01-ene-26,,',
    '0, 0.000, 0.000, 0.000,',
    '1, 200.0, 100.0, 10.0,',
    '1, 200.0, 110.0, 11.0,',
    '1, 210.0, 110.0, 12.0,',
    '1, 210.0, 100.0, 11.0,',
    '1, 200.0, 100.0, 10.0,',
    '0, 0.000, 0.000, 0.000,',
    '2, 205.0, 105.0, 11.5, cima',
    '0, 0.000, 0.000, 0.000, END',
  ].join('\n');

  it('.str solo: líneas con X = Este (3.er campo) e Y = Norte (2.º); cerrada si repite el inicio', () => {
    const d = parseSurpac(str);
    expect(d.lines).toHaveLength(1); // la cadena 2 tiene un solo punto: no es línea
    expect(d.lines[0]?.closed).toBe(true);
    expect(d.lines[0]?.coords.slice(0, 6)).toEqual([100, 200, 10, 110, 200, 11]);
    expect(d.points).toHaveLength(6 * 3);
  });

  it('.dtm: triángulos con índices de punto desde 1 en el orden del .str', () => {
    const dtm = [
      'mina.str,',
      '0, 0.000, 0.000, 0.000,',
      'OBJECT, 1,',
      'TRISOLATION, 1, neighbours=no,validated=true,closed=no',
      '1, 1, 2, 6,',
      '2, 2, 3, 6,',
      '3, 3, 4, 9,',
      'END',
    ].join('\n');
    const d = parseSurpac(str, dtm);
    expect(d.faces?.triangles).toEqual(Uint32Array.from([0, 1, 5, 1, 2, 5]));
    expect(d.warnings).toContainEqual({ code: 'surpac.badTriangles', params: { n: 1 } });
    // Vértice 6 = cima (Este 105, Norte 205).
    expect(Array.from(d.faces?.vertices.slice(15, 18) ?? [])).toEqual([105, 205, 11.5]);
  });
});

describe('LandXML', () => {
  const xml = (units: string, extra = '') => `<?xml version="1.0"?>
<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2" version="1.2">
  <Units>${units}</Units>
  <CoordinateSystem epsgCode="32718"/>
  <Surfaces><Surface name="Tajo">
    <Definition surfType="TIN">
      <Pnts>
        <P id="10">8512000 345000 4250</P>
        <P id="11">8512000 345010 4251</P>
        <P id="12">8512010 345010 4252</P>
        <P id="13">8512010 345000 4251</P>
      </Pnts>
      <Faces><F>10 11 12</F><F>10 12 13</F>${extra}</Faces>
    </Definition>
    <SourceData><Breaklines><Breakline><PntList3D>8512000 345000 4250 8512010 345010 4252</PntList3D></Breakline></Breaklines></SourceData>
  </Surface></Surfaces>
</LandXML>`;

  it('Pnts en orden Norte Este Cota, caras por id, líneas de quiebre y EPSG', () => {
    const d = parseLandXml(xml('<Metric linearUnit="meter"/>', '<F i="1">11 12 13</F>'));
    expect(d.epsg).toBe(32718);
    expect(Array.from(d.faces?.vertices.slice(0, 3) ?? [])).toEqual([345000, 8512000, 4250]);
    expect(Array.from(d.faces?.triangles ?? [])).toEqual([0, 1, 2, 0, 2, 3]); // la cara invisible no entra
    expect(d.lines[0]).toEqual({
      coords: [345000, 8512000, 4250, 345010, 8512010, 4252],
      role: 'breakline',
      closed: false,
    });
  });

  it('pies de agrimensura de EE. UU. a metros (1200/3937 m)', () => {
    const d = parseLandXml(xml('<Imperial linearUnit="USSurveyFoot"/>'));
    expect(d.faces?.vertices[2]).toBeCloseTo((4250 * 1200) / 3937, 9);
    expect(d.warnings).toContainEqual({ code: 'landxml.feet' });
  });

  it('un XML que no es LandXML avisa', () => {
    expect(parseLandXml('<kml/>').warnings[0]?.code).toBe('landxml.notLandXml');
  });
});

describe('DXF de topografía', () => {
  const g = (...pairs: (string | number)[]) => pairs.join('\n');
  const text = [
    g(0, 'SECTION', 2, 'ENTITIES'),
    g(
      0,
      '3DFACE',
      8,
      'SUPERFICIE',
      10,
      0,
      20,
      0,
      30,
      10,
      11,
      10,
      21,
      0,
      31,
      11,
      12,
      10,
      22,
      10,
      32,
      12,
      13,
      0,
      23,
      10,
      33,
      11,
    ),
    // Curva de nivel 2D a cota 4250 (código 38) y cresta cerrada.
    g(0, 'LWPOLYLINE', 8, 'CURVAS_NIVEL', 90, 2, 70, 0, 38, 4250, 10, 0, 20, 0, 10, 50, 20, 0),
    g(
      0,
      'LWPOLYLINE',
      8,
      'CRESTA',
      90,
      3,
      70,
      1,
      38,
      4260,
      10,
      0,
      20,
      0,
      10,
      5,
      20,
      0,
      10,
      5,
      20,
      5,
    ),
    g(0, 'POINT', 8, 'PUNTOS', 10, 3, 20, 4, 30, 4255),
    g(0, 'POINT', 8, 'PUNTOS', 10, 6, 20, 7, 30, 4256),
    g(0, 'ENDSEC', 0, 'EOF'),
  ].join('\n');

  it('sugiere roles por nombre de capa y tipo de entidad', () => {
    const roles = Object.fromEntries(inspectDxfTopography(text).map((l) => [l.name, l.suggested]));
    expect(roles).toEqual({
      CRESTA: 'crest',
      CURVAS_NIVEL: 'contour',
      PUNTOS: 'points',
      SUPERFICIE: 'tin',
    });
  });

  it('3DFACE → TIN (cuadrilátero en 2 triángulos); LWPOLYLINE con su cota; POINT → puntos', () => {
    const d = parseDxfTopography(text, {
      SUPERFICIE: 'tin',
      CURVAS_NIVEL: 'contour',
      CRESTA: 'crest',
      PUNTOS: 'points',
    });
    expect(d.faces?.triangles.length).toBe(6);
    expect(d.faces?.vertices.length).toBe(12);
    expect(d.lines[0]).toEqual({
      coords: [0, 0, 4250, 50, 0, 4250],
      role: 'contour',
      closed: false,
    });
    expect(d.lines[1]?.role).toBe('crest');
    expect(d.lines[1]?.closed).toBe(true);
    expect(d.points).toEqual([3, 4, 4255, 6, 7, 4256]);
  });

  it('una capa ignorada no aporta nada', () => {
    const d = parseDxfTopography(text, { PUNTOS: 'points' });
    expect(d.faces).toBeUndefined();
    expect(d.lines).toHaveLength(0);
    expect(d.points).toHaveLength(6);
  });
});
