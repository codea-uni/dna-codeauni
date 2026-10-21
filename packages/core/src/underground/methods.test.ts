import { describe, expect, it } from 'vitest';
import { createDefaultLibrary } from '../model/library';
import type { Explosive } from '../model/types';
import {
  designByMethod,
  langeforsMaxBurden,
  METHOD_DEFAULTS,
  MINING_METHODS,
  miningMethod,
  pickExplosiveByHint,
  practicalBurden,
  spreadPositions,
  type MethodDesign,
  type MethodHole,
  type MiningMethodId,
  type P3,
} from './methods';
import { continuousDelays, methodDesignToHoles } from './methodToHoles';
import { isUndergroundHole, RELIEF_TAG } from './toHoles';
import { planeFrame } from './transform';
import { pointInProfile } from './profiles';

/** Valor no nulo o error (evita aserciones `!`). */
function must<T>(x: T | null | undefined): T {
  if (x === null || x === undefined) throw new Error('valor ausente');
  return x;
}

const lib = createDefaultLibrary();

function explosiveFor(id: MiningMethodId): Explosive {
  return must(
    pickExplosiveByHint(lib, miningMethod(id).explosive, METHOD_DEFAULTS[id].holeDiameter),
  );
}

function design(id: MiningMethodId): MethodDesign {
  return designByMethod(id, {}, explosiveFor(id));
}

/** Distancia mínima entre dos segmentos 3D. */
function segmentDistance(a0: P3, a1: P3, b0: P3, b1: P3): number {
  const sub = (p: P3, q: P3) => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });
  const dot = (p: P3, q: P3) => p.x * q.x + p.y * q.y + p.z * q.z;
  const u = sub(a1, a0);
  const v = sub(b1, b0);
  const w = sub(a0, b0);
  const a = dot(u, u);
  const b = dot(u, v);
  const c = dot(v, v);
  const d = dot(u, w);
  const e = dot(v, w);
  // Punto más cercano de b al infinito de a, luego proyección alternada sobre los segmentos.
  const D = a * c - b * b;
  let tc = D < 1e-12 ? (c > 0 ? Math.min(1, Math.max(0, e / c)) : 0) : 0;
  let sc = 0;
  if (D >= 1e-12) tc = Math.min(1, Math.max(0, (a * e - b * d) / D));
  for (let k = 0; k < 3; k++) {
    sc = a > 0 ? Math.min(1, Math.max(0, (tc * b - d) / a)) : 0;
    tc = c > 0 ? Math.min(1, Math.max(0, (sc * b + e) / c)) : 0;
  }
  const p = { x: a0.x + sc * u.x, y: a0.y + sc * u.y, z: a0.z + sc * u.z };
  const q = { x: b0.x + tc * v.x, y: b0.y + tc * v.y, z: b0.z + tc * v.z };
  return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
}

const within = (p: P3, box: MethodDesign['envelope'], tol = 1e-6) =>
  p.x >= box.min.x - tol &&
  p.x <= box.max.x + tol &&
  p.y >= box.min.y - tol &&
  p.y <= box.max.y + tol &&
  p.z >= box.min.z - tol &&
  p.z <= box.max.z + tol;

const deckSum = (h: MethodHole) => h.decks.reduce((s, d) => s + d.length, 0);

describe('catálogo de métodos', () => {
  it('cada plantilla tiene valores por defecto, marca ug- y un explosivo de la biblioteca', () => {
    expect(MINING_METHODS.length).toBe(20);
    for (const m of MINING_METHODS) {
      expect(METHOD_DEFAULTS[m.id]).toBeDefined();
      expect(m.tag.startsWith('ug-')).toBe(true);
      expect(m.code).toMatch(/^UG-\d\d$/);
      expect(pickExplosiveByHint(lib, m.explosive)).not.toBeNull();
    }
    // Un código por plantilla (realce y shrinkage compartían UG-16).
    expect(new Set(MINING_METHODS.map((m) => m.code)).size).toBe(MINING_METHODS.length);
    // Una marca por plantilla: enviar una labor no reemplaza a otra.
    expect(new Set(MINING_METHODS.map((m) => m.tag)).size).toBe(MINING_METHODS.length);
    // Desarrollo, chimeneas y tajeo.
    const groups = new Set(MINING_METHODS.map((m) => m.group));
    expect([...groups].sort()).toEqual(['development', 'raise', 'stope']);
  });

  it('sugiere explosivos por familia y forma sin inventar productos', () => {
    expect(explosiveFor('longholeParallel').family).toBe('anfo');
    expect(explosiveFor('slc').form).toBe('bulk');
    const uppers = explosiveFor('uppers');
    expect(uppers.form).toBe('packaged');
    // El cartucho de catálogo tiene que entrar en el taladro de 38 mm.
    expect(uppers.cartridge?.diameter ?? 0).toBeLessThan(0.038);
    const vcr = explosiveFor('vcr');
    const bulkEmulsions = lib.explosives.filter(
      (e) => e.family === 'emulsion' && e.form === 'bulk',
    );
    expect(vcr.density).toBe(Math.max(...bulkEmulsions.map((e) => e.density)));
  });
});

describe('reglas de burden', () => {
  it('Langefors-Kihlström: 102 mm de ANFO, c = 0,4, f = 1, S/B = 1,25 → ≈ 3,4 m', () => {
    const B = langeforsMaxBurden({
      diameter: 0.102,
      density: 800,
      rws: 1,
      rockConstant: 0.4,
      fixation: 1,
      spacingRatio: 1.25,
    });
    // (102/33)·√(0,8·0,84/(0,45·1·1,25)) = 3,378 m
    expect(B).toBeCloseTo(3.378, 2);
    // Descuento de 0,05 m de emboquille y 1 % en 25 m.
    expect(practicalBurden(B, 25, 0.01, 0.05)).toBeCloseTo(3.078, 2);
  });

  it('para B < 1,4 m usa c̄ = c + 0,07/B', () => {
    const B = langeforsMaxBurden({
      diameter: 0.032,
      density: 800,
      rws: 1,
      rockConstant: 0.4,
      fixation: 1,
      spacingRatio: 1.25,
    });
    expect(B).toBeLessThan(1.4);
    const cbar = 0.4 + 0.07 / B;
    expect(B).toBeCloseTo((32 / 33) * Math.sqrt((0.8 * 0.84) / (cbar * 1.25)), 6);
  });

  it('reparte posiciones con separación cercana a S', () => {
    expect(spreadPositions(0, 9, 3)).toEqual([0, 3, 6, 9]);
    expect(spreadPositions(1, 1, 3)).toEqual([1]);
  });
});

describe.each(MINING_METHODS.map((m) => m.id))('plantilla %s', (id) => {
  const m = miningMethod(id);
  const r = design(id);

  it('genera taladros con carga y factor de carga positivo', () => {
    expect(r.holes.length).toBeGreaterThan(3);
    expect(r.kpis.chargedHoles).toBeGreaterThan(0);
    expect(r.kpis.totalCharge).toBeGreaterThan(0);
    expect(r.kpis.volume).toBeGreaterThan(0);
    expect(r.kpis.powderFactor).toBeGreaterThan(0);
    expect(r.warnings.filter((w) => w.code === 'noHoles')).toHaveLength(0);
  });

  it('taladros dentro de la geometría de la labor', () => {
    for (const h of r.holes) {
      expect(within(h.collar, r.envelope)).toBe(true);
      expect(within(h.toe, r.envelope)).toBe(true);
    }
  });

  it('columna coherente: decks suman el largo y la masa es q·largo cargado', () => {
    for (const h of r.holes) {
      expect(deckSum(h)).toBeLessThanOrEqual(h.length + 1e-6);
      const len = Math.hypot(h.toe.x - h.collar.x, h.toe.y - h.collar.y, h.toe.z - h.collar.z);
      // Look-out de frentes: el largo es el de la línea collar → fondo.
      expect(len).toBeCloseTo(h.length, 3);
      if (h.role === 'relief') {
        expect(h.decks).toHaveLength(0);
        expect(h.delay).toBeNull();
      } else expect(h.delay).not.toBeNull();
    }
  });

  it('sin solapes: los taladros no se cruzan ni se tocan', () => {
    const holes = r.holes;
    for (let i = 0; i < holes.length; i++)
      for (let j = i + 1; j < holes.length; j++) {
        const a = must(holes[i]);
        const b = must(holes[j]);
        const dmin = segmentDistance(a.collar, a.toe, b.collar, b.toe);
        expect(dmin).toBeGreaterThan((a.diameter + b.diameter) / 2 - 1e-6);
      }
  });

  it('se pasa a taladros del modelo con la marca de la plantilla', () => {
    const products = { explosive: explosiveFor(id) };
    const frame = planeFrame({ origin: { x: 100, y: 200, z: 300 }, azimuth: 0.7 });
    const out = methodDesignToHoles({ design: r, frame, products, tag: m.tag });
    expect(out).toHaveLength(r.holes.length);
    for (const [i, h] of out.entries()) {
      expect(isUndergroundHole(h)).toBe(true);
      expect(h.tags?.[0]).toBe(m.tag);
      const src = must(r.holes[i]);
      expect(h.length).toBeCloseTo(src.length, 6);
      expect(h.tags?.includes(RELIEF_TAG)).toBe(src.role === 'relief');
    }
  });
});

describe('geometría esperada por método', () => {
  it('frente mecanizado 4 × 4: el método sueco existente con alivios de 102 mm', () => {
    const r = design('driftMechanized');
    const face = must(r.face);
    expect(face.profile.width).toBeCloseTo(4, 6);
    expect(r.kpis.reliefHoles).toBe(2);
    // Collares en el plano del frente (y = 0), avance hacia +y.
    for (const h of r.holes) {
      expect(h.collar.y).toBe(0);
      expect(h.toe.y).toBeGreaterThan(3);
      expect(pointInProfile({ u: h.collar.x, v: h.collar.z }, face.profile.points)).toBe(true);
    }
    expect(r.kpis.advance).toBeCloseTo(0.95 * face.design.depth, 6);
  });

  it('presets de sección del desarrollo cambian la sección', () => {
    const m = miningMethod('driftMechanized');
    const preset = must(m.presets?.find((p) => p.label === '5,0 × 4,5'));
    const r = designByMethod('driftMechanized', preset.values, explosiveFor('driftMechanized'));
    expect(must(r.face).profile.width).toBeCloseTo(5, 6);
    expect(must(r.face).profile.height).toBeCloseTo(4.5, 6);
  });

  it('chimenea convencional: perforación hacia arriba dentro de la sección (2 × 2 y 1,5 × 1,5)', () => {
    for (const size of [2, 1.5]) {
      const r = designByMethod(
        'conventionalRaise',
        { width: size, height: size },
        explosiveFor('conventionalRaise'),
      );
      for (const h of r.holes) {
        expect(h.collar.z).toBe(0);
        expect(h.toe.z).toBeGreaterThan(1);
        expect(Math.abs(h.collar.x)).toBeLessThanOrEqual(size / 2);
        expect(Math.abs(h.collar.y)).toBeLessThanOrEqual(size / 2);
      }
    }
  });

  it('drop raise: alivios vacíos al centro, primera sección a 1,5·Φ y carga del primer tramo', () => {
    const r = design('dropRaise');
    const p = METHOD_DEFAULTS.dropRaise;
    const phi = p.reliefDiameter * Math.sqrt(p.reliefCount);
    const cut1 = r.holes.filter((h) => h.role === 'cut' && h.group === 1);
    expect(cut1).toHaveLength(4);
    for (const h of cut1) expect(Math.hypot(h.collar.x, h.collar.y)).toBeCloseTo(1.5 * phi, 6);
    for (const h of r.holes.filter((x) => x.role !== 'relief')) {
      // Tapón en el fondo, carga del tramo, taco.
      expect(h.decks[0]?.kind).toBe('plug');
      expect(h.decks[1]?.kind).toBe('charge');
      expect(h.decks[1]?.length).toBeCloseTo(p.liftHeight - p.bottomPlug - p.stemming, 6);
      expect(h.decks[2]).toEqual({ kind: 'stemming', length: p.stemming });
      expect(h.toe.z).toBeCloseTo(-p.height, 6);
    }
    // Un taladro por retardo, del centro hacia afuera.
    const delays = r.holes.flatMap((h) => (h.delay === null ? [] : [h.delay]));
    expect(new Set(delays).size).toBe(delays.length);
  });

  it('slot: primera sección contra la chimenea escariada a ≤ 1,5·Φ', () => {
    const r = design('slotRaise');
    const p = METHOD_DEFAULTS.slotRaise;
    const near = Math.min(
      ...r.holes.filter((h) => h.role !== 'relief').map((h) => Math.hypot(h.collar.x, h.collar.y)),
    );
    expect(near).toBeLessThanOrEqual(1.5 * p.reliefDiameter + 1e-9);
    expect(near - p.reliefDiameter / 2).toBeLessThanOrEqual(p.burden + 1e-9);
  });

  it('taladros largos paralelos: filas a B de la cara libre y espaciamiento ≈ S', () => {
    const r = design('longholeParallel');
    const p = METHOD_DEFAULTS.longholeParallel;
    const ys = [...new Set(r.holes.map((h) => Math.round(h.collar.y * 1e6) / 1e6))].sort(
      (a, b) => a - b,
    );
    expect(ys).toHaveLength(p.rows);
    ys.forEach((y, i) => {
      expect(y).toBeCloseTo((i + 1) * p.burden, 6);
    });
    const row = r.holes
      .filter((h) => h.group === 0)
      .map((h) => h.collar.x)
      .sort((a, b) => a - b);
    const gaps = row.slice(1).map((x, i) => x - must(row[i]));
    for (const g of gaps) {
      expect(g).toBeGreaterThan(0.75 * p.spacing);
      expect(g).toBeLessThan(1.25 * p.spacing);
    }
    // Verticales, del largo del subnivel, con taco ≈ 25·d.
    for (const h of r.holes) {
      expect(h.toe.z).toBeCloseTo(-p.height, 6);
      expect(h.decks[h.decks.length - 1]).toEqual({ kind: 'stemming', length: p.stemming });
    }
    expect(r.rules?.burden).toBe(p.burden);
    expect(r.warnings.map((w) => w.code)).not.toContain('burdenAboveLangefors');
    expect(r.powderFactorStatus).toBe('ok');
  });

  it('burden en 0 = automático por Langefors con descuento de desviación', () => {
    const r = designByMethod(
      'longholeParallel',
      { burden: 0, spacing: 0 },
      explosiveFor('longholeParallel'),
    );
    const rules = must(r.rules);
    expect(rules.auto).toBe(true);
    expect(rules.burden).toBeCloseTo(rules.langeforsPractical, 9);
    expect(rules.spacing).toBeCloseTo(1.25 * rules.burden, 9);
  });

  it('abanico: anillos cada B con espaciamiento de fondo S_toe y collares alternados', () => {
    const r = design('longholeFan');
    const p = METHOD_DEFAULTS.longholeFan;
    const ring = must(r.ring);
    const drilled = ring.design.holes.filter((h) => h.chargedLength > 0).length;
    expect(r.holes).toHaveLength(drilled * p.rows);
    const ys = [...new Set(r.holes.map((h) => Math.round(h.collar.y * 1e6) / 1e6))];
    expect(ys).toEqual([0, p.burden, 2 * p.burden].slice(0, p.rows));
    const first = r.holes.filter((h) => h.group === 0);
    const gaps = first
      .slice(1)
      .map((h, i) => Math.hypot(h.toe.x - must(first[i]).toe.x, h.toe.z - must(first[i]).toe.z));
    // Espaciamiento de pie ≈ S_toe (los tramos cortos pueden quedar entre S/2 y S).
    for (const g of gaps) expect(g).toBeGreaterThan(0.45 * p.toeSpacing);
    const median = must([...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]);
    expect(median).toBeGreaterThan(0.9 * p.toeSpacing);
    expect(median).toBeLessThan(1.15 * p.toeSpacing);
    for (const h of first)
      expect(pointInProfile({ u: h.toe.x, v: h.toe.z }, ring.boundary)).toBe(true);
    const types = first.map((h) => h.decks.find((d) => d.kind === 'stemming')?.length ?? 0);
    expect(new Set(types.map((x) => x.toFixed(2))).size).toBeGreaterThan(1);
  });

  it('presets de abanico de 64 a 115 mm con B ≈ 25·d', () => {
    const presets = must(miningMethod('longholeFan').presets);
    expect(presets.map((p) => p.values.holeDiameter)).toEqual([0.064, 0.076, 0.089, 0.102, 0.115]);
    for (const p of presets) {
      const d = must(p.values.holeDiameter);
      expect(must(p.values.burden) / d).toBeGreaterThan(23);
      expect(must(p.values.burden) / d).toBeLessThan(27);
    }
  });

  it('SLC: anillo ascendente inclinado (dump) sin taladros bajo 70° de la vertical', () => {
    const r = design('slc');
    for (const h of r.holes.filter((x) => x.group === 0)) {
      const up = h.toe.z - h.collar.z;
      const side = Math.abs(h.toe.x - h.collar.x);
      expect(up).toBeGreaterThan(0);
      expect(Math.atan2(side, up)).toBeLessThanOrEqual((70.5 * Math.PI) / 180);
      // Plano del anillo inclinado hacia el avance.
      expect(h.toe.y).toBeGreaterThan(h.collar.y - 1e-9);
    }
  });

  it('VCR: carga esférica de 6·d a d_o del fondo con tapón y taco', () => {
    const r = design('vcr');
    const p = METHOD_DEFAULTS.vcr;
    for (const h of r.holes) {
      const charge = must(h.decks.find((d) => d.kind === 'charge'));
      expect(charge.length).toBeCloseTo(p.chargeDiameters * p.holeDiameter, 6);
      expect(h.decks[0]).toEqual({ kind: 'plug', length: p.burialDepth - charge.length / 2 });
      expect(h.diameter).toBe(0.165);
    }
    expect(r.kpis.volume).toBeCloseTo(p.width * p.rows * p.burden * p.liftHeight, 6);
  });

  it('breasting: filas horizontales sin cuele y fila del techo como contorno', () => {
    const r = design('breasting');
    const p = METHOD_DEFAULTS.breasting;
    for (const h of r.holes) {
      expect(h.collar.z).toBeCloseTo(h.toe.z, 9);
      expect(h.toe.y).toBeCloseTo(p.length, 9);
    }
    const top = Math.max(...r.holes.map((h) => h.collar.z));
    expect(r.holes.filter((h) => h.role === 'contour').every((h) => h.collar.z === top)).toBe(true);
    expect(r.holes.some((h) => h.role === 'cut' || h.role === 'relief')).toBe(false);
  });

  it('realce y shrinkage: ascendentes inclinados hacia la cara libre', () => {
    for (const id of ['uppers', 'shrinkage'] as const) {
      const r = design(id);
      const p = METHOD_DEFAULTS[id];
      for (const h of r.holes) {
        expect(h.toe.z).toBeCloseTo(p.length * Math.sin(p.dip), 6);
        expect(h.toe.y).toBeLessThan(h.collar.y);
        expect(Math.abs(h.collar.x)).toBeLessThanOrEqual(p.width / 2 - p.wallOffset + 1e-9);
      }
    }
  });

  it('banqueo: sobreperforación bajo el piso del banco', () => {
    const r = design('roomBench');
    const p = METHOD_DEFAULTS.roomBench;
    for (const h of r.holes) expect(h.toe.z).toBeCloseTo(-(p.height + p.subdrill), 6);
  });

  it('retardos por filas: la fila de la cara libre sale primero', () => {
    const r = design('benchFill');
    const byRow = (g: number) => r.holes.filter((h) => h.group === g).map((h) => must(h.delay));
    expect(Math.max(...byRow(0))).toBeLessThan(Math.min(...byRow(1)));
  });

  it('datos imposibles dan un error claro', () => {
    expect(() => designByMethod('driftMechanized', { width: 4, height: 1.5 })).toThrow(/H > W\/2/);
    expect(() => designByMethod('dropRaise', { width: 0.4 })).toThrow();
  });
});

describe('secuencia continua de las plantillas', () => {
  it('con separación ningún taladro comparte tiempo y se respeta el orden nominal', () => {
    const t = continuousDelays([0, 0, 0.1, null, 0.1, 0.025], 0.025);
    const want = [0, 0.025, 0.1, null, 0.125, 0.05];
    t.forEach((x, i) => {
      const w = want[i];
      if (w === null || w === undefined) expect(x).toBeNull();
      else expect(x).toBeCloseTo(w, 9);
    });
    expect(continuousDelays([0, 0], 0)).toEqual([0, 0]);
  });
});
