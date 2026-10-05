/**
 * Pila de material (A7). Los valores esperados no salen de la misma fórmula (regla de dominio 2):
 * son invariantes físicos (volumen, reposo), geometría del caso (40 × 14 × 10 m) y el sentido del
 * efecto de la secuencia. El caso es el ejemplo «Pila de material» (demostración, no es un CR).
 */
import { describe, expect, it } from 'vitest';
import { buildExample, EXAMPLE_SPECS } from '../examples/examples';
import { buildSectorExample } from '../examples/topographyExamples';
import { pointInPolygon } from '../geometry/polygon';
import type { Project } from '../model/types';
import { degToRad } from '../units/units';
import { calibrateMuckpile, compareSurface } from './compare';
import { blocksToCsv, surfaceToObj, surfaceToStl, surfaceToXyz } from './export';
import { REPOSE_TOLERANCE } from './heightmap';
import { gridSurface, sampleProfile } from './profile';
import { computeMuckpile, muckpileInput, simulateMuckpile } from './simulate';
import {
  launchAngle,
  richardsMooreStrategy,
  scaledBurdenStrategy,
  velocityStrategy,
} from './velocity';

function example(): Project {
  return buildExample(EXAMPLE_SPECS.muckpile);
}

function run(
  project: Project,
  patch: Partial<Project['blasts'][number]['calcParams']['muckpile']> = {},
) {
  const blast = project.blasts[0];
  if (!blast) throw new Error('sin voladura');
  blast.calcParams.muckpile = { ...blast.calcParams.muckpile, ...patch };
  const r = computeMuckpile(project, blast.id);
  if (!r) throw new Error('sin resultado');
  return r;
}

describe('pila de material: caso de ejemplo (banco 10 m, malla 4 × 5, 3 × 8, 25/67 ms)', () => {
  const project = example();
  const r = run(project);

  it('el caso tiene 24 taladros en 3 filas', () => {
    const holes = project.blasts[0]?.holes ?? [];
    expect(holes.length).toBe(24);
    expect(new Set(holes.map((h) => h.row)).size).toBe(3);
  });

  it('volumen in situ = área × alto (40 × 14 × 10) + cuña del talud (½·H²·cot β·L, A7b)', () => {
    // Cara a 75° y 10 m: la roca delante de la cresta, hasta el pie, es un prisma triangular.
    const wedge = 0.5 * 10 * 10 * (1 / Math.tan(degToRad(75))) * 40; // 535,9 m³
    expect(Math.abs(r.stats.wedgeVolume / wedge - 1)).toBeLessThan(0.01);
    expect(Math.abs(r.stats.inSituVolume / (5600 + wedge) - 1)).toBeLessThan(0.002);
  });

  it('conserva el volumen: pila = in situ × esponjamiento (±2 %)', () => {
    expect(Math.abs(r.stats.volumeError)).toBeLessThan(0.02);
    expect(r.stats.pileVolume).toBeCloseTo(r.stats.inSituVolume * 1.5, 0);
    const other = run(example(), { swell: 1.2 });
    expect(Math.abs(other.stats.pileVolume / (other.stats.inSituVolume * 1.2) - 1)).toBeLessThan(
      0.02,
    );
  });

  it('ninguna pendiente de la pila supera el ángulo de reposo', () => {
    expect(r.stats.maxReposeExcess).toBeLessThanOrEqual(REPOSE_TOLERANCE);
    const steep = run(example(), { reposeAngle: degToRad(30) });
    expect(steep.stats.maxReposeExcess).toBeLessThanOrEqual(REPOSE_TOLERANCE);
  });

  it('el material sale hacia la cara libre (Norte) y el techo baja en el frente', () => {
    expect(r.stats.direction.y).toBeGreaterThan(0.9);
    expect(r.stats.throw).toBeGreaterThan(0);
    // El drop medio puede ser negativo (hinchamiento con esponjamiento 1,5); en el frente baja.
    expect(r.stats.maxDrop).toBeGreaterThan(0);
    expect(r.stats.staticBlocks).toBe(0);
    expect(r.warnings).toEqual([]);
  });

  it('cambiar la secuencia cambia la dirección del desplazamiento', () => {
    // Salida desde el Oeste: cada taladro se alivia en su vecino del Oeste → el material se abre
    // hacia el Oeste. El escenario «Salida desde el Este» invierte el sentido lateral.
    const east = example();
    const scenario = east.scenarios?.[0]?.blast;
    const base = east.blasts[0];
    if (!scenario || !base) throw new Error('sin escenario');
    east.blasts = [{ ...scenario, id: base.id }];
    const fromEast = run(east);
    expect(r.stats.direction.x).toBeLessThan(0);
    expect(fromEast.stats.direction.x).toBeGreaterThan(0);
  });

  it('es determinista', () => {
    const again = run(example());
    expect(again.stats).toEqual({ ...r.stats });
    expect(Array.from(again.blocks.destination.slice(0, 300))).toEqual(
      Array.from(r.blocks.destination.slice(0, 300)),
    );
  });

  it('el material de la zona del taco sale más grueso que el de la columna (S-22)', () => {
    let top = 0;
    let topN = 0;
    let low = 0;
    let lowN = 0;
    for (let k = 0; k < r.blocks.count; k++) {
      const z = r.blocks.origin[3 * k + 2] ?? 0;
      const s = r.blocks.fragmentSize[k] ?? NaN;
      if (!Number.isFinite(s)) continue;
      if (z > 3500 + 10 - 2.5) {
        top += s;
        topN++;
      } else if (z < 3500 + 5) {
        low += s;
        lowN++;
      }
    }
    expect(topN).toBeGreaterThan(0);
    expect(top / topN).toBeGreaterThan(low / lowN);
    const total = r.sizeClasses.reduce((s, c) => s + c.fraction, 0);
    expect(total).toBeCloseTo(1, 9);
  });

  it('perfil en una sección Sur–Norte: el techo baja y la pila avanza al Norte', () => {
    const x = 345_200 + 20;
    const p = sampleProfile(r.grids, { x, y: 8_512_400 - 10 }, { x, y: 8_512_400 + 60 });
    expect(p.maxDrop.value).toBeGreaterThan(0);
    expect(p.throw.value).toBeGreaterThan(0);
    expect(p.throw.to).toBeGreaterThan(p.throw.from);
  });

  it('exporta la superficie (XYZ, OBJ, STL) y los vectores (CSV)', () => {
    const g = r.grids.after;
    const xyz = surfaceToXyz(g).trim().split('\n');
    expect(xyz.length).toBe(g.nx * g.ny + 1);
    const obj = surfaceToObj(g);
    expect(obj.split('\n').filter((l) => l.startsWith('f ')).length).toBe(
      2 * (g.nx - 1) * (g.ny - 1),
    );
    const stl = surfaceToStl(g, project.coordinateSystem.origin);
    const count = new DataView(stl.buffer).getUint32(80, true);
    expect(count).toBe(2 * (g.nx - 1) * (g.ny - 1));
    expect(stl.byteLength).toBe(84 + 50 * count);
    const csv = blocksToCsv(r.blocks, project.blasts[0] ?? { holes: [] });
    expect(csv.trim().split('\n').length).toBe(r.blocks.count + 1);
  });
});

describe('estrategias de velocidad (intercambiables)', () => {
  const project = example();
  const blast = project.blasts[0];
  const input = blast ? muckpileInput(project, blast.id) : null;

  it('Zhang es la misma velocidad de burden de A5 (FC-36)', () => {
    if (!input) throw new Error('sin entradas');
    const s = velocityStrategy({ velocityModel: 'zhang', k: 1, n: 1 }, input.displacement);
    input.blast.holes.forEach((_, i) => {
      const v = s.holeVelocity({ index: i, charge: 1, chargeLength: 1, effectiveBurden: 1 });
      const a5 = input.displacement.velocity[i] ?? NaN;
      if (Number.isFinite(a5)) expect(v).toBe(a5);
    });
  });

  it('las leyes de potencia valen k cuando la carga escalada iguala al burden', () => {
    // FC-40: Q^⅓ = B → v = k; FC-45 (Richards & Moore 2004): √m = B → V0 = k.
    expect(
      scaledBurdenStrategy(12, 1.4).holeVelocity({
        index: 0,
        charge: 64,
        chargeLength: 8,
        effectiveBurden: 4,
      }),
    ).toBeCloseTo(12, 12);
    expect(
      richardsMooreStrategy(27, 1.3).holeVelocity({
        index: 0,
        charge: 128,
        chargeLength: 8,
        effectiveBurden: 4,
      }),
    ).toBeCloseTo(27, 12);
    // Más burden, menos velocidad; sin burden efectivo (sin cara libre), no hay vuelo.
    const s = scaledBurdenStrategy(12, 1.4);
    expect(
      s.holeVelocity({ index: 0, charge: 64, chargeLength: 8, effectiveBurden: 6 }),
    ).toBeLessThan(12);
    expect(
      s.holeVelocity({ index: 0, charge: 64, chargeLength: 8, effectiveBurden: Infinity }),
    ).toBeNaN();
  });

  it('cambiar de estrategia cambia la pila sin tocar el resto del modelo', () => {
    if (!input) throw new Error('sin entradas');
    const p = input.blast.calcParams.muckpile;
    const slow = simulateMuckpile(input, { ...p, velocityModel: 'scaledBurden', k: 3, n: 1 });
    const fast = simulateMuckpile(input, { ...p, velocityModel: 'scaledBurden', k: 20, n: 1 });
    expect(fast.stats.meanDisplacement).toBeGreaterThan(slow.stats.meanDisplacement);
    expect(Math.abs(slow.stats.volumeError)).toBeLessThan(0.02);
    expect(slow.warnings.map((w) => w.id)).toContain('muckpile.powerLawR0');
  });

  it('el ángulo de lanzamiento crece del pie a la cresta', () => {
    const p = { launchAngleFloor: degToRad(10), launchAngleCrest: degToRad(30) };
    expect(launchAngle(p, 0)).toBeCloseTo(degToRad(10), 12);
    expect(launchAngle(p, 0.5)).toBeCloseTo(degToRad(20), 12);
    expect(launchAngle(p, 1.4)).toBeCloseTo(degToRad(30), 12);
  });
});

describe('dilución: dominios transportados', () => {
  it('cada bloque lleva el dominio de su posición in situ a la pila', () => {
    const project = example();
    const blast = project.blasts[0];
    if (!blast) throw new Error('sin voladura');
    const o = { x: 345_200, y: 8_512_400 };
    blast.domains = [
      {
        id: 'd1' as never,
        name: 'Mineral',
        material: 'Mineral',
        grade: 0.8,
        color: '#d4a017',
        polygon: [
          { x: o.x, y: o.y },
          { x: o.x + 20, y: o.y },
          { x: o.x + 20, y: o.y + 14 },
          { x: o.x, y: o.y + 14 },
        ],
      },
    ];
    const r = computeMuckpile(project, blast.id);
    if (!r) throw new Error('sin resultado');
    let ore = 0;
    for (let k = 0; k < r.blocks.count; k++) {
      const inside =
        (r.blocks.origin[3 * k] ?? 0) < o.x + 20 && (r.blocks.origin[3 * k + 1] ?? 0) < o.y + 14;
      expect(r.blocks.domain[k]).toBe(inside ? 0 : -1);
      if (inside) ore += r.blocks.volume[k] ?? 0;
    }
    // El dominio se asigna por el centro del bloque: el límite se resuelve al tamaño del bloque
    // (±½ columna de 1,5 m a lo largo de los 14 m del límite).
    expect(Math.abs(ore - 20 * 14 * 10)).toBeLessThanOrEqual((1.5 * 14 * 10) / 2);
    // Las columnas con material tienen un dominio dominante y su pureza está entre 0 y 1.
    const purity = Array.from(r.grids.domainPurity).filter(Number.isFinite);
    expect(purity.length).toBeGreaterThan(0);
    for (const p of purity) expect(p).toBeGreaterThan(0);
    expect(Math.min(...purity)).toBeLessThanOrEqual(1);
  });
});

describe('calibración con una superficie medida', () => {
  it('recupera k y n ocultos de una superficie sintética (búsqueda por grilla)', () => {
    const project = example();
    const blast = project.blasts[0];
    const input = blast ? muckpileInput(project, blast.id) : null;
    if (!input) throw new Error('sin entradas');
    const p = { ...input.blast.calcParams.muckpile, velocityModel: 'scaledBurden' as const };
    // «Medición» generada con parámetros que la búsqueda no conoce.
    const measured = simulateMuckpile(input, { ...p, k: 14, n: 1.2 });
    const surface = gridSurface(measured.grids.after);
    expect(compareSurface(measured.grids, surface).rmse).toBeCloseTo(0, 3);
    const cal = calibrateMuckpile(input, p, surface, {
      k: { min: 8, max: 20, steps: 7 },
      n: { min: 0.8, max: 1.6, steps: 5 },
    });
    expect(cal.best?.k).toBeCloseTo(14, 9);
    expect(cal.best?.n).toBeCloseTo(1.2, 9);
    expect(cal.best?.rmse).toBeLessThan(0.01);
    expect(cal.points.length).toBe(35);
  });
});

describe('perímetros sin taladros cargados', () => {
  it('la próxima voladura del banco de abajo no se vuela: queda como terreno intacto', () => {
    // «Banco sobre topografía (completo)»: perímetro 1 con 107 taladros en el banco 3385 y
    // «Próxima voladura · banco 3370» dibujado, sin taladros.
    const project = buildSectorExample().project;
    const blast = project.blasts[0];
    if (!blast) throw new Error('sin voladura');
    const next = blast.boundaries[1];
    if (!next) throw new Error('sin segundo perímetro');
    const r = computeMuckpile(project, blast.id);
    if (!r) throw new Error('sin resultado');
    for (let k = 0; k < r.blocks.count; k++)
      expect(
        pointInPolygon(r.blocks.origin[3 * k] ?? 0, r.blocks.origin[3 * k + 1] ?? 0, next.polygon),
      ).toBe(false);
    expect(r.warnings).toContainEqual({ id: 'muckpile.unblastedBoundaries', params: { n: 1 } });
    expect(Math.abs(r.stats.volumeError)).toBeLessThan(0.02);
    // Ejemplo completo con topografía (≈ 23 000 bloques): más que el límite por defecto.
  }, 30_000);
});

describe('cara libre configurable (A7b)', () => {
  it('una cara más tendida deja más roca bajo el talud y un lanzamiento más alto', () => {
    const steep = example();
    const flat = example();
    const b = flat.blasts[0];
    if (!b) throw new Error('sin voladura');
    b.bench = { ...b.bench, faceAngle: degToRad(60) };
    const r75 = run(steep);
    const r60 = run(flat);
    // ½·H²·cot β·L: 60° da más cuña que 75°.
    const wedge60 = 0.5 * 100 * (1 / Math.tan(degToRad(60))) * 40;
    expect(Math.abs(r60.stats.wedgeVolume / wedge60 - 1)).toBeLessThan(0.01);
    expect(r60.stats.wedgeVolume).toBeGreaterThan(r75.stats.wedgeVolume);
    // Lanzamiento medio 90° − β: con 60° sale a 30° (más alto) que con 75° (15°).
    const angle = (r: ReturnType<typeof run>) => {
      let s = 0;
      let n = 0;
      for (let k = 0; k < r.blocks.count; k++) {
        const vx = r.blocks.velocity[3 * k] ?? 0;
        const vy = r.blocks.velocity[3 * k + 1] ?? 0;
        const vz = r.blocks.velocity[3 * k + 2] ?? 0;
        if (vx === 0 && vy === 0) continue;
        s += Math.atan2(vz, Math.hypot(vx, vy));
        n++;
      }
      return s / n;
    };
    expect(angle(r60)).toBeGreaterThan(angle(r75));
  });

  it('el ángulo y el alto propios del perímetro reemplazan a los del banco', () => {
    const own = example();
    const b = own.blasts[0];
    const boundary = b?.boundaries[0];
    if (!b || !boundary) throw new Error('sin perímetro');
    boundary.faceAngle = degToRad(60);
    boundary.faceHeight = 6;
    const r = run(own);
    // Cara de 6 m a 60° desde la cresta; debajo del pie (4 m sobre el piso) sigue roca hasta el pie.
    const run6 = 6 / Math.tan(degToRad(60));
    const wedge = (0.5 * 6 * run6 + 4 * run6) * 40;
    expect(Math.abs(r.stats.wedgeVolume / wedge - 1)).toBeLessThan(0.01);
  });

  it('con la cara libre gobernando, el burden crece hacia el pie y la base sale más lenta', () => {
    const r = run(example());
    // Bloques de la primera fila (y > 10 m desde el origen): los de abajo son más lentos.
    let top = 0;
    let topN = 0;
    let low = 0;
    let lowN = 0;
    for (let k = 0; k < r.blocks.count; k++) {
      const y = (r.blocks.origin[3 * k + 1] ?? 0) - 8_512_400;
      const z = (r.blocks.origin[3 * k + 2] ?? 0) - 3500;
      if (y < 10 || y > 14) continue;
      const v = Math.hypot(r.blocks.velocity[3 * k] ?? 0, r.blocks.velocity[3 * k + 1] ?? 0);
      if (z > 5 && z < 7.5) {
        top += v;
        topN++;
      } else if (z > 1.5 && z < 4) {
        low += v;
        lowN++;
      }
    }
    expect(low / lowN).toBeLessThan(top / topN);
  });
});

describe('pila sobre el terreno (topografía del banco)', () => {
  // Terreno de prueba: plano inclinado que pasa por el techo del banco (piso 3500 + 10 m) en el
  // centroide del perímetro: z = 3510 + 0,05·(x − cx) + 0,02·(y − cy).
  const project = example();
  const blast = project.blasts[0];
  const poly = blast?.boundaries[0]?.polygon ?? [];
  const cx = poly.reduce((a, p) => a + p.x, 0) / poly.length;
  const cy = poly.reduce((a, p) => a + p.y, 0) / poly.length;
  const surface = {
    elevationAt: (x: number, y: number) => 3510 + 0.05 * (x - cx) + 0.02 * (y - cy),
  };
  if (!blast) throw new Error('sin voladura');
  const r = computeMuckpile(project, blast.id, surface);
  if (!r) throw new Error('sin resultado');

  it('el volumen in situ del perímetro es área × espesor medio del terreno (40 × 14 × 10 = 5600 m³)', () => {
    // En el rectángulo el espesor medio sobre el piso es el del centroide: 10 m.
    const footprint = r.stats.inSituVolume - r.stats.wedgeVolume;
    expect(Math.abs(footprint / 5600 - 1)).toBeLessThan(0.005);
  });

  it('la cara de arriba de cada columna toma la pendiente del terreno (0,05; 0,02) y el resto queda recto', () => {
    const b = r.blocks;
    let tilted = 0;
    for (let k = 0; k < b.count; k++) {
      const sx = b.topSlope[2 * k] ?? 0;
      const sy = b.topSlope[2 * k + 1] ?? 0;
      if (sx === 0 && sy === 0) continue;
      tilted++;
      expect(sx).toBeCloseTo(0.05, 6); // Float32
      expect(sy).toBeCloseTo(0.02, 6);
    }
    expect(tilted).toBeGreaterThan(0);
    expect(tilted).toBeLessThan(b.count);
  });

  it('sin topografía todos los bloques son cajas rectas', () => {
    const flat = run(example());
    expect(flat.blocks.topSlope.every((v) => v === 0)).toBe(true);
    expect(flat.blocks.topSlope.length).toBe(2 * flat.blocks.count);
  });
});
