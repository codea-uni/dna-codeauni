import { describe, expect, it } from 'vitest';
import {
  coupledLinearCharge,
  cutSquareBurden,
  designFaceRound,
  firstSquareCharge,
  generalBurden,
  holmbergDepth,
} from './faceDesign';
import { arched, pointInProfile, rectangular } from './profiles';

/** Valor no nulo o error (evita aserciones `!`). */
function must<T>(x: T | null | undefined): T {
  if (x === null || x === undefined) throw new Error('valor ausente');
  return x;
}

/**
 * Ejemplo tipo de libro (Holmberg 1982 / López Jimeno, método sueco de 4 secciones): d = 45 mm,
 * un alivio de 102 mm, ANFO (ρe = 850 kg/m³, s_ANFO = 1), c = 0,4, α = 0,01 m/m, e' = 0,02 m,
 * γ = 3°. Los valores esperados se calcularon a mano paso a paso (no hay CR-S1 todavía, S0).
 */
const base = {
  holeDiameter: 0.045,
  reliefDiameter: 0.102,
  explosiveDensity: 850,
  rws: 1,
};

describe('método sueco: fórmulas', () => {
  it('avance de Holmberg con Φ = 0,102 m: H = 0,15 + 3,4782 − 0,40992 = 3,2183 m', () => {
    expect(holmbergDepth(0.102)).toBeCloseTo(3.2182824, 7);
  });

  it('carga de la sección 1: l1 = 55·0,045·1,5^1,5·(0,153 − 0,051) = 0,46378 kg/m', () => {
    expect(firstSquareCharge(0.045, 0.153, 0.102, 0.4, 1)).toBeCloseTo(0.46378, 5);
  });

  it('carga acoplada de ANFO en 45 mm: q = 850·π/4·0,045² = 1,35187 kg/m', () => {
    expect(coupledLinearCharge(850, 0.045)).toBeCloseTo(1.35187, 5);
  });

  it('sección 2: Ah = √2·(0,12122 − 0,05218) = 0,09763 → B = 0,088·√(7,3325) = 0,23829 m', () => {
    expect(cutSquareBurden(0.09763, 1.35186, 1, 0.045, 0.4)).toBeCloseTo(0.23829, 4);
  });

  it('burden de zapateras f = 1,45, S/B = 1: 0,4·B² + 0,07·B − 0,75519 = 0 → B = 1,2894 m (c̄ = c + 0,07/B)', () => {
    expect(generalBurden(1.35186, 1, 0.4, 1.45, 1)).toBeCloseTo(1.2894, 3);
    // Con B ≥ 1,4 m, c̄ = c + 0,05: l = 4 kg/m → B = 0,9·√(6,1303) = 2,2283 m.
    expect(generalBurden(4, 1, 0.4, 1.45, 1)).toBeCloseTo(2.2283, 4);
  });
});

describe('método sueco: ronda de una galería arco-D 4 × 4 m', () => {
  const r = designFaceRound({ ...base, profile: arched(4, 2) });

  it('profundidad, avance y error de perforación', () => {
    expect(r.equivalentReliefDiameter).toBeCloseTo(0.102, 12);
    expect(r.depth).toBeCloseTo(3.2183, 4);
    // I = 0,95·3,2183 = 3,0574 m; F = 0,01·3,2183 + 0,02 = 0,05218 m.
    expect(r.kpis.advance).toBeCloseTo(3.0574, 4);
    expect(r.drillingError).toBeCloseTo(0.05218, 5);
  });

  it('arranque: B1 = 1,5Φ = 0,153; B1p = 1,7Φ − F = 0,12122; W1 = √2·B1p = 0,17143', () => {
    const s1 = must(r.squares[0]);
    expect(s1.burden).toBeCloseTo(0.153, 12);
    expect(s1.practicalBurden).toBeCloseTo(0.12122, 5);
    expect(s1.side).toBeCloseTo(0.17143, 5);
    // l1 = 0,464 < q = 1,352: la sección 1 usa la carga requerida.
    expect(s1.linearCharge).toBeCloseTo(0.46378, 5);
    // Sección 2: Bp = 0,23829 − 0,05218 = 0,18611 ≤ 2·Ah; W2 = √2·(0,18611 + 0,04882) = 0,33224.
    const s2 = must(r.squares[1]);
    expect(s2.practicalBurden).toBeCloseTo(0.18611, 4);
    expect(s2.side).toBeCloseTo(0.33224, 4);
    // Cuatro secciones; la última con lado < √H = 1,794 m.
    expect(r.squares).toHaveLength(4);
    expect(must(r.squares[3]).side).toBeLessThan(Math.sqrt(r.depth));
  });

  it('burden práctico de zapateras: 1,2894 − 3,2183·sin 3° − 0,05218 = 1,0687 m', () => {
    expect(r.groupBurden.lifter).toBeCloseTo(1.0687, 3);
    expect(r.groupSpacing.contour).toBeCloseTo(15 * 0.045, 12);
  });

  it('número de taladros plausible y por grupo', () => {
    const count = (role: string) => r.holes.filter((h) => h.role === role).length;
    expect(r.holes.length).toBeGreaterThanOrEqual(40);
    expect(r.holes.length).toBeLessThanOrEqual(60);
    expect(count('relief')).toBe(1);
    expect(count('cut')).toBe(16);
    // Zapateras: N = int((4 + 2·3,2183·sin 3°)/1,2894 + 2) = int(5,36) = 5.
    expect(count('lifter')).toBe(5);
    expect(count('contour')).toBeGreaterThan(10);
    expect(r.kpis.reliefHoles).toBe(1);
    expect(r.kpis.chargedHoles).toBe(r.holes.length - 1);
    // Comprobación empírica N = P/0,6 + 1,5·A = 23,81 + 21,42 = 45,2 (mismo orden).
    expect(r.kpis.empiricalHoleCount).toBeCloseTo(45.23, 1);
    expect(r.warnings).toEqual([]);
  });

  it('todas las bocas dentro del perfil y sin taladros superpuestos', () => {
    const profile = arched(4, 2);
    for (const h of r.holes) expect(pointInProfile(h.collar, profile.points)).toBe(true);
    for (let i = 0; i < r.holes.length; i++)
      for (let j = i + 1; j < r.holes.length; j++) {
        const a = must(r.holes[i]).collar;
        const b = must(r.holes[j]).collar;
        expect(Math.hypot(a.u - b.u, a.v - b.v)).toBeGreaterThan(0.1);
      }
  });

  it('cargas: alivio vacío, taco 10·d en el arranque, contorno 90·d²', () => {
    const relief = must(r.holes.find((h) => h.role === 'relief'));
    expect(relief.charge).toBeNull();
    expect(relief.delay).toBeNull();
    expect(relief.diameter).toBe(0.102);
    const cut = must(r.holes.find((h) => h.role === 'cut' && h.square === 2));
    expect(must(cut.charge).stemming).toBeCloseTo(0.45, 12);
    expect(must(cut.charge).mass).toBeCloseTo(1.35186 * (r.depth - 0.45), 4);
    const contour = must(r.holes.find((h) => h.role === 'contour'));
    expect(must(contour.charge).column.linearCharge).toBeCloseTo(90 * 0.045 ** 2, 12);
    // Look-out: fondo desplazado H·tan 3° = 0,1687 m hacia afuera.
    expect(
      Math.hypot(contour.toe.u - contour.collar.u, contour.toe.v - contour.collar.v),
    ).toBeCloseTo(r.depth * Math.tan((3 * Math.PI) / 180), 9);
    const lifter = must(r.holes.find((h) => h.role === 'lifter'));
    // Fondo 1,25·Bp, columna al 70 %.
    expect(must(lifter.charge).bottom.length).toBeCloseTo(1.25 * r.groupBurden.lifter, 9);
    expect(must(lifter.charge).column.linearCharge).toBeCloseTo(0.7 * r.linearCharge, 12);
  });

  it('KPIs: factor de carga 1–3 kg/m³ y coherencia de cocientes', () => {
    const k = r.kpis;
    expect(k.powderFactor).toBeGreaterThan(1);
    expect(k.powderFactor).toBeLessThan(3);
    expect(k.volume).toBeCloseTo(arched(4, 2).area * k.advance, 9);
    expect(k.chargePerAdvance).toBeCloseTo(k.totalCharge / k.advance, 9);
    expect(k.drilledPerVolume).toBeCloseTo(k.drilledMeters / k.volume, 9);
  });

  it('secuencia: arranque de adentro hacia afuera, un número por taladro; zapateras al final y esquinas últimas', () => {
    const cuts = r.holes.filter((h) => h.role === 'cut');
    const delays = cuts.map((h) => must(h.delay));
    expect(new Set(delays).size).toBe(cuts.length);
    for (let i = 1; i < cuts.length; i++) {
      expect(must(delays[i])).toBeGreaterThan(must(delays[i - 1]));
      expect(must(must(cuts[i]).square)).toBeGreaterThanOrEqual(must(must(cuts[i - 1]).square));
    }
    const lifters = r.holes.filter((h) => h.role === 'lifter');
    const maxOther = Math.max(
      ...r.holes.filter((h) => h.role !== 'lifter' && h.delay !== null).map((h) => must(h.delay)),
    );
    for (const l of lifters) expect(must(l.delay)).toBeGreaterThan(maxOther);
    const corners = lifters.filter((h) => Math.abs(h.collar.u) > 1.5);
    const mid = lifters.filter((h) => Math.abs(h.collar.u) <= 1.5);
    expect(Math.min(...corners.map((h) => must(h.delay)))).toBeGreaterThan(
      Math.max(...mid.map((h) => must(h.delay))),
    );
    // Techo y contorno comparten número.
    const roofContour = new Set(
      r.holes.filter((h) => h.role === 'roof' || h.role === 'contour').map((h) => h.delay),
    );
    expect(roofContour.size).toBe(1);
  });
});

describe('método sueco: variantes y avisos', () => {
  it('sin voladura suave no hay rol contour y el perímetro lo forman hastiales y techo', () => {
    const r = designFaceRound({ ...base, profile: rectangular(5, 5), smoothBlasting: false });
    expect(r.holes.some((h) => h.role === 'contour')).toBe(false);
    expect(r.holes.some((h) => h.role === 'wall')).toBe(true);
    expect(r.holes.some((h) => h.role === 'roof')).toBe(true);
    for (const h of r.holes) expect(pointInProfile(h.collar, rectangular(5, 5).points)).toBe(true);
  });

  it('galería grande con dos alivios: Φ = 0,102·√2 y ayudas entre arranque y contorno', () => {
    const r = designFaceRound({ ...base, profile: arched(7, 4), reliefCount: 2 });
    expect(r.equivalentReliefDiameter).toBeCloseTo(0.102 * Math.SQRT2, 12);
    expect(r.holes.filter((h) => h.role === 'relief')).toHaveLength(2);
    expect(r.holes.filter((h) => h.role === 'stoping').length).toBeGreaterThan(0);
    expect(r.kpis.powderFactor).toBeGreaterThan(0.8);
    expect(r.kpis.powderFactor).toBeLessThan(3);
  });

  it('cartuchos desacoplados: menor carga lineal, burdens menores y más taladros', () => {
    const coupled = designFaceRound({ ...base, profile: arched(4.5, 1.75) });
    // Cartucho de 32 mm de emulsión a 1140 kg/m³: q = 1140·π/4·0,032² = 0,91684 kg/m.
    const q = (1140 * Math.PI * 0.032 ** 2) / 4;
    expect(q).toBeCloseTo(0.91684, 5);
    const decoupled = designFaceRound({ ...base, profile: arched(4.5, 1.75), linearCharge: q });
    expect(decoupled.groupBurden.lifter).toBeLessThan(coupled.groupBurden.lifter);
    expect(decoupled.holes.length).toBeGreaterThan(coupled.holes.length);
    for (const h of decoupled.holes)
      if (h.role === 'cut' && h.square && h.square > 1)
        expect(h.charge?.bottom.linearCharge).toBe(q);
  });

  it('la viga del jumbo recorta la profundidad y se avisa', () => {
    const r = designFaceRound({ ...base, profile: arched(4, 2), maxDrillLength: 2.4 });
    expect(r.depth).toBe(2.4);
    expect(r.warnings.map((w) => w.code)).toContain('depthLimited');
  });

  it('desviación grande deja B1p ≤ 0 y alivio no mayor que la carga', () => {
    const r = designFaceRound({ ...base, profile: arched(4, 2), angularDeviation: 0.05 });
    expect(r.warnings.map((w) => w.code)).toContain('firstBurdenNonPositive');
    const r2 = designFaceRound({ ...base, profile: arched(4, 2), reliefDiameter: 0.045 });
    expect(r2.warnings.map((w) => w.code)).toContain('reliefNotLarger');
  });
});

describe('contorno «uno sí, uno no» (precorte con taladros guía)', () => {
  const full = designFaceRound({ ...base, profile: arched(4, 2) });
  const alt = designFaceRound({ ...base, profile: arched(4, 2), alternateContour: true });
  const contour = (r: typeof full) => r.holes.filter((h) => h.role === 'contour');

  it('misma perforación; en el contorno se carga uno de cada dos', () => {
    expect(alt.holes.length).toBe(full.holes.length);
    const c = contour(alt);
    const guides = c.filter((h) => h.guide);
    expect(guides.length).toBe(Math.floor(c.length / 2));
    expect(alt.kpis.guideHoles).toBe(guides.length);
    expect(full.kpis.guideHoles).toBe(0);
    for (const h of guides) {
      expect(h.charge).toBeNull();
      expect(h.delay).toBeNull();
    }
    // Las guías no cuentan como alivios y la carga baja en lo que llevaban.
    expect(alt.kpis.reliefHoles).toBe(1);
    expect(alt.kpis.chargedHoles).toBe(full.kpis.chargedHoles - guides.length);
    expect(alt.kpis.totalCharge).toBeLessThan(full.kpis.totalCharge);
  });

  it('alternan a lo largo del contorno: nunca dos guías ni dos cargados seguidos', () => {
    const c = contour(alt);
    for (let i = 1; i < c.length; i++)
      expect(Boolean(c[i]?.guide)).not.toBe(Boolean(c[i - 1]?.guide));
  });

  it('sin voladura suave alterna la fila de hastiales y corona', () => {
    const r = designFaceRound({
      ...base,
      profile: arched(4, 2),
      smoothBlasting: false,
      alternateContour: true,
    });
    const g = r.holes.filter((h) => h.guide);
    expect(g.length).toBeGreaterThan(2);
    for (const h of g) expect(['wall', 'roof']).toContain(h.role);
  });
});
