import { describe, expect, it } from 'vitest';
import { designRing, rayHit, replicateRings, wrapAngle } from './ringDesign';
import { distanceToBoundary, pointInProfile } from './profiles';

/** Valor no nulo o error (evita aserciones `!`). */
function must<T>(x: T | null | undefined): T {
  if (x === null || x === undefined) throw new Error('valor ausente');
  return x;
}

// Tajeo rectangular 16 × 23 m en el plano del anillo con la galería 4 × 4 m adentro; valores
// esperados calculados a mano (sin CR-S2 todavía, S0).
const boundary = [
  { u: -8, v: -5 },
  { u: 8, v: -5 },
  { u: 8, v: 18 },
  { u: -8, v: 18 },
];
const drive = [
  { u: -2, v: 0 },
  { u: 2, v: 0 },
  { u: 2, v: 4 },
  { u: -2, v: 4 },
];
const base = {
  pivot: { u: 0, v: 1.5 },
  boundary,
  drive,
  holeDiameter: 0.089,
  explosiveDensity: 900,
  burden: 2.2,
  rockDensity: 2700,
};

describe('anillo por espaciamiento de pie constante', () => {
  const S = 2.5;
  const r = designRing({ ...base, mode: 'toeSpacing', toeSpacing: S, maxLength: 25 });

  it('fondos dentro del contorno con stand-off de 0,3 m sobre el taladro', () => {
    expect(r.holes.length).toBeGreaterThan(10);
    for (const h of r.holes) {
      expect(pointInProfile(h.toe, boundary)).toBe(true);
      const dir = { u: Math.sin(h.angle), v: Math.cos(h.angle) };
      expect(must(rayHit(h.toe, dir, boundary))).toBeCloseTo(0.3, 6);
      // Boca sobre el perfil de la galería.
      expect(distanceToBoundary(h.collar, drive)).toBeLessThan(1e-9);
      expect(h.length).toBeLessThanOrEqual(25);
    }
  });

  it('zona muerta ±30° alrededor de la vertical hacia abajo', () => {
    for (const h of r.holes)
      expect(Math.abs(wrapAngle(h.angle - Math.PI))).toBeGreaterThanOrEqual(Math.PI / 6 - 1e-9);
  });

  it('espaciamiento de pie ≈ S entre contiguos (el último tramo ≥ S/2)', () => {
    const gaps = r.holes
      .slice(1)
      .map((h, i) =>
        Math.hypot(h.toe.u - must(r.holes[i]).toe.u, h.toe.v - must(r.holes[i]).toe.v),
      );
    for (const g of gaps.slice(0, -1)) {
      expect(g).toBeGreaterThanOrEqual(S - 1e-9);
      expect(g).toBeLessThan(S * 1.02);
    }
    expect(must(gaps[gaps.length - 1])).toBeGreaterThanOrEqual(S / 2);
  });

  it('collar sin carga alterno y ≥ max(1 m, 20·d) = 1,78 m', () => {
    expect(must(r.holes[0]).collarType).toBe('long');
    expect(must(r.holes[1]).collarType).toBe('short');
    for (const h of r.holes) {
      expect(h.unchargedCollar).toBeGreaterThanOrEqual(1.78 - 1e-12);
      expect(h.chargedLength + h.unchargedCollar).toBeCloseTo(h.length, 12);
      expect(h.mass).toBeCloseTo(h.chargedLength * r.linearCharge, 12);
    }
  });

  it('KPIs: área 16·23 − 4·4 = 352 m²; t = 2,2·352·2,7 = 2090,88 t', () => {
    expect(r.linearCharge).toBeCloseTo((900 * Math.PI * 0.089 ** 2) / 4, 12);
    expect(r.kpis.area).toBeCloseTo(352, 9);
    expect(r.kpis.tonnes).toBeCloseTo(2090.88, 6);
    expect(r.kpis.chargePerTonne).toBeCloseTo(r.kpis.totalCharge / 2090.88, 12);
    expect(r.kpis.drilledPerTonne).toBeCloseTo(r.kpis.drilledMeters / 2090.88, 12);
    expect(r.kpis.powderFactor).toBeCloseTo(r.kpis.totalCharge / (2.2 * 352), 12);
  });

  it('secuencia desde el centro (θ = 0) hacia afuera con 25 ms', () => {
    const first = r.holes.reduce((a, b) => (Math.abs(b.angle) < Math.abs(a.angle) ? b : a));
    expect(first.delay).toBe(0);
    const sorted = [...r.holes].sort((a, b) => Math.abs(a.angle) - Math.abs(b.angle));
    sorted.forEach((h, i) => {
      expect(h.delay).toBeCloseTo(i * 0.025, 12);
    });
  });
});

describe('anillo por ángulo igual', () => {
  it('Δθ = 10° desde el borde de la zona muerta, largo máximo recortado', () => {
    const step = (10 * Math.PI) / 180;
    const r = designRing({ ...base, mode: 'angle', angleStep: step, maxLength: 12 });
    expect(must(r.holes[0]).angle).toBeCloseTo(-150 * (Math.PI / 180), 9);
    for (let i = 1; i < r.holes.length; i++)
      expect(wrapAngle(must(r.holes[i]).angle - must(r.holes[i - 1]).angle)).toBeCloseTo(step, 9);
    // De −150° a 150° cada 10°: 31 taladros.
    expect(r.holes).toHaveLength(31);
    expect(r.holes.some((h) => h.truncated)).toBe(true);
    for (const h of r.holes) expect(h.length).toBeLessThanOrEqual(12 + 1e-12);
  });

  it('ángulo mínimo entre taladros', () => {
    const r = designRing({
      ...base,
      mode: 'angle',
      angleStep: (1 * Math.PI) / 180,
      minAngle: (3 * Math.PI) / 180,
    });
    for (let i = 1; i < r.holes.length; i++)
      expect(
        Math.abs(wrapAngle(must(r.holes[i]).angle - must(r.holes[i - 1]).angle)),
      ).toBeGreaterThanOrEqual((3 * Math.PI) / 180 - 1e-9);
  });
});

describe('réplica de anillos', () => {
  it('cada burden a lo largo de la galería, retirada con retardo entre anillos', () => {
    expect(replicateRings(3, 2.2, { firstOffset: 1, ringInterval: 0.1 })).toEqual([
      { index: 0, offset: 1, delayOffset: 0 },
      { index: 1, offset: 3.2, delayOffset: 0.1 },
      { index: 2, offset: 1 + 2 * 2.2, delayOffset: 0.2 },
    ]);
  });
});
