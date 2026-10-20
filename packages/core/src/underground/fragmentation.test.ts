import { describe, expect, it } from 'vitest';
import { createDefaultRockMass } from '../model/factories';
import { createDefaultLibrary } from '../model/library';
import { swebrecPassing } from '../fragmentation/fragmentation';
import { designFaceRound } from './faceDesign';
import {
  faceFragmentationZones,
  ringFragmentationZone,
  undergroundFragmentation,
  undergroundKuzRam,
  type UgFragmentationZone,
} from './fragmentation';
import { arched } from './profiles';
import { designRing } from './ringDesign';

function must<T>(x: T | null | undefined): T {
  if (x === null || x === undefined) throw new Error('valor ausente');
  return x;
}

const lib = createDefaultLibrary();
const bulk = must(lib.explosives.find((e) => e.family === 'emulsion' && e.form === 'bulk'));
const rock = createDefaultRockMass();

const zone: UgFragmentationZone = {
  zone: 'stoping',
  mass: 10,
  loadingFactor: 1.2,
  chargePerHole: 3,
  burden: 0.8,
  spacing: 1,
  diameter: 0.045,
  chargeLength: 3,
  holeLength: 3.6,
  bottomChargeLength: 1,
  columnChargeLength: 2,
};

describe('Kuz-Ram subterráneo', () => {
  it('X50 y n de Cunningham 2005 a mano', () => {
    const A = 7;
    const r = undergroundKuzRam(zone, A, { rws: 0.8, drillDeviation: 0.05 });
    const x50cm = A * 1.2 ** -0.8 * 3 ** (1 / 6) * (115 / 80) ** (19 / 20);
    expect(r.x50).toBeCloseTo(x50cm / 100, 12);
    const n =
      Math.sqrt(2 - (30 * 0.8) / 45) *
      Math.sqrt((1 + 1 / 0.8) / 2) *
      (1 - 0.05 / 0.8) *
      (1 / 3 + 0.1) ** 0.1 *
      (3 / 3.6);
    expect(r.n).toBeCloseTo(n, 12);
    // Variante 1987: exponente 19/30 y primer factor 2,2 − 14·B/d.
    const old = undergroundKuzRam(zone, A, {
      rws: 0.8,
      drillDeviation: 0.05,
      variant: 'cunningham1987',
    });
    expect(old.x50).toBeCloseTo(
      (A * 1.2 ** -0.8 * 3 ** (1 / 6) * (115 / 80) ** (19 / 30)) / 100,
      12,
    );
    expect(old.n).toBeCloseTo((n / Math.sqrt(2 - (30 * 0.8) / 45)) * (2.2 - (14 * 0.8) / 45), 12);
  });

  it('una sola zona: P50 de Swebrec = X50 y la calibración escala X50', () => {
    const r = must(
      undergroundFragmentation([zone], rock, { rws: 0.8, drillDeviation: 0.05, rockFactor: 7 }),
    );
    const z = must(r.zones[0]);
    expect(r.p50.swebrec).toBeCloseTo(z.x50, 6);
    expect(r.p80.swebrec).toBeGreaterThan(r.p50.swebrec);
    const c = must(
      undergroundFragmentation([zone], rock, {
        rws: 0.8,
        drillDeviation: 0.05,
        rockFactor: 7,
        calibration: 1.2,
      }),
    );
    expect(must(c.zones[0]).x50).toBeCloseTo(z.x50 * 1.2, 9);
  });

  it('las curvas se pesan por la roca de cada zona (kg/K), no por su explosivo', () => {
    const fine = { ...zone, zone: 'cut', loadingFactor: 6, mass: 5 };
    const r = must(
      undergroundFragmentation([zone, fine], rock, {
        rws: 0.8,
        drillDeviation: 0.05,
        rockFactor: 7,
      }),
    );
    const [a, b] = r.zones;
    const va = 10 / 1.2;
    const vb = 5 / 6;
    // P50 de la mezcla: donde la curva pesada por roca vale 0,5.
    const p = r.p50.swebrec;
    const at = (q: number) =>
      (va * swebrecPassing(q, must(a).x50, must(a).xmax, must(a).b) +
        vb * swebrecPassing(q, must(b).x50, must(b).xmax, must(b).b)) /
      (va + vb);
    expect(at(p)).toBeCloseTo(0.5, 6);
  });

  it('la mezcla queda entre las curvas de las zonas', () => {
    const fine = { ...zone, zone: 'cut', loadingFactor: 6, mass: 5 };
    const r = must(
      undergroundFragmentation([zone, fine], rock, {
        rws: 0.8,
        drillDeviation: 0.05,
        rockFactor: 7,
      }),
    );
    const [a, b] = r.zones.map((z) => z.x50);
    expect(r.p50.swebrec).toBeLessThan(Math.max(must(a), must(b)));
    expect(r.p50.swebrec).toBeGreaterThan(Math.min(must(a), must(b)));
  });
});

describe('zonas del frente y del abanico', () => {
  const profile = arched(4.5, 2.25);
  const design = designFaceRound({
    profile,
    holeDiameter: 0.045,
    reliefDiameter: 0.102,
    explosiveDensity: bulk.density,
    rws: bulk.rws,
    maxDrillLength: 4,
  });

  it('frente: la masa de las zonas es la del diseño y el arranque es la zona más cargada', () => {
    const advance = design.kpis.advance;
    const zones = faceFragmentationZones(design, profile.area, advance);
    expect(zones.map((z) => z.zone)).toContain('cut');
    expect(zones.reduce((s, z) => s + z.mass, 0)).toBeCloseTo(design.kpis.totalCharge, 6);
    // Volumen total = área del perfil × avance: la carga específica media es la del diseño.
    const vol = zones.reduce((s, z) => s + z.mass / z.loadingFactor, 0);
    expect(vol).toBeCloseTo(profile.area * advance, 6);
    const cut = must(zones.find((z) => z.zone === 'cut'));
    for (const z of zones) expect(cut.loadingFactor).toBeGreaterThanOrEqual(z.loadingFactor);
    const r = must(
      undergroundFragmentation(zones, rock, {
        rws: bulk.rws,
        drillDeviation: design.drillingError,
      }),
    );
    expect(r.p80.swebrec).toBeGreaterThan(r.p50.swebrec);
    expect(r.p80.swebrec).toBeLessThan(2);
  });

  it('abanico: K = carga del anillo / (B·A)', () => {
    const ring = designRing({
      pivot: { u: 0, v: 1.6 },
      boundary: [
        { u: -7.5, v: -3 },
        { u: 7.5, v: -3 },
        { u: 7.5, v: 20 },
        { u: -7.5, v: 20 },
      ],
      drive: arched(4, 2).points,
      mode: 'toeSpacing',
      toeSpacing: 2.5,
      holeDiameter: 0.089,
      explosiveDensity: bulk.density,
      burden: 2.2,
      rockDensity: 2700,
    });
    const z = must(ringFragmentationZone(ring, 2.2));
    expect(z.loadingFactor).toBeCloseTo(ring.kpis.totalCharge / (2.2 * ring.kpis.area), 9);
    expect(z.spacing).toBeGreaterThan(1);
    expect(z.spacing).toBeLessThan(3.5);
    expect(
      undergroundFragmentation([z], rock, { rws: bulk.rws, drillDeviation: 0.1 }),
    ).not.toBeNull();
  });
});
