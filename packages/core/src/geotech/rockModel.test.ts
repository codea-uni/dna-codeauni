import { describe, expect, it } from 'vitest';
import {
  createDefaultRockMass,
  createHole,
  DEFAULT_BENCH,
  DEFAULT_HOLE_TEMPLATE,
} from '../model/factories';
import { parseBlockModelCsv } from '../topography/blockModel';
import { rockFactor } from '../fragmentation/fragmentation';
import { rmrFromQ, rockMassModulus, vpFromQ, vpFromModulus } from './derive';
import { matchLithology } from './lithology';
import { detectMapping } from './mapping';
import {
  applyHoleDensities,
  buildGeotechModel,
  colorBlocksByCompetence,
  rockAlongPath,
  rockAt,
  rockForHoles,
  summarizeHoleRocks,
  weightedRockFactor,
  type RockProvider,
} from './rockModel';

const enc = (s: string) => new TextEncoder().encode(s);
const DEG = 59;
const A = (DEG * Math.PI) / 180;
const X0 = 617000;
const Y0 = 7759000;
/** Punto (u, v) del marco del modelo girado 59° a coordenadas del mundo. */
const world = (u: number, v: number) => ({
  x: X0 + u * Math.cos(A) - v * Math.sin(A),
  y: Y0 + u * Math.sin(A) + v * Math.cos(A),
});

/** 2×2 bloques de 10 m girados 59°: i = 0 andesita dura, i = 1 arenisca blanda. */
function geotechCsv(): string {
  const rows = ['_ROTANGLE1,_ROTAXIS1,LITO,UCS,RMR,DENSITY,CU,_XC,_YC,_ZC,_XSIZE,_YSIZE,_ZSIZE'];
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      const p = world(i * 10, j * 10);
      rows.push(
        [
          DEG,
          3,
          i === 0 ? 'ANDESITA' : 'ARENISCA',
          i === 0 ? 150 : 40,
          i === 0 ? 70 : 35,
          i === 0 ? 2.7 : 2.3,
          0.5,
          p.x,
          p.y,
          100,
          10,
          10,
          10,
        ].join(','),
      );
    }
  return rows.join('\n');
}

function provider(csv = geotechCsv()): RockProvider {
  const blocks = parseBlockModelCsv(enc(csv));
  const mapping = detectMapping(blocks);
  const base = createDefaultRockMass();
  return { models: [buildGeotechModel('s1', blocks, mapping, base)], base };
}

describe('correlaciones geotécnicas', () => {
  it('Bieniawski, Hoek–Diederichs, Barton y Vp elástica', () => {
    expect(rmrFromQ(1)).toBeCloseTo(44, 6);
    // GSI 60, D 0: Em = Ei·(0,02 + 1/(1+e⁰)) = 0,52·Ei.
    expect(rockMassModulus(50, 60)).toBeCloseTo(26, 6);
    // Q = 10, UCS = 100 → Qc = 10 → Vp = 4,5 km/s.
    expect(vpFromQ(10, 100)).toBeCloseTo(4500, 6);
    // E = 50 GPa, ρ = 2,7 t/m³, ν = 0,25 → Vp = √(1,2·50e9/2700) ≈ 4714 m/s.
    expect(vpFromModulus(50, 2.7)).toBeCloseTo(Math.sqrt((1.2 * 50e9) / 2700), 3);
  });

  it('reconoce litologías por nombre o código', () => {
    expect(matchLithology('ANDESITA')?.name).toBe('Andesita');
    expect(matchLithology('Sandstone')?.name).toBe('Arenisca');
    expect(matchLithology('lut')?.name).toBe('Lutita');
    expect(matchLithology('ic')).toBeNull();
  });
});

describe('modelo de bloques geotécnico', () => {
  it('detecta las columnas geotécnicas y marca el modelo', () => {
    const m = detectMapping(parseBlockModelCsv(enc(geotechCsv())));
    expect(m.geotechnical).toBe(true);
    expect(m.geological).toBe(true); // trae CU
    expect(m.columns).toMatchObject({
      ucs: 'UCS',
      rmr: 'RMR',
      density: 'DENSITY',
      lithology: 'LITO',
    });
  });

  it('rockAt respeta el giro del modelo', () => {
    const p = provider();
    const hard = world(0, 10);
    const soft = world(10, 0);
    const a = rockAt(p, hard.x, hard.y, 100);
    expect(a.inModel).toBe(true);
    expect(a.lithology).toBe('ANDESITA');
    expect(a.ucs).toBeCloseTo(150e6, 0);
    expect(a.density).toBeCloseTo(2700, 3);
    const b = rockAt(p, soft.x, soft.y, 103);
    expect(b.lithology).toBe('ARENISCA');
    expect(b.rmr).toBe(35);
    // Dentro de la caja sin girar pero fuera de los bloques girados: roca del proyecto.
    const out = world(-12, 5);
    expect(rockAt(p, out.x, out.y, 100).inModel).toBe(false);
    expect(rockAt(p, hard.x, hard.y, 120).inModel).toBe(false);
    // Roca dura → más Vp, más factor de roca.
    expect(a.vp ?? 0).toBeGreaterThan(b.vp ?? 0);
    expect(a.rockFactor ?? 0).toBeGreaterThan(b.rockFactor ?? 0);
  });

  it('rockAlongPath pondera por largo y Vp por tiempo de tránsito', () => {
    const p = provider();
    const a = world(-5, 0);
    const b = world(15, 0);
    const r = rockAlongPath(p, { ...a, z: 100 }, { ...b, z: 100 }, 0.5);
    expect(r.length).toBeCloseTo(20, 6);
    expect(r.inModel).toBeCloseTo(1, 6);
    expect(r.lithologies.map((l) => l.name).sort()).toEqual(['ANDESITA', 'ARENISCA']);
    expect(r.lithologies[0]?.length).toBeCloseTo(10, 6);
    expect(r.rmr).toBeCloseTo((70 + 35) / 2, 0);
    const va = rockAt(p, a.x, a.y, 100).vp ?? 0;
    const vb = rockAt(p, b.x, b.y, 100).vp ?? 0;
    expect(r.rock.vp).toBeCloseTo(20 / (10 / va + 10 / vb), 3);
  });

  it('taladros, factor de roca ponderado, cubicación y color por competencia', () => {
    const p = provider();
    const holes = [world(0, 0), world(10, 10)].map((w, k) =>
      createHole({
        position: w,
        label: String(k),
        template: DEFAULT_HOLE_TEMPLATE,
        bench: { ...DEFAULT_BENCH, floorElevation: 95, height: 10 },
        collarZ: 104,
      }),
    );
    const rocks = rockForHoles({ holes }, p);
    expect(rocks.map((r) => r.lithology)).toEqual(['ANDESITA', 'ARENISCA']);
    const A1 = rocks[0]?.rockFactor ?? 0;
    const A2 = rocks[1]?.rockFactor ?? 0;
    expect(weightedRockFactor(rocks, [300, 100])).toBeCloseTo((3 * A1 + A2) / 4, 9);
    const s = summarizeHoleRocks(rocks, [300, 100]);
    expect(s.inModel).toBe(2);
    expect(s.byClass.map((c) => c.id).sort()).toEqual(['II', 'IV']);
    const charge = {
      volume: 200,
      volumePerHole: new Float64Array([100, 100]),
      tonnage: 530000,
      powderFactor: 400 / 530000,
      totalExplosive: 400,
    };
    const c = applyHoleDensities(
      charge,
      rocks.map((r) => r.density),
    );
    expect(c.tonnage).toBeCloseTo(200 * 2500, 3);
    expect(c.powderFactor * c.tonnage).toBeCloseTo(400, 6);
    const col = colorBlocksByCompetence(p.models[0]!, 'rmr');
    expect(col.legend.kind).toBe('category');
    if (col.legend.kind === 'category') expect(col.legend.items[1]?.count).toBe(2);
  });

  it('solo litología: valores de la tabla típica (editables)', () => {
    const csv = geotechCsv().replace(/,UCS,RMR,DENSITY,CU,/, ',A1,A2,A3,A4,');
    const blocks = parseBlockModelCsv(enc(csv));
    const mapping = detectMapping(blocks);
    expect(mapping.geotechnical).toBe(false);
    const base = createDefaultRockMass();
    const m = buildGeotechModel('s1', blocks, mapping, base);
    const p0 = world(0, 0);
    const r = rockAt({ models: [m], base }, p0.x, p0.y, 100);
    expect(r.ucs).toBeCloseTo(140e6, 0);
    const edited = buildGeotechModel(
      's1',
      blocks,
      { ...mapping, lithologies: [{ name: 'ANDESITA', ucs: 90 }] },
      base,
    );
    expect(rockAt({ models: [edited], base }, p0.x, p0.y, 100).ucs).toBeCloseTo(90e6, 0);
  });

  it('sin modelo: la roca del proyecto sin cambios (regresión)', () => {
    const base = createDefaultRockMass();
    const p: RockProvider = { models: [], base };
    const r = rockAt(p, 0, 0, 0);
    expect(r.inModel).toBe(false);
    expect(r.density).toBe(base.density);
    expect(r.rockFactor ?? rockFactor(r)).toBeCloseTo(rockFactor(base), 12);
    expect(weightedRockFactor([r, r], [10, 20])).toBeCloseTo(rockFactor(base), 12);
    const charge = {
      volume: 10,
      volumePerHole: new Float64Array([10]),
      tonnage: 26500,
      powderFactor: 0.001,
      totalExplosive: 26.5,
    };
    expect(applyHoleDensities(charge, [base.density]).tonnage).toBeCloseTo(26500, 9);
  });
});
