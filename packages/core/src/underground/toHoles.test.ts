import { describe, expect, it } from 'vitest';
import { explosiveDeckMass } from '../charging/charge';
import { holeToe } from '../geometry/hole';
import { designChecks } from '../diagnostics/designChecks';
import { createBlast, createDefaultRockMass } from '../model/factories';
import { createDefaultLibrary } from '../model/library';
import type { Explosive, Hole } from '../model/types';
import { designFaceRound } from './faceDesign';
import { arched } from './profiles';
import { designRing, replicateRings } from './ringDesign';
import {
  effectiveChargeDiameter,
  faceRoundToHoles,
  isUndergroundHole,
  ringsToHoles,
} from './toHoles';
import { planeFrame } from './transform';

/** Valor no nulo o error (evita aserciones `!`). */
function must<T>(x: T | null | undefined): T {
  if (x === null || x === undefined) throw new Error('valor ausente');
  return x;
}

const lib = createDefaultLibrary();
const bulk = must(lib.explosives.find((e) => e.family === 'emulsion' && e.form === 'bulk'));
const packaged = must(lib.explosives.find((e) => e.cartridge !== undefined));
const stemmingMaterialId = must(lib.stemmingMaterials[0]).id;
const detonatorId = must(lib.detonators.find((d) => d.type === 'electronic')).id;

function chargedMass(h: Hole, products: readonly Explosive[]): number {
  return h.decks.reduce((s, d) => {
    if (d.kind !== 'explosive') return s;
    return s + explosiveDeckMass(d, must(products.find((p) => p.id === d.explosiveId)), h.diameter);
  }, 0);
}

// Galería arco-D 4,5 × 4,5 m, d = 45 mm, un alivio de 102 mm (caso de `faceDesign.test.ts`).
const profile = arched(4.5, 4.5 - 2.25);
const design = designFaceRound({
  profile,
  holeDiameter: 0.045,
  reliefDiameter: 0.102,
  explosiveDensity: bulk.density,
  rws: bulk.rws,
  maxDrillLength: 4,
});
const azimuth = (60 * Math.PI) / 180;
const frame = planeFrame({ origin: { x: 1000, y: 2000, z: 3500 }, azimuth });

describe('ronda de frente → taladros', () => {
  const holes = faceRoundToHoles({
    design,
    frame,
    products: { explosive: bulk, stemmingMaterialId, detonatorId },
    delayInterval: 0.1,
  });

  it('un taladro por taladro de diseño, con etiqueta F-n y la marca del frente', () => {
    expect(holes).toHaveLength(design.holes.length);
    expect(must(holes[0]).label).toBe('F-1');
    design.holes.forEach((d, i) => {
      expect(must(holes[i]).tags).toEqual(
        d.role === 'relief' ? ['ug-face', 'ug-relief'] : ['ug-face'],
      );
    });
    for (const h of holes) expect(isUndergroundHole(h)).toBe(true);
  });

  it('taladros horizontales (inclinación ≈ π/2) con el azimut de la galería', () => {
    for (const h of holes) {
      // El look-out abre hasta 3°: inclinación y azimut a ≤ 3° de los de la galería.
      expect(Math.abs(h.inclination - Math.PI / 2)).toBeLessThanOrEqual((3 * Math.PI) / 180 + 1e-9);
      expect(Math.abs(h.azimuth - azimuth)).toBeLessThanOrEqual((3 * Math.PI) / 180 + 1e-9);
    }
    const parallel = holes.filter((_, i) => {
      const d = must(design.holes[i]);
      return d.collar.u === d.toe.u && d.collar.v === d.toe.v;
    });
    expect(parallel.length).toBeGreaterThan(10);
    for (const h of parallel) {
      expect(h.inclination).toBeCloseTo(Math.PI / 2, 9);
      expect(h.azimuth).toBeCloseTo(azimuth, 9);
      // Fondo a H sobre el eje de la galería.
      const toe = holeToe(h);
      expect(Math.hypot(toe.x - h.collar.x, toe.y - h.collar.y)).toBeCloseTo(design.depth, 9);
    }
  });

  it('la masa cargada es la del diseño (±1 %) y los alivios no llevan explosivo', () => {
    const total = holes.reduce((s, h) => s + chargedMass(h, [bulk]), 0);
    expect(total / design.kpis.totalCharge).toBeCloseTo(1, 2);
    design.holes.forEach((d, i) => {
      const h = must(holes[i]);
      if (d.role === 'relief') {
        expect(h.decks.some((x) => x.kind === 'explosive')).toBe(false);
        expect(h.initiators).toHaveLength(0);
      } else {
        expect(Math.abs(chargedMass(h, [bulk]) - must(d.charge).mass)).toBeLessThan(
          0.01 * must(d.charge).mass,
        );
        expect(must(h.initiators[0]).delay).toBeCloseTo(must(d.delay) * 0.1, 12);
      }
    });
  });

  it('decks de fondo a boca que cierran el largo del taladro', () => {
    for (const h of holes) {
      if (h.decks.length === 0) continue;
      expect(must(h.decks[h.decks.length - 1]).kind).toBe('stemming');
      expect(h.decks.reduce((s, d) => s + d.length, 0)).toBeCloseTo(h.length, 6);
    }
  });

  it('contorno con un encartuchado: masa del diseño con el diámetro efectivo', () => {
    const withCartridge = faceRoundToHoles({
      design,
      frame,
      products: { explosive: bulk, contourExplosive: packaged, stemmingMaterialId, detonatorId },
      delayInterval: 0.1,
    });
    const total = withCartridge.reduce((s, h) => s + chargedMass(h, [bulk, packaged]), 0);
    expect(total / design.kpis.totalCharge).toBeCloseTo(1, 2);
  });

  it('d_ef = √(4q/(πρ)) devuelve el diámetro del taladro con la carga acoplada', () => {
    const q = (1200 * Math.PI * 0.045 ** 2) / 4;
    expect(effectiveChargeDiameter(q, 1200)).toBeCloseTo(0.045, 12);
  });
});

describe('anillos → taladros', () => {
  const boundary = [
    { u: -8, v: -5 },
    { u: 8, v: -5 },
    { u: 8, v: 18 },
    { u: -8, v: 18 },
  ];
  const ring = designRing({
    pivot: { u: 0, v: 1.6 },
    boundary,
    drive: arched(4, 2).points,
    mode: 'toeSpacing',
    toeSpacing: 2.5,
    maxLength: 30,
    holeDiameter: 0.089,
    explosiveDensity: bulk.density,
    burden: 2.2,
    rockDensity: 2700,
  });
  const placements = replicateRings(3, 2.2, { ringInterval: 0.2 });
  const holes = ringsToHoles({
    ring,
    frame,
    placements,
    products: { explosive: bulk, stemmingMaterialId, detonatorId },
  });

  it('N anillos × taladros por anillo, cada anillo un burden más adelante', () => {
    expect(holes).toHaveLength(3 * ring.holes.length);
    const n = ring.holes.length;
    const a = must(holes[0]);
    const b = must(holes[n]);
    expect(Math.hypot(b.collar.x - a.collar.x, b.collar.y - a.collar.y)).toBeCloseTo(2.2, 9);
    expect(b.label).toBe('A2-1');
  });

  it('masa por anillo = la del diseño; tiempos + retardo del anillo', () => {
    const n = ring.holes.length;
    const first = holes.slice(0, n).reduce((s, h) => s + chargedMass(h, [bulk]), 0);
    expect(first / ring.kpis.totalCharge).toBeCloseTo(1, 6);
    const h = must(holes[n + 1]);
    expect(must(h.initiators[0]).delay).toBeCloseTo(must(ring.holes[1]).delay + 0.2, 12);
  });

  it('longitudes del diseño y taladros ascendentes con inclinación > π/2', () => {
    ring.holes.forEach((r, i) => {
      expect(must(holes[i]).length).toBeCloseTo(r.length, 9);
    });
    expect(holes.some((h) => h.inclination > Math.PI / 2 + 0.1)).toBe(true);
  });
});

describe('revisión del diseño con taladros subterráneos', () => {
  it('sin reglas de banco: ni bocas «duplicadas» en la vertical del frente, ni cara libre, ni alivios sin carga', () => {
    const blast = createBlast('Frente', createDefaultRockMass().id);
    blast.holes = faceRoundToHoles({
      design,
      frame,
      products: { explosive: bulk, stemmingMaterialId, detonatorId },
      delayInterval: 0.1,
    });
    const ids = designChecks(blast, null).map((c) => c.id);
    for (const id of ['duplicate', 'noFreeFace', 'unloaded', 'benchDiameter', 'stemmingDiameter'])
      expect(ids).not.toContain(id);
    // Dos bocas en el mismo punto sí son duplicadas.
    const first = must(blast.holes[1]);
    blast.holes.push({ ...first, id: 'otro' as Hole['id'], label: 'X' });
    expect(designChecks(blast, null).map((c) => c.id)).toContain('duplicate');
  });
});
