import type { KgPerM3, Kilograms, Meters, Radians, Ratio, Seconds } from '../model/types';
import { coupledLinearCharge } from './faceDesign';
import { distanceToSegment, signedArea, type UV } from './profiles';

/**
 * Diseño de anillos (abanicos) en el plano del anillo (Fase 3, S4; `R4 §4.2` funciones 1–4 y 6).
 *
 * Plano local: u horizontal a través de la galería, v arriba. Ángulo de un taladro θ medido desde
 * la vertical hacia arriba (θ = 0) girando hacia +u (θ = π/2 horizontal a la derecha, θ = ±π hacia
 * abajo), θ ∈ (−π, π]. Reglas `[CURSO]`/`[GENERAL]` sin verificar: todo es parámetro editable.
 */

export interface AngleZone {
  /** Centro de la zona [rad], misma convención que θ. */
  center: Radians;
  /** Semiancho [rad]. */
  halfWidth: Radians;
}

export interface RingDesignInput {
  /** Centro de perforación (pivote del brazo) [m]. */
  pivot: UV;
  /** Contorno del tajeo en el plano del anillo (polilínea cerrada). */
  boundary: readonly UV[];
  /** Perfil de la galería de perforación (polilínea cerrada); los taladros se emboquillan en él. */
  drive?: readonly UV[];
  /** Abanico por espaciamiento de pie constante o por ángulo igual. */
  mode: 'toeSpacing' | 'angle';
  /** Espaciamiento de pie S_toe [m] (modo `toeSpacing`). */
  toeSpacing?: Meters;
  /** Paso angular Δθ [rad] (modo `angle`). */
  angleStep?: Radians;
  /** Stand-off del fondo contra el contorno, medido sobre el taladro [m] (0,3). */
  standOff?: Meters;
  /** Largo máximo por equipo [m]; los taladros más largos se recortan. */
  maxLength?: Meters;
  /** Zonas sin taladros (por defecto ±30° alrededor de la vertical hacia abajo). */
  deadZones?: readonly AngleZone[];
  /** Ángulo mínimo entre taladros contiguos [rad] (2°). */
  minAngle?: Radians;
  /** Ángulo de arranque del barrido si no hay zonas muertas [rad] (0). */
  startAngle?: Radians;
  holeDiameter: Meters;
  /** Densidad del explosivo [kg/m³]. */
  explosiveDensity: KgPerM3;
  /** Collar sin carga: la carga empieza donde la distancia perpendicular al vecino ≥ k·S_toe. */
  kLongCollar?: Ratio;
  kShortCollar?: Ratio;
  /** Collar sin carga mínimo [m]; por defecto max(1,0 m; 20·d). */
  minCollar?: Meters;
  /** Burden entre anillos [m] y densidad de la roca [kg/m³] para los KPIs. */
  burden?: Meters;
  rockDensity?: KgPerM3;
  /** Secuencia: ángulo del centro (cara libre o slot) [rad] (0), retardo inicial e intervalo [s]. */
  sequenceCenter?: Radians;
  firstDelay?: Seconds;
  delayInterval?: Seconds;
}

export interface RingHole {
  index: number;
  /** θ [rad]. */
  angle: Radians;
  collar: UV;
  toe: UV;
  length: Meters;
  diameter: Meters;
  /** true si se recortó por el largo máximo. */
  truncated: boolean;
  collarType: 'long' | 'short';
  /** Collar sin carga [m]. */
  unchargedCollar: Meters;
  chargedLength: Meters;
  mass: Kilograms;
  /** Tiempo de detonación sugerido dentro del anillo [s]. */
  delay: Seconds;
}

export interface RingKpis {
  drilledMeters: Meters;
  chargedMeters: Meters;
  totalCharge: Kilograms;
  /** Área de la sección del anillo sin la galería [m²]. */
  area: number;
  volume: number;
  tonnes: number;
  powderFactor: number; // kg/m³
  chargePerTonne: number; // kg/t
  drilledPerTonne: number; // m/t
}

export interface RingDesignResult {
  holes: RingHole[];
  /** Concentración lineal q = ρe·π·d²/4 [kg/m]. */
  linearCharge: number;
  kpis: RingKpis;
}

const TAU = 2 * Math.PI;

/** Normaliza un ángulo a (−π, π]. */
export function wrapAngle(a: Radians): Radians {
  let x = ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  if (x === -Math.PI) x = Math.PI;
  return x;
}

/** θ de una dirección del plano (0 arriba, π/2 a +u). */
export function directionAngle(du: number, dv: number): Radians {
  return Math.atan2(du, dv);
}

function inZones(theta: Radians, zones: readonly AngleZone[]): boolean {
  return zones.some((z) => Math.abs(wrapAngle(theta - z.center)) <= z.halfWidth);
}

/** Primer corte del rayo origin + t·dir (t > eps) con la polilínea cerrada; null si no corta. */
export function rayHit(origin: UV, dir: UV, polygon: readonly UV[]): Meters | null {
  let best = Infinity;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    if (!a || !b) continue;
    const eu = b.u - a.u;
    const ev = b.v - a.v;
    const den = dir.u * ev - dir.v * eu;
    if (Math.abs(den) < 1e-15) continue;
    const wu = a.u - origin.u;
    const wv = a.v - origin.v;
    const t = (wu * ev - wv * eu) / den;
    const s = (wu * dir.v - wv * dir.u) / den;
    if (t > 1e-9 && s >= -1e-12 && s <= 1 + 1e-12 && t < best) best = t;
  }
  return Number.isFinite(best) ? best : null;
}

interface RayHole {
  angle: Radians;
  collar: UV;
  toe: UV;
  length: Meters;
  truncated: boolean;
}

/** Diseña un anillo. Función pura. */
export function designRing(input: RingDesignInput): RingDesignResult {
  const standOff = input.standOff ?? 0.3;
  const zones = input.deadZones ?? [{ center: Math.PI, halfWidth: Math.PI / 6 }];
  const minAngle = input.minAngle ?? (2 * Math.PI) / 180;
  const d = input.holeDiameter;
  const q = coupledLinearCharge(input.explosiveDensity, d);

  const rayAt = (theta: Radians): RayHole | null => {
    const dir = { u: Math.sin(theta), v: Math.cos(theta) };
    const hit = rayHit(input.pivot, dir, input.boundary);
    if (hit === null) return null;
    const c0 = input.drive ? (rayHit(input.pivot, dir, input.drive) ?? 0) : 0;
    const tToe = hit - standOff;
    if (tToe <= c0 + 1e-6) return null;
    let length = tToe - c0;
    let truncated = false;
    if (input.maxLength !== undefined && length > input.maxLength) {
      length = input.maxLength;
      truncated = true;
    }
    const collar = { u: input.pivot.u + c0 * dir.u, v: input.pivot.v + c0 * dir.v };
    return {
      angle: wrapAngle(theta),
      collar,
      toe: { u: collar.u + length * dir.u, v: collar.v + length * dir.v },
      length,
      truncated,
    };
  };

  // Barrido horario desde el final de la primera zona muerta (o desde startAngle).
  const z0 = zones[0];
  const start = z0 ? z0.center + z0.halfWidth : (input.startAngle ?? 0);
  const fullCircle = zones.length === 0;
  const raw: RayHole[] = [];
  if (input.mode === 'angle') {
    const step = input.angleStep ?? (5 * Math.PI) / 180;
    for (let th = start; th < start + TAU - 1e-9; th += step) {
      if (inZones(th, zones) && !(z0 && Math.abs(th - start) < 1e-12)) continue;
      const h = rayAt(th);
      if (h) raw.push(h);
    }
  } else {
    const S = input.toeSpacing ?? 3;
    const dTheta = 0.0005;
    let last: RayHole | null = null;
    let pending: RayHole | null = null; // último rayo válido no aceptado
    for (let th = start; th < start + TAU - 1e-9; th += dTheta) {
      const blocked = inZones(th, zones) && !(z0 && Math.abs(th - start) < 1e-12);
      const h = blocked ? null : rayAt(th);
      if (!h) {
        // Cierre de un tramo: se agrega el último rayo si deja al menos S/2.
        if (
          last &&
          pending &&
          Math.hypot(pending.toe.u - last.toe.u, pending.toe.v - last.toe.v) >= 0.5 * S
        ) {
          raw.push(pending);
        }
        last = null;
        pending = null;
        continue;
      }
      if (!last || Math.hypot(h.toe.u - last.toe.u, h.toe.v - last.toe.v) >= S) {
        raw.push(h);
        last = h;
        pending = null;
      } else pending = h;
    }
    if (last && pending) {
      const first = raw[0];
      const gapLast = Math.hypot(pending.toe.u - last.toe.u, pending.toe.v - last.toe.v);
      const closes =
        fullCircle &&
        first &&
        Math.hypot(pending.toe.u - first.toe.u, pending.toe.v - first.toe.v) < 0.5 * S;
      if (gapLast >= 0.5 * S && !closes) raw.push(pending);
    }
  }

  // Ángulo mínimo entre contiguos.
  const kept: RayHole[] = [];
  for (const h of raw) {
    const prev = kept[kept.length - 1];
    if (prev && Math.abs(wrapAngle(h.angle - prev.angle)) < minAngle) continue;
    kept.push(h);
  }

  // Collar sin carga alterno largo/corto.
  const Sref =
    input.toeSpacing ??
    (kept.length > 1
      ? kept
          .slice(1)
          .reduce(
            (s, h, i) =>
              s +
              Math.hypot(
                h.toe.u - (kept[i] as RayHole).toe.u,
                h.toe.v - (kept[i] as RayHole).toe.v,
              ),
            0,
          ) /
        (kept.length - 1)
      : 0);
  const kLong = input.kLongCollar ?? 0.55;
  const kShort = input.kShortCollar ?? 0.35;
  const minCollar = input.minCollar ?? Math.max(1.0, 20 * d);
  const n = kept.length;
  const neighbours = (i: number): RayHole[] => {
    const out: RayHole[] = [];
    const prev = i > 0 ? kept[i - 1] : fullCircle && n > 2 ? kept[n - 1] : undefined;
    const next = i < n - 1 ? kept[i + 1] : fullCircle && n > 2 ? kept[0] : undefined;
    if (prev) out.push(prev);
    if (next) out.push(next);
    return out;
  };

  const center = input.sequenceCenter ?? 0;
  const interval = input.delayInterval ?? 0.025;
  const first = input.firstDelay ?? 0;
  const rank = kept
    .map((h, i) => ({ i, a: Math.abs(wrapAngle(h.angle - center)) }))
    .sort((x, y) => x.a - y.a);
  const order = new Map<number, number>();
  rank.forEach((r, k) => order.set(r.i, k));

  const holes: RingHole[] = kept.map((h, i) => {
    const long = i % 2 === 0;
    const k = long ? kLong : kShort;
    const dir = { u: (h.toe.u - h.collar.u) / h.length, v: (h.toe.v - h.collar.v) / h.length };
    const nb = neighbours(i);
    let sStar = h.length;
    const step = 0.05;
    for (let s = 0; s <= h.length + 1e-9; s += step) {
      const p = { u: h.collar.u + s * dir.u, v: h.collar.v + s * dir.v };
      if (nb.every((o) => distanceToSegment(p, o.collar, o.toe) >= k * Sref)) {
        sStar = s;
        break;
      }
    }
    const uncharged = Math.min(h.length, Math.max(minCollar, sStar));
    const chargedLength = h.length - uncharged;
    return {
      index: i + 1,
      angle: h.angle,
      collar: h.collar,
      toe: h.toe,
      length: h.length,
      diameter: d,
      truncated: h.truncated,
      collarType: long ? 'long' : 'short',
      unchargedCollar: uncharged,
      chargedLength,
      mass: chargedLength * q,
      delay: first + (order.get(i) ?? 0) * interval,
    };
  });

  const drilledMeters = holes.reduce((s, h) => s + h.length, 0);
  const chargedMeters = holes.reduce((s, h) => s + h.chargedLength, 0);
  const totalCharge = chargedMeters * q;
  const area = Math.max(
    0,
    Math.abs(signedArea(input.boundary)) - (input.drive ? Math.abs(signedArea(input.drive)) : 0),
  );
  const volume = (input.burden ?? 0) * area;
  const tonnes = (volume * (input.rockDensity ?? 0)) / 1000;
  return {
    holes,
    linearCharge: q,
    kpis: {
      drilledMeters,
      chargedMeters,
      totalCharge,
      area,
      volume,
      tonnes,
      powderFactor: volume > 0 ? totalCharge / volume : 0,
      chargePerTonne: tonnes > 0 ? totalCharge / tonnes : 0,
      drilledPerTonne: tonnes > 0 ? drilledMeters / tonnes : 0,
    },
  };
}

export interface RingPlacement {
  index: number;
  /** Distancia a lo largo de la galería desde el primer anillo [m]. */
  offset: Meters;
  /** Retardo a sumar a los taladros del anillo [s] (retirada desde el slot). */
  delayOffset: Seconds;
}

/** Réplica de anillos a lo largo de la galería cada `burden`, en retirada desde el slot. */
export function replicateRings(
  count: number,
  burden: Meters,
  options: { firstOffset?: Meters; ringInterval?: Seconds } = {},
): RingPlacement[] {
  const first = options.firstOffset ?? 0;
  const interval = options.ringInterval ?? 0;
  return Array.from({ length: Math.max(0, Math.floor(count)) }, (_, i) => ({
    index: i,
    offset: first + i * burden,
    delayOffset: i * interval,
  }));
}
