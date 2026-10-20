import type { Meters } from '../model/types';

/**
 * Perfiles de excavación en el plano del frente (Fase 3, S1/S2; `R4 §4.1` función 1).
 *
 * Coordenadas locales 2D del plano: u = horizontal a través del frente (positivo a la derecha
 * mirando hacia el avance), v = hacia arriba, origen en el centro del piso. Los perfiles son
 * polilíneas cerradas (sin repetir el primer vértice) en sentido antihorario, con una etiqueta por
 * segmento (segmento i = vértice i → vértice i+1).
 */

/** Punto del plano local del frente o del anillo [m]. */
export interface UV {
  u: Meters;
  v: Meters;
}

export type ProfileSegmentTag = 'floor' | 'wall' | 'roof';

export type ProfileKind =
  'rectangular' | 'arched' | 'horseshoe' | 'roundedShoulders' | 'circular' | 'custom';

export interface ExcavationProfile {
  kind: ProfileKind;
  /** Vértices de la polilínea cerrada, antihoraria, sin repetir el primero. */
  points: UV[];
  /** Etiqueta del segmento i (points[i] → points[i+1 mod n]). */
  tags: ProfileSegmentTag[];
  /** Área de la sección [m²]. */
  area: number;
  /** Perímetro [m]. */
  perimeter: Meters;
  /** Ancho máximo [m]. */
  width: Meters;
  /** Alto máximo [m]. */
  height: Meters;
}

/** Cuerda máxima por defecto al muestrear arcos [m]. */
export const DEFAULT_MAX_CHORD: Meters = 0.1;

interface Builder {
  points: UV[];
  tags: ProfileSegmentTag[];
}

/** Agrega el segmento recto desde el último punto hasta `p` (el punto de partida va aparte). */
function lineTo(b: Builder, p: UV, tag: ProfileSegmentTag): void {
  b.tags.push(tag);
  b.points.push(p);
}

/** Arco de centro c y radio r desde el ángulo a0 hasta a1 (ángulos matemáticos), sin el punto inicial. */
function arcTo(
  b: Builder,
  c: UV,
  r: Meters,
  a0: number,
  a1: number,
  tag: ProfileSegmentTag,
  maxChord: Meters,
): void {
  const sweep = a1 - a0;
  // Cuerda = 2r·sin(Δ/2) ≤ maxChord.
  const maxStep = 2 * Math.asin(Math.min(1, maxChord / (2 * r)));
  // Número par de cuerdas: los arcos simétricos incluyen su punto medio (la clave de la bóveda).
  const n = 2 * Math.max(1, Math.ceil(Math.abs(sweep) / maxStep / 2));
  for (let i = 1; i <= n; i++) {
    const a = a0 + (sweep * i) / n;
    lineTo(b, { u: c.u + r * Math.cos(a), v: c.v + r * Math.sin(a) }, tag);
  }
}

/** Cierra el constructor: el último punto coincide con el primero y se elimina. */
function finish(kind: ProfileKind, b: Builder): ExcavationProfile {
  const last = b.points[b.points.length - 1];
  const first = b.points[0];
  if (last && first && Math.hypot(last.u - first.u, last.v - first.v) < 1e-9) b.points.pop();
  return makeProfile(kind, b.points, b.tags);
}

/** Construye un perfil a partir de vértices y etiquetas (calcula área, perímetro y extensión). */
export function makeProfile(
  kind: ProfileKind,
  points: readonly UV[],
  tags: readonly ProfileSegmentTag[],
): ExcavationProfile {
  if (points.length < 3) throw new Error('Un perfil necesita al menos 3 vértices');
  if (tags.length !== points.length) throw new Error('Debe haber una etiqueta por segmento');
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const p of points) {
    minU = Math.min(minU, p.u);
    maxU = Math.max(maxU, p.u);
    minV = Math.min(minV, p.v);
    maxV = Math.max(maxV, p.v);
  }
  return {
    kind,
    points: points.map((p) => ({ u: p.u, v: p.v })),
    tags: [...tags],
    area: Math.abs(signedArea(points)),
    perimeter: perimeterOf(points),
    width: maxU - minU,
    height: maxV - minV,
  };
}

/** Rectangular de ancho W y alto H. */
export function rectangular(W: Meters, H: Meters): ExcavationProfile {
  const b: Builder = { points: [{ u: -W / 2, v: 0 }], tags: [] };
  lineTo(b, { u: W / 2, v: 0 }, 'floor');
  lineTo(b, { u: W / 2, v: H }, 'wall');
  lineTo(b, { u: -W / 2, v: H }, 'roof');
  lineTo(b, { u: -W / 2, v: 0 }, 'wall');
  return finish('rectangular', b);
}

/** Arco-D (bóveda semicircular): ancho W, hastiales de alto hw, radio R = W/2. Alto = hw + W/2. */
export function arched(
  W: Meters,
  hw: Meters,
  maxChord: Meters = DEFAULT_MAX_CHORD,
): ExcavationProfile {
  const R = W / 2;
  const b: Builder = { points: [{ u: -W / 2, v: 0 }], tags: [] };
  lineTo(b, { u: W / 2, v: 0 }, 'floor');
  lineTo(b, { u: W / 2, v: hw }, 'wall');
  arcTo(b, { u: 0, v: hw }, R, 0, Math.PI, 'roof', maxChord);
  lineTo(b, { u: -W / 2, v: 0 }, 'wall');
  return finish('arched', b);
}

/**
 * Bóveda de arco rebajado (segmental, «herradura» de hastiales rectos): ancho W, hastiales hw y
 * flecha f, con R = (W²/4 + f²)/(2f) y centro en v = hw + f − R. Alto = hw + f. f = W/2 es el arco-D.
 */
export function horseshoe(
  W: Meters,
  hw: Meters,
  f: Meters,
  maxChord: Meters = DEFAULT_MAX_CHORD,
): ExcavationProfile {
  if (!(f > 0) || f > W / 2 + 1e-12) throw new Error('La flecha debe cumplir 0 < f ≤ W/2');
  const R = ((W * W) / 4 + f * f) / (2 * f);
  const cv = hw + f - R;
  const a0 = Math.atan2(hw - cv, W / 2);
  const b: Builder = { points: [{ u: -W / 2, v: 0 }], tags: [] };
  lineTo(b, { u: W / 2, v: 0 }, 'floor');
  lineTo(b, { u: W / 2, v: hw }, 'wall');
  arcTo(b, { u: 0, v: cv }, R, a0, Math.PI - a0, 'roof', maxChord);
  lineTo(b, { u: -W / 2, v: 0 }, 'wall');
  return finish('horseshoe', b);
}

/** Rectangular con hombros redondeados de radio Ar (Ar ≤ W/2 y Ar ≤ H). */
export function roundedShoulders(
  W: Meters,
  H: Meters,
  Ar: Meters,
  maxChord: Meters = DEFAULT_MAX_CHORD,
): ExcavationProfile {
  if (!(Ar > 0) || Ar > W / 2 || Ar > H) throw new Error('Radio de hombro fuera de rango');
  const b: Builder = { points: [{ u: -W / 2, v: 0 }], tags: [] };
  lineTo(b, { u: W / 2, v: 0 }, 'floor');
  lineTo(b, { u: W / 2, v: H - Ar }, 'wall');
  arcTo(b, { u: W / 2 - Ar, v: H - Ar }, Ar, 0, Math.PI / 2, 'roof', maxChord);
  if (W / 2 - Ar > 1e-12) lineTo(b, { u: -W / 2 + Ar, v: H }, 'roof');
  arcTo(b, { u: -W / 2 + Ar, v: H - Ar }, Ar, Math.PI / 2, Math.PI, 'roof', maxChord);
  if (H - Ar > 1e-12) lineTo(b, { u: -W / 2, v: 0 }, 'wall');
  return finish('roundedShoulders', b);
}

/**
 * Circular de radio R, centro en (0, R) (el origen queda en el punto más bajo). Etiquetas por la
 * posición del punto medio del segmento: piso por debajo de 45° bajo la horizontal (v < R·(1 − sin 45°)),
 * techo por encima del centro, hastial en el resto.
 */
export function circular(R: Meters, maxChord: Meters = DEFAULT_MAX_CHORD): ExcavationProfile {
  const maxStep = 2 * Math.asin(Math.min(1, maxChord / (2 * R)));
  const n = Math.max(8, Math.ceil((2 * Math.PI) / maxStep));
  const points: UV[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    points.push({ u: R * Math.cos(a), v: R + R * Math.sin(a) });
  }
  const floorLimit = R * (1 - Math.SQRT1_2);
  const tags = points.map((p, i): ProfileSegmentTag => {
    const q = points[(i + 1) % n] ?? p;
    const mv = (p.v + q.v) / 2;
    return mv < floorLimit ? 'floor' : mv > R ? 'roof' : 'wall';
  });
  return makeProfile('circular', points, tags);
}

// ===================== Utilidades geométricas =====================

export function signedArea(points: readonly UV[]): number {
  let s = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    if (!a || !b) continue;
    s += a.u * b.v - b.u * a.v;
  }
  return s / 2;
}

export function perimeterOf(points: readonly UV[]): Meters {
  let s = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    if (!a || !b) continue;
    s += Math.hypot(b.u - a.u, b.v - a.v);
  }
  return s;
}

/** Punto en polígono (regla par-impar). */
export function pointInProfile(p: UV, points: readonly UV[]): boolean {
  let inside = false;
  const n = points.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = points[i];
    const b = points[j];
    if (!a || !b) continue;
    if (a.v > p.v !== b.v > p.v && p.u < ((b.u - a.u) * (p.v - a.v)) / (b.v - a.v) + a.u) {
      inside = !inside;
    }
  }
  return inside;
}

/** Distancia de un punto al segmento ab. */
export function distanceToSegment(p: UV, a: UV, b: UV): Meters {
  const du = b.u - a.u;
  const dv = b.v - a.v;
  const len2 = du * du + dv * dv;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.u - a.u) * du + (p.v - a.v) * dv) / len2)) : 0;
  return Math.hypot(p.u - (a.u + t * du), p.v - (a.v + t * dv));
}

/** Distancia de un punto al borde de la polilínea cerrada. */
export function distanceToBoundary(p: UV, points: readonly UV[]): Meters {
  let best = Infinity;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    if (!a || !b) continue;
    best = Math.min(best, distanceToSegment(p, a, b));
  }
  return best;
}

/**
 * Desplaza el perfil hacia adentro: cada segmento se mueve `distance(tag)` a lo largo de su
 * normal interior y se toma la intersección de los semiplanos (Sutherland–Hodgman). Exacto para
 * perfiles convexos (todas las plantillas lo son); en un perfil cóncavo importado da la envolvente
 * de los semiplanos, que puede quedar corta. Devuelve null si el perfil desaparece.
 * Una distancia por etiqueta permite, por ejemplo, separar más el piso que los hastiales.
 */
export function offsetProfile(
  profile: Pick<ExcavationProfile, 'points' | 'tags'>,
  distance: Meters | Partial<Record<ProfileSegmentTag, Meters>>,
): { points: UV[]; tags: ProfileSegmentTag[] } | null {
  const pts = profile.points;
  const n = pts.length;
  const ccw = signedArea(pts) > 0 ? 1 : -1;
  const dist = (tag: ProfileSegmentTag): number =>
    typeof distance === 'number' ? distance : (distance[tag] ?? 0);
  let poly: { p: UV; tag: ProfileSegmentTag }[] = pts.map((p, i) => ({
    p,
    tag: profile.tags[i] ?? 'wall',
  }));
  for (let k = 0; k < n; k++) {
    const a = pts[k];
    const b = pts[(k + 1) % n];
    const tag = profile.tags[k] ?? 'wall';
    if (!a || !b) continue;
    const len = Math.hypot(b.u - a.u, b.v - a.v);
    if (len < 1e-12) continue;
    // Normal interior: a la izquierda del segmento si el polígono es antihorario.
    const nu = (-(b.v - a.v) / len) * ccw;
    const nv = ((b.u - a.u) / len) * ccw;
    const d = dist(tag);
    const c = nu * (a.u + nu * d) + nv * (a.v + nv * d); // semiplano: nu·u + nv·v ≥ c
    const side = (p: UV): number => nu * p.u + nv * p.v - c;
    const out: { p: UV; tag: ProfileSegmentTag }[] = [];
    const m = poly.length;
    for (let i = 0; i < m; i++) {
      const P = poly[i];
      const Q = poly[(i + 1) % m];
      if (!P || !Q) continue;
      const sp = side(P.p);
      const sq = side(Q.p);
      const pin = sp >= -1e-12;
      const qin = sq >= -1e-12;
      const cross = (): UV => {
        const t = sp / (sp - sq);
        return { u: P.p.u + t * (Q.p.u - P.p.u), v: P.p.v + t * (Q.p.v - P.p.v) };
      };
      if (pin && qin) out.push(P);
      else if (pin && !qin) {
        out.push(P);
        out.push({ p: cross(), tag });
      } else if (!pin && qin) out.push({ p: cross(), tag: P.tag });
    }
    poly = dedupe(out);
    if (poly.length < 3) return null;
  }
  if (Math.abs(signedArea(poly.map((x) => x.p))) < 1e-9) return null;
  return { points: poly.map((x) => x.p), tags: poly.map((x) => x.tag) };
}

function dedupe<T extends { p: UV }>(xs: T[]): T[] {
  const out: T[] = [];
  for (const x of xs) {
    const last = out[out.length - 1];
    if (last && Math.hypot(last.p.u - x.p.u, last.p.v - x.p.v) < 1e-9) continue;
    out.push(x);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (
    out.length > 1 &&
    first &&
    last &&
    Math.hypot(first.p.u - last.p.u, first.p.v - last.p.v) < 1e-9
  )
    out.pop();
  return out;
}

/** Punto colocado sobre el perfil. */
export interface PlacedPoint extends UV {
  tag: ProfileSegmentTag;
  /** Normal exterior unitaria del segmento donde cae el punto. */
  normal: UV;
  /** Índice del tramo continuo (corrida de segmentos con etiquetas elegidas). */
  run: number;
  /** true si es un extremo del tramo (un tramo abierto tiene dos). */
  endpoint: boolean;
}

/**
 * Coloca puntos a espaciamiento de arco constante sobre los tramos continuos del perfil cuyas
 * etiquetas están en `tags`. Cada tramo abierto lleva puntos en sus dos extremos y n intervalos
 * iguales con n = ⌈L/spacing⌉ (espaciamiento real ≤ el pedido); si todo el perfil está elegido se
 * reparte en un lazo cerrado. La normal es exterior.
 */
export function pointsAlong(
  profile: Pick<ExcavationProfile, 'points' | 'tags'>,
  tags: readonly ProfileSegmentTag[],
  spacing: Meters,
): PlacedPoint[] {
  const pts = profile.points;
  const n = pts.length;
  if (!(spacing > 0) || n < 3) return [];
  const ccw = signedArea(pts) > 0 ? 1 : -1;
  const sel = (i: number): boolean => tags.includes(profile.tags[i] ?? 'wall');
  const segs: number[][] = [];
  if (Array.from({ length: n }, (_, i) => sel(i)).every(Boolean)) {
    segs.push(Array.from({ length: n }, (_, i) => i));
  } else {
    // Arranca en un segmento no elegido para que ningún tramo quede partido en el cierre.
    let start = 0;
    while (sel(start)) start++;
    let cur: number[] = [];
    for (let k = 1; k <= n; k++) {
      const i = (start + k) % n;
      if (sel(i)) cur.push(i);
      else if (cur.length) {
        segs.push(cur);
        cur = [];
      }
    }
    if (cur.length) segs.push(cur);
  }
  const closedLoop = segs.length === 1 && segs[0]?.length === n;
  const out: PlacedPoint[] = [];
  segs.forEach((run, r) => {
    const lens = run.map((i) => {
      const a = pts[i] as UV;
      const b = pts[(i + 1) % n] as UV;
      return Math.hypot(b.u - a.u, b.v - a.v);
    });
    const total = lens.reduce((s, x) => s + x, 0);
    if (total <= 0) return;
    const intervals = Math.max(1, Math.ceil(total / spacing - 1e-9));
    const count = closedLoop ? intervals : intervals + 1;
    let segIdx = 0;
    let acc = 0;
    for (let k = 0; k < count; k++) {
      const s = (total * k) / intervals;
      while (segIdx < run.length - 1 && acc + (lens[segIdx] ?? 0) < s - 1e-12) {
        acc += lens[segIdx] ?? 0;
        segIdx++;
      }
      const i = run[segIdx] as number;
      const a = pts[i] as UV;
      const b = pts[(i + 1) % n] as UV;
      const L = lens[segIdx] ?? 1;
      const t = L > 0 ? Math.min(1, Math.max(0, (s - acc) / L)) : 0;
      out.push({
        u: a.u + t * (b.u - a.u),
        v: a.v + t * (b.v - a.v),
        tag: profile.tags[i] ?? 'wall',
        normal: { u: ((b.v - a.v) / L) * ccw, v: (-(b.u - a.u) / L) * ccw },
        run: r,
        endpoint: !closedLoop && (k === 0 || k === count - 1),
      });
    }
  });
  return out;
}
