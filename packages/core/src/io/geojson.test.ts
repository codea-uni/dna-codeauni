import { describe, expect, it } from 'vitest';
import { createBlast, createHole, DEFAULT_BENCH, DEFAULT_HOLE_TEMPLATE } from '../model/factories';
import { newId } from '../model/ids';
import { degToRad } from '../units/units';
import { parseCsv, type HoleCsvDefaults } from './csv';
import { exportGeoJson, importBoundariesFromCsv, importGeoJson } from './geojson';

const defaults: HoleCsvDefaults = {
  diameter: 0.2,
  subdrill: 1.5,
  bench: DEFAULT_BENCH,
  startNumber: 1,
  epsg: 32718,
};

function sampleBlast() {
  const blast = createBlast('G', newId<'RockMass'>());
  const group = {
    id: newId<'HoleGroup'>(),
    name: 'Buffer',
    kind: 'buffer' as const,
    color: '#fff',
  };
  const holes = [0, 1].map((i) => ({
    ...createHole({
      label: `BF${String(i + 1)}`,
      position: { x: 274600 + 4 * i, y: 8944820 },
      template: { ...DEFAULT_HOLE_TEMPLATE, diameter: 0.250825, inclination: degToRad(10) },
      bench: DEFAULT_BENCH,
    }),
    groupId: group.id,
  }));
  const polygon = [
    { x: 274590, y: 8944810 },
    { x: 274620, y: 8944810 },
    { x: 274620, y: 8944830 },
    { x: 274590, y: 8944830 },
  ];
  return {
    ...blast,
    holes,
    groups: [group],
    boundaries: [{ id: newId<'Boundary'>(), name: 'P1', polygon, freeFaceEdges: [0] }],
  };
}

describe('GeoJSON', () => {
  it('ida y vuelta: taladros, grupo, perímetro y cara libre', () => {
    const blast = sampleBlast();
    const text = exportGeoJson(blast, 32718);
    expect(JSON.parse(text)).toMatchObject({
      crs: { properties: { name: 'urn:ogc:def:crs:EPSG::32718' } },
    });
    const r = importGeoJson(text, { ...defaults, groups: blast.groups });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.groups).toEqual([]); // «Buffer» ya existía
    expect(r.holes).toHaveLength(2);
    const [a, b] = [blast.holes[0], r.holes[0]];
    expect(b?.label).toBe(a?.label);
    expect(b?.groupId).toBe(blast.groups[0]?.id);
    expect(b?.collar.x).toBeCloseTo(a?.collar.x ?? NaN, 4);
    expect(b?.diameter).toBeCloseTo(a?.diameter ?? NaN, 6);
    expect(b?.length).toBeCloseTo(a?.length ?? NaN, 4);
    expect(b?.inclination).toBeCloseTo(a?.inclination ?? NaN, 7);
    expect(r.boundaries).toEqual([{ polygon: blast.boundaries[0]?.polygon, freeFaceEdges: [0] }]);
  });

  it('marca la cara libre con una LineString sobre una arista del perímetro', () => {
    const text = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [274590, 8944810],
                [274620, 8944810],
                [274620, 8944830],
                [274590, 8944810],
              ],
            ],
          },
        },
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [274620, 8944830],
              [274620, 8944810],
            ],
          },
        },
      ],
    });
    expect(importGeoJson(text, defaults).boundaries[0]?.freeFaceEdges).toEqual([1]);
  });

  it('rechaza longitud/latitud y avisa si el CRS del archivo es otro', () => {
    const lonlat = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [-75.2, -9.5] },
    };
    expect(importGeoJson(JSON.stringify(lonlat), defaults).errors[0]).toContain('longitud/latitud');
    const other = {
      ...lonlat,
      geometry: { type: 'Point', coordinates: [274600, 8944820, 4254] },
      crs: { type: 'name', properties: { name: 'EPSG:32717' } },
    };
    expect(importGeoJson(JSON.stringify(other), defaults).warnings[0]?.kind).toBe('outOfCrs');
    expect(importGeoJson('{"type":"Nada"}', defaults).errors).toHaveLength(1);
  });
});

describe('perímetros desde CSV', () => {
  it('filas consecutivas con el mismo ID forman un polígono', () => {
    const t = parseCsv(
      'id;este;norte\nP1;0;0\nP1;10;0\nP1;10;10\nP2;20;0\nP2;30;0\nP2;30;10\nP2;20;0\n',
    );
    const r = importBoundariesFromCsv(t);
    expect(r.errors).toEqual([]);
    expect(r.boundaries.map((b) => b.polygon.length)).toEqual([3, 3]); // P2 cerrado: sin repetir
  });
});
