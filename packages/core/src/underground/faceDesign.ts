import type { KgPerM3, Kilograms, Meters, Radians, Ratio } from '../model/types';
import {
  distanceToBoundary,
  offsetProfile,
  pointInProfile,
  pointsAlong,
  type ExcavationProfile,
  type ProfileSegmentTag,
  type UV,
} from './profiles';

/**
 * Diseño automático de la ronda de un frente por el método sueco de 4 secciones (Fase 3, S2/S3).
 *
 * Fuentes: Langefors & Kihlström (1963); Holmberg (1982); Persson, Holmberg & Lee (1994) cap. 11;
 * López Jimeno, «Manual de perforación y voladura de rocas» (arranque de 4 secciones, zapateras,
 * ayudas y contorno); Olofsson, «Modern Rock Blasting». Las fórmulas están marcadas `[GENERAL]`
 * en `R4 §4.1` y quedan sin verificar contra el libro hasta S0: todas las constantes son
 * parámetros editables (regla de dominio 3).
 *
 * Plano local del frente: u horizontal (derecha mirando al avance), v arriba, origen en el centro
 * del piso. Los taladros son paralelos al eje de la galería salvo la desviación hacia afuera
 * («look-out») del contorno y las zapateras, que se da como desplazamiento del fondo en el plano.
 */

export type FaceHoleRole = 'relief' | 'cut' | 'stoping' | 'wall' | 'roof' | 'contour' | 'lifter';

/** Constantes de diseño por grupo: factor de fijación f, S/B y taco como fracción del burden. */
export interface HoleGroupConstants {
  fixation: Ratio;
  spacingBurdenRatio: Ratio;
  stemmingFactor: Ratio;
}

/** Tabla de Holmberg/López Jimeno (`R4 §4.1`, `[GENERAL]`). */
export const SWEDISH_GROUP_CONSTANTS: Readonly<
  Record<'lifter' | 'wall' | 'roof' | 'stopingUp' | 'stopingDown', HoleGroupConstants>
> = {
  lifter: { fixation: 1.45, spacingBurdenRatio: 1, stemmingFactor: 0.2 },
  wall: { fixation: 1.2, spacingBurdenRatio: 1.25, stemmingFactor: 0.5 },
  roof: { fixation: 1.2, spacingBurdenRatio: 1.25, stemmingFactor: 0.5 },
  stopingUp: { fixation: 1.45, spacingBurdenRatio: 1.25, stemmingFactor: 0.5 },
  stopingDown: { fixation: 1.2, spacingBurdenRatio: 1.25, stemmingFactor: 0.5 },
};

export interface FaceDesignInput {
  profile: ExcavationProfile;
  /** Diámetro de los taladros de carga d [m]. */
  holeDiameter: Meters;
  /** Diámetro de los taladros de alivio φ0 [m]. */
  reliefDiameter: Meters;
  /** Número de taladros de alivio n (1). Diámetro equivalente Φ = φ0·√n. */
  reliefCount?: number;
  /** Densidad del explosivo ρe [kg/m³] (SI; 1200 kg/m³ = 1,2 g/cm³). */
  explosiveDensity: KgPerM3;
  /** Potencia relativa en peso respecto al ANFO s_ANFO. */
  rws: Ratio;
  /** Carga lineal del contorno con voladura suave [kg/m]; por defecto 90·d². */
  contourLinearCharge?: number;
  /** Constante de roca c [kg/m³] (0,4). */
  rockConstant?: number;
  /** Desviación angular α [m/m] (0,01). */
  angularDeviation?: Ratio;
  /** Error de emboquille e' [m] (0,02). */
  collaringError?: Meters;
  /** Ángulo de look-out γ [rad] (3°). */
  lookOutAngle?: Radians;
  /** Largo máximo de perforación (viga del jumbo) [m]. */
  maxDrillLength?: Meters;
  /** Profundidad deseada [m]; se usa si es menor que la del alivio (H de Holmberg). */
  targetDepth?: Meters;
  /** Voladura suave en el contorno (true). */
  smoothBlasting?: boolean;
  /** K de voladura suave, S = K·d (15; rango 15–16). */
  smoothBlastingK?: number;
  /** Relación S/B del contorno con voladura suave (0,8 → B = 1,25·S). */
  smoothSpacingBurdenRatio?: Ratio;
  /** Distancia de emboquille del contorno y zapateras hacia adentro del perfil [m] (0,15). */
  contourInset?: Meters;
  /** Taco del contorno con voladura suave [m]; por defecto 0,5·B del contorno. */
  contourStemming?: Meters;
  /** Centro del arranque; por defecto u = 0, v = 0,4·alto del perfil. */
  cutCenter?: UV;
  /** Separación entre centros de alivios cuando n > 1 [m]; por defecto 1,5·φ0. */
  reliefSpacing?: Meters;
  /** Concentración de columna relativa a la de fondo (0,5; zapateras 0,7). */
  columnRatio?: Ratio;
  lifterColumnRatio?: Ratio;
  /** Largo de la carga de fondo en burdens prácticos (1,25). */
  bottomChargeFactor?: Ratio;
  /** Taco del arranque en diámetros (10). */
  cutStemmingDiameters?: number;
  /** Constantes por grupo (por defecto `SWEDISH_GROUP_CONSTANTS`). */
  groups?: Partial<Record<keyof typeof SWEDISH_GROUP_CONSTANTS, HoleGroupConstants>>;
  /** Comprobación empírica N ≈ P/E + K·A: E [m] (0,6) y K [1/m²] (1,5). */
  empiricalPerimeterSpacing?: Meters;
  empiricalAreaFactor?: number;
}

export interface ChargeSection {
  /** Concentración lineal [kg/m]. */
  linearCharge: number;
  length: Meters;
}

export interface FaceHoleCharge {
  bottom: ChargeSection;
  column: ChargeSection;
  /** Taco en la boca [m]. */
  stemming: Meters;
  mass: Kilograms;
}

export interface FaceHole {
  index: number;
  role: FaceHoleRole;
  /** Sección del arranque (1 = la más cercana al alivio); solo en `cut`. */
  square?: number;
  /** Anillo de ayudas (0 = el más exterior); solo en `stoping`. */
  ring?: number;
  collar: UV;
  /** Fondo en el plano del frente (incluye el look-out). */
  toe: UV;
  /** Profundidad a lo largo del eje de la galería [m]. */
  depth: Meters;
  /** Largo del taladro [m]. */
  length: Meters;
  diameter: Meters;
  /** Burden práctico de diseño [m] (0 en el alivio). */
  burden: Meters;
  /** null en el alivio (vacío). */
  charge: FaceHoleCharge | null;
  /** Número de retardo sugerido (1 = primero); null en el alivio. */
  delay: number | null;
}

export interface CutSquare {
  index: number;
  /** Burden teórico B [m]. */
  burden: Meters;
  /** Burden práctico Bp [m] (distancia al borde de la abertura anterior). */
  practicalBurden: Meters;
  /** Abertura disponible Ah [m] (en la sección 1, Φ). */
  opening: Meters;
  /** Lado de la sección W [m]. */
  side: Meters;
  /** Distancia del centro del arranque a cada taladro [m]. */
  radius: Meters;
  /** Concentración lineal usada [kg/m]. */
  linearCharge: number;
}

export type FaceWarningCode =
  | 'reliefNotLarger'
  | 'firstBurdenNonPositive'
  | 'cutChargeBelowRequired'
  | 'cutBurdenLimited'
  | 'depthLimited'
  | 'lifterBurdenOver06L'
  | 'holesOutsideProfile'
  | 'cutOutsideProfile'
  | 'contourChargeExceedsExplosive'
  | 'singleCutSquare';

export interface FaceWarning {
  code: FaceWarningCode;
  params?: Record<string, number>;
}

export interface FaceKpis {
  chargedHoles: number;
  reliefHoles: number;
  drilledMeters: Meters;
  totalCharge: Kilograms;
  /** Avance esperado I = 0,95·H [m]. */
  advance: Meters;
  /** Volumen in situ por disparo = área·I [m³]. */
  volume: number;
  powderFactor: number; // kg/m³
  chargePerAdvance: number; // kg/m
  drilledPerVolume: number; // m/m³
  drilledPerAdvance: number; // m/m
  /** Número empírico de taladros N = P/E + K·A. */
  empiricalHoleCount: number;
}

export interface FaceDesignResult {
  /** Φ = φ0·√n [m]. */
  equivalentReliefDiameter: Meters;
  /** Profundidad de perforación H usada [m] y la de Holmberg sin recortar. */
  depth: Meters;
  depthFromRelief: Meters;
  /** Error de perforación F = α·H + e' [m]. */
  drillingError: Meters;
  /** Concentración del explosivo acoplado q = ρe·π·d²/4 [kg/m]. */
  linearCharge: number;
  /** Carga lineal requerida en la sección 1, l1 [kg/m]. */
  firstSquareRequiredCharge: number;
  squares: CutSquare[];
  /** Burdens prácticos por grupo [m] y espaciamientos [m]. */
  groupBurden: Record<'lifter' | 'wall' | 'roof' | 'stopingUp' | 'stopingDown' | 'contour', Meters>;
  groupSpacing: Record<
    'lifter' | 'wall' | 'roof' | 'stopingUp' | 'stopingDown' | 'contour',
    Meters
  >;
  holes: FaceHole[];
  kpis: FaceKpis;
  warnings: FaceWarning[];
}

const DEG = Math.PI / 180;

/** Avance de Holmberg H = 0,15 + 34,1·Φ − 39,4·Φ² [m] (Φ en m). */
export function holmbergDepth(phi: Meters): Meters {
  return 0.15 + 34.1 * phi - 39.4 * phi * phi;
}

/** Concentración lineal de un explosivo acoplado q = ρe·π·d²/4 [kg/m]. */
export function coupledLinearCharge(density: KgPerM3, diameter: Meters): number {
  return (density * Math.PI * diameter * diameter) / 4;
}

/**
 * Carga lineal requerida en la primera sección (Holmberg):
 * l1 = 55·d·(B/Φ)^1,5·(B − Φ/2)·(c/0,4)/s_ANFO [kg/m], con d, B y Φ en m.
 */
export function firstSquareCharge(
  d: Meters,
  B: Meters,
  phi: Meters,
  c: number,
  rws: Ratio,
): number {
  return (55 * d * (B / phi) ** 1.5 * (B - phi / 2) * (c / 0.4)) / rws;
}

/** Burden de las secciones 2.. del arranque: B = 8,8·10⁻²·√(Ah·l·s_ANFO/(d·c)) [m]. */
export function cutSquareBurden(
  opening: Meters,
  l: number,
  rws: Ratio,
  d: Meters,
  c: number,
): Meters {
  return 8.8e-2 * Math.sqrt((opening * l * rws) / (d * c));
}

/**
 * Burden de zapateras, hastiales, techo y ayudas: B = 0,9·√(l·s_ANFO/(c̄·f·(S/B))) con
 * c̄ = c + 0,05 si B ≥ 1,4 m y c̄ = c + 0,07/B si no (se itera hasta converger).
 */
export function generalBurden(l: number, rws: Ratio, c: number, f: Ratio, sb: Ratio): Meters {
  let B = 0.9 * Math.sqrt((l * rws) / ((c + 0.05) * f * sb));
  for (let i = 0; i < 50; i++) {
    const cbar = B >= 1.4 ? c + 0.05 : c + 0.07 / B;
    const next = 0.9 * Math.sqrt((l * rws) / (cbar * f * sb));
    if (Math.abs(next - B) < 1e-12) return next;
    B = next;
  }
  return B;
}

function rot(c: UV, a: number, r: number): UV {
  return { u: c.u + r * Math.cos(a), v: c.v + r * Math.sin(a) };
}

function dist(a: UV, b: UV): number {
  return Math.hypot(a.u - b.u, a.v - b.v);
}

/** Diseña la ronda completa del frente. Función pura. */
export function designFaceRound(input: FaceDesignInput): FaceDesignResult {
  const warnings: FaceWarning[] = [];
  const { profile } = input;
  const d = input.holeDiameter;
  const n = Math.max(1, Math.round(input.reliefCount ?? 1));
  const phi0 = input.reliefDiameter;
  const c = input.rockConstant ?? 0.4;
  const alpha = input.angularDeviation ?? 0.01;
  const ePrime = input.collaringError ?? 0.02;
  const gamma = input.lookOutAngle ?? 3 * DEG;
  const smooth = input.smoothBlasting ?? true;
  const kSmooth = input.smoothBlastingK ?? 15;
  const smoothSB = input.smoothSpacingBurdenRatio ?? 0.8;
  const inset = input.contourInset ?? 0.15;
  const columnRatio = input.columnRatio ?? 0.5;
  const lifterColumnRatio = input.lifterColumnRatio ?? 0.7;
  const hbFactor = input.bottomChargeFactor ?? 1.25;
  const cutStemming = (input.cutStemmingDiameters ?? 10) * d;
  const s = input.rws;
  const groups = { ...SWEDISH_GROUP_CONSTANTS, ...input.groups };

  if (phi0 <= d)
    warnings.push({ code: 'reliefNotLarger', params: { reliefDiameter: phi0, holeDiameter: d } });

  // --- Profundidad y avance ---
  const phi = phi0 * Math.sqrt(n);
  const depthFromRelief = holmbergDepth(phi);
  let depth = depthFromRelief;
  for (const lim of [input.maxDrillLength, input.targetDepth]) {
    if (lim !== undefined && lim > 0 && lim < depth) depth = lim;
  }
  if (input.maxDrillLength !== undefined && input.maxDrillLength < depthFromRelief)
    warnings.push({ code: 'depthLimited', params: { depthFromRelief, depth } });
  const advance = 0.95 * depth;
  const F = alpha * depth + ePrime;
  const q = coupledLinearCharge(input.explosiveDensity, d);
  const lookOut = depth * Math.tan(gamma);
  const holeLengthLookOut = depth / Math.cos(gamma);

  // --- Arranque ---
  const B1 = 1.5 * phi;
  const B1p = 1.7 * phi - F;
  const l1 = firstSquareCharge(d, B1, phi, c, s);
  if (B1p <= 0) warnings.push({ code: 'firstBurdenNonPositive', params: { drillingError: F } });
  if (l1 > q)
    warnings.push({ code: 'cutChargeBelowRequired', params: { required: l1, available: q } });

  const squares: CutSquare[] = [];
  const sqrtH = Math.sqrt(depth);
  const center: UV = input.cutCenter ?? { u: 0, v: 0.4 * profile.height };
  if (B1p > 0) {
    squares.push({
      index: 1,
      burden: B1,
      practicalBurden: B1p,
      opening: phi,
      side: Math.SQRT2 * B1p,
      radius: B1p,
      linearCharge: Math.min(l1, q),
    });
    for (let i = 2; i < 20; i++) {
      const prev = squares[squares.length - 1] as CutSquare;
      // Ah_i = W_{i−1} − √2·F (en la sección 2 es √2·(B1p − F)).
      const Ah = prev.side - Math.SQRT2 * F;
      if (Ah <= 0) break;
      const B = cutSquareBurden(Ah, q, s, d, c);
      let Bp = B - F;
      if (Bp > 2 * Ah) {
        Bp = 2 * Ah;
        warnings.push({ code: 'cutBurdenLimited', params: { square: i } });
      }
      if (Bp <= 0) break;
      const W = Math.SQRT2 * (Bp + Ah / 2);
      if (W > sqrtH) break;
      squares.push({
        index: i,
        burden: B,
        practicalBurden: Bp,
        opening: Ah,
        side: W,
        radius: W / Math.SQRT2,
        linearCharge: q,
      });
    }
  }
  if (squares.length === 1) warnings.push({ code: 'singleCutSquare' });

  // --- Burdens de grupos ---
  const gB = (g: HoleGroupConstants): Meters =>
    generalBurden(q, s, c, g.fixation, g.spacingBurdenRatio);
  const Bl = gB(groups.lifter);
  const Bw = gB(groups.wall);
  const Br = gB(groups.roof);
  const Bsu = gB(groups.stopingUp);
  const Bsd = gB(groups.stopingDown);
  const lifterBp = Bl - depth * Math.sin(gamma) - F;
  const wallBp = Bw - depth * Math.sin(gamma) - F;
  const roofBp = Br - depth * Math.sin(gamma) - F;
  // Ayudas: sin look-out, Bp = B − F.
  const stopUpBp = Bsu - F;
  const stopDownBp = Bsd - F;
  if (Bl > 0.6 * depth)
    warnings.push({ code: 'lifterBurdenOver06L', params: { burden: Bl, limit: 0.6 * depth } });
  const contourS = kSmooth * d;
  const contourB = contourS / smoothSB;
  const contourQ = input.contourLinearCharge ?? 90 * d * d;
  if (smooth && contourQ > q)
    warnings.push({
      code: 'contourChargeExceedsExplosive',
      params: { required: contourQ, available: q },
    });

  const groupBurden = {
    lifter: lifterBp,
    wall: wallBp,
    roof: roofBp,
    stopingUp: stopUpBp,
    stopingDown: stopDownBp,
    contour: smooth ? contourB : wallBp,
  };
  const groupSpacing = {
    lifter: 0,
    wall: groups.wall.spacingBurdenRatio * wallBp,
    roof: groups.roof.spacingBurdenRatio * roofBp,
    stopingUp: groups.stopingUp.spacingBurdenRatio * stopUpBp,
    stopingDown: groups.stopingDown.spacingBurdenRatio * stopDownBp,
    contour: smooth ? contourS : groups.wall.spacingBurdenRatio * wallBp,
  };

  // --- Cargas ---
  const chargeFor = (
    role: FaceHoleRole,
    length: Meters,
    Bp: Meters,
    B: Meters,
    cutQ = q,
  ): FaceHoleCharge | null => {
    if (role === 'relief') return null;
    let stemming: Meters;
    let bottom: ChargeSection;
    let column: ChargeSection;
    if (role === 'cut') {
      stemming = Math.min(cutStemming, length);
      bottom = { linearCharge: cutQ, length: length - stemming };
      column = { linearCharge: 0, length: 0 };
    } else if (role === 'contour' && smooth) {
      stemming = Math.min(input.contourStemming ?? 0.5 * contourB, length);
      bottom = { linearCharge: 0, length: 0 };
      column = { linearCharge: contourQ, length: length - stemming };
    } else {
      const g = role === 'lifter' ? groups.lifter : role === 'roof' ? groups.roof : groups.wall;
      stemming = Math.min(g.stemmingFactor * B, length);
      const hb = Math.min(hbFactor * Bp, length - stemming);
      const ratio = role === 'lifter' ? lifterColumnRatio : columnRatio;
      bottom = { linearCharge: q, length: hb };
      column = { linearCharge: ratio * q, length: Math.max(0, length - stemming - hb) };
    }
    return {
      bottom,
      column,
      stemming,
      mass: bottom.linearCharge * bottom.length + column.linearCharge * column.length,
    };
  };

  const holes: Omit<FaceHole, 'index' | 'delay'>[] = [];
  const parallel = (
    role: FaceHoleRole,
    p: UV,
    Bp: Meters,
    B: Meters,
    extra: Partial<FaceHole> = {},
    cutQ?: number,
  ) =>
    holes.push({
      role,
      collar: p,
      toe: { u: p.u, v: p.v },
      depth,
      length: depth,
      diameter: role === 'relief' ? phi0 : d,
      burden: Bp,
      charge: chargeFor(role, depth, Bp, B, cutQ),
      ...extra,
    });
  const lookingOut = (role: FaceHoleRole, p: UV, dir: UV, Bp: Meters, B: Meters) =>
    holes.push({
      role,
      collar: { u: p.u, v: p.v },
      toe: { u: p.u + dir.u * lookOut, v: p.v + dir.v * lookOut },
      depth,
      length: holeLengthLookOut,
      diameter: d,
      burden: Bp,
      charge: chargeFor(role, holeLengthLookOut, Bp, B),
    });

  // Alivios: uno al centro o n en un círculo con separación entre centros reliefSpacing.
  if (n === 1) parallel('relief', center, 0, 0);
  else {
    const sp = input.reliefSpacing ?? 1.5 * phi0;
    const r = sp / (2 * Math.sin(Math.PI / n));
    for (let k = 0; k < n; k++) parallel('relief', rot(center, (2 * Math.PI * k) / n, r), 0, 0);
  }
  // Secciones del arranque, cada una girada 45° respecto a la anterior; la última queda con lados
  // paralelos a los ejes u, v.
  const last = squares.length;
  for (const sq of squares) {
    const base = (last - sq.index) % 2 === 0 ? Math.PI / 4 : 0;
    for (let k = 0; k < 4; k++) {
      const p = rot(center, base + (k * Math.PI) / 2, sq.radius);
      parallel('cut', p, sq.practicalBurden, sq.burden, { square: sq.index }, sq.linearCharge);
    }
  }
  const lastSq = squares[squares.length - 1];
  const cutHalf = lastSq ? lastSq.side / 2 : 0;
  const cutPolygon: UV[] = lastSq
    ? [
        { u: center.u - cutHalf, v: center.v - cutHalf },
        { u: center.u + cutHalf, v: center.v - cutHalf },
        { u: center.u + cutHalf, v: center.v + cutHalf },
        { u: center.u - cutHalf, v: center.v + cutHalf },
      ]
    : [];
  const cutKeepOut = 0.4 * Math.min(stopUpBp, stopDownBp);
  // Ayudas: fuera del último cuadrilátero y a más de 0,4·Bp de él. Fila de hastiales/techo y
  // contorno: solo fuera del cuadrilátero con un margen de 0,2·Bp (son necesarios para el perfil).
  const nearCut = (p: UV, margin: Meters): boolean =>
    cutPolygon.length > 0 &&
    (pointInProfile(p, cutPolygon) || distanceToBoundary(p, cutPolygon) < margin);
  const inCutZone = (p: UV): boolean => nearCut(p, cutKeepOut);
  const inCutCore = (p: UV): boolean => nearCut(p, 0.5 * cutKeepOut);
  if (
    cutPolygon.some(
      (p) => !pointInProfile(p, profile.points) || distanceToBoundary(p, profile.points) < inset,
    )
  )
    warnings.push({ code: 'cutOutsideProfile' });

  const cornerLifters = new Set<object>();
  // Distancia mínima entre taladros fuera del arranque (el conflicto con el arranque va aparte).
  const tooClose = (p: UV, min: Meters): boolean =>
    holes.some((h) => h.role !== 'cut' && h.role !== 'relief' && dist(h.collar, p) < min);

  // --- Zapateras ---
  const insetAll = offsetProfile(profile, inset);
  if (insetAll) {
    // Largo del tramo de piso (con emboquille hacia adentro).
    const floorSpan = floorRunLength(insetAll);
    const Wf = floorSpanWidth(profile);
    const N = Math.max(2, Math.floor((Wf + 2 * depth * Math.sin(gamma)) / Bl + 2));
    const lifters = floorSpan > 0 ? pointsAlong(insetAll, ['floor'], floorSpan / (N - 1)) : [];
    for (const p of lifters) {
      const side = Math.sign(p.u - center.u) || 1;
      const dir = p.endpoint ? { u: side * Math.SQRT1_2, v: -Math.SQRT1_2 } : p.normal;
      lookingOut('lifter', p, dir, lifterBp, Bl);
      if (p.endpoint) cornerLifters.add(holes[holes.length - 1] as object);
    }
  }

  // --- Contorno y fila de hastiales/techo ---
  const contourOffset = { wall: inset, roof: inset, floor: inset };
  const perimeter = offsetProfile(profile, contourOffset);
  let ringStart: Record<ProfileSegmentTag, Meters>;
  if (perimeter) {
    const contourPts = pointsAlong(perimeter, ['wall', 'roof'], groupSpacing.contour).filter(
      (p) => !p.endpoint,
    );
    for (const p of contourPts) {
      const role: FaceHoleRole = smooth ? 'contour' : p.tag === 'roof' ? 'roof' : 'wall';
      const Bp = smooth ? contourB : p.tag === 'roof' ? roofBp : wallBp;
      const B = smooth ? contourB : p.tag === 'roof' ? Br : Bw;
      if (!inCutCore(p)) lookingOut(role, p, p.normal, Bp, B);
    }
  }
  if (smooth) {
    // Fila de hastiales y techo a un burden de contorno hacia adentro (sin look-out propio).
    const buffer = offsetProfile(profile, {
      wall: inset + contourB,
      roof: inset + contourB,
      floor: inset + lifterBp,
    });
    if (buffer) {
      const sp = Math.min(groupSpacing.wall, groupSpacing.roof);
      for (const p of pointsAlong(buffer, ['wall', 'roof'], sp)) {
        const role: FaceHoleRole = p.tag === 'roof' ? 'roof' : 'wall';
        if (inCutCore(p) || tooClose(p, 0.5 * sp)) continue;
        parallel(
          role,
          { u: p.u, v: p.v },
          role === 'roof' ? roofBp : wallBp,
          role === 'roof' ? Br : Bw,
        );
      }
    }
    ringStart = {
      wall: inset + contourB + wallBp,
      roof: inset + contourB + roofBp,
      floor: inset + lifterBp,
    };
  } else {
    ringStart = { wall: inset + wallBp, roof: inset + roofBp, floor: inset + lifterBp };
  }

  // --- Ayudas: anillos sucesivos hacia el arranque ---
  const stopSpacing = Math.min(groupSpacing.stopingUp, groupSpacing.stopingDown);
  for (let k = 0; k < 50; k++) {
    const off = {
      wall: ringStart.wall + k * stopUpBp,
      roof: ringStart.roof + k * stopDownBp,
      floor: ringStart.floor + k * stopUpBp,
    };
    const ring = offsetProfile(profile, off);
    if (!ring) break;
    const pts = pointsAlong(ring, ['floor', 'wall', 'roof'], stopSpacing);
    if (pts.length === 0 || pts.every((p) => inCutZone(p))) break;
    for (const p of pts) {
      if (inCutZone(p) || tooClose(p, 0.5 * stopSpacing)) continue;
      const above = p.v > center.v;
      parallel('stoping', { u: p.u, v: p.v }, above ? stopDownBp : stopUpBp, above ? Bsd : Bsu, {
        ring: k,
      });
    }
  }

  // --- Taladros fuera del perfil ---
  const inside = holes.filter((h) => pointInProfile(h.collar, profile.points));
  if (inside.length < holes.length)
    warnings.push({ code: 'holesOutsideProfile', params: { count: holes.length - inside.length } });

  // --- Secuencia: arranque (uno por taladro, de adentro hacia afuera), ayudas por anillo
  // (del interior al exterior), hastiales, techo y contorno, zapateras y al final las esquinas. ---
  const ordered: FaceHole[] = [];
  let delay = 0;
  const push = (h: Omit<FaceHole, 'index' | 'delay'>, dl: number | null) =>
    ordered.push({ ...h, index: ordered.length + 1, delay: dl });
  for (const h of inside.filter((x) => x.role === 'relief')) push(h, null);
  const cuts = inside
    .filter((x) => x.role === 'cut')
    .sort((a, b) => (a.square ?? 0) - (b.square ?? 0));
  for (const h of cuts) push(h, ++delay);
  const stoping = inside.filter((x) => x.role === 'stoping');
  const rings = [...new Set(stoping.map((h) => h.ring ?? 0))].sort((a, b) => b - a);
  for (const r of rings) {
    delay++;
    for (const h of stoping.filter((x) => (x.ring ?? 0) === r)) push(h, delay);
  }
  const walls = inside.filter((x) => x.role === 'wall');
  if (walls.length) {
    delay++;
    for (const h of walls) push(h, delay);
  }
  const roofContour = inside.filter((x) => x.role === 'roof' || x.role === 'contour');
  if (roofContour.length) {
    delay++;
    for (const h of roofContour) push(h, delay);
  }
  const lifters = inside.filter((x) => x.role === 'lifter');
  const isCorner = (h: Omit<FaceHole, 'index' | 'delay'>) => cornerLifters.has(h);
  const mid = lifters.filter((h) => !isCorner(h));
  const corners = lifters.filter(isCorner);
  if (mid.length) {
    delay++;
    for (const h of mid) push(h, delay);
  }
  if (corners.length) {
    delay++;
    for (const h of corners) push(h, delay);
  }

  // --- KPIs ---
  const charged = ordered.filter((h) => h.charge);
  const drilledMeters = ordered.reduce((acc, h) => acc + h.length, 0);
  const totalCharge = charged.reduce((acc, h) => acc + (h.charge?.mass ?? 0), 0);
  const volume = profile.area * advance;
  const E = input.empiricalPerimeterSpacing ?? 0.6;
  const K = input.empiricalAreaFactor ?? 1.5;
  const kpis: FaceKpis = {
    chargedHoles: charged.length,
    reliefHoles: ordered.length - charged.length,
    drilledMeters,
    totalCharge,
    advance,
    volume,
    powderFactor: volume > 0 ? totalCharge / volume : 0,
    chargePerAdvance: advance > 0 ? totalCharge / advance : 0,
    drilledPerVolume: volume > 0 ? drilledMeters / volume : 0,
    drilledPerAdvance: advance > 0 ? drilledMeters / advance : 0,
    empiricalHoleCount: profile.perimeter / E + K * profile.area,
  };

  return {
    equivalentReliefDiameter: phi,
    depth,
    depthFromRelief,
    drillingError: F,
    linearCharge: q,
    firstSquareRequiredCharge: l1,
    squares,
    groupBurden,
    groupSpacing,
    holes: ordered,
    kpis,
    warnings,
  };
}

/** Largo total de los segmentos de piso. */
function floorRunLength(p: { points: UV[]; tags: ProfileSegmentTag[] }): Meters {
  let s = 0;
  const n = p.points.length;
  for (let i = 0; i < n; i++) {
    if (p.tags[i] !== 'floor') continue;
    const a = p.points[i] as UV;
    const b = p.points[(i + 1) % n] as UV;
    s += Math.hypot(b.u - a.u, b.v - a.v);
  }
  return s;
}

/** Ancho W del piso: extensión en u de los segmentos de piso. */
function floorSpanWidth(p: ExcavationProfile): Meters {
  let min = Infinity;
  let max = -Infinity;
  const n = p.points.length;
  for (let i = 0; i < n; i++) {
    if (p.tags[i] !== 'floor') continue;
    for (const q of [p.points[i], p.points[(i + 1) % n]]) {
      if (!q) continue;
      min = Math.min(min, q.u);
      max = Math.max(max, q.u);
    }
  }
  return max > min ? max - min : p.width;
}
