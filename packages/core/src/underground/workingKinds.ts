import type { Vec3, WorkingKind } from '../model/types';
import type { WorkingsData } from '../topography/asset';
import { workingAxisPoints } from './workings';

/**
 * Tipo de cada labor importada (galería, crucero, rampa, by-pass, chimenea, tajeo, acceso). Los
 * tajeos son donde se carga explosivo para extraer mineral: se resaltan en 3D y se ofrecen primero
 * para los abanicos. Por defecto se adivina por el nombre (capa del DXF) y, si no dice nada, por
 * la geometría del eje; el usuario lo corrige y queda guardado con el levantamiento.
 */
export const WORKING_KINDS: readonly WorkingKind[] = [
  'drift',
  'crosscut',
  'ramp',
  'bypass',
  'raise',
  'stope',
  'access',
  'other',
];

/** Nombres usuales en planos de mina (español e inglés), en el orden en que se prueban. */
const NAME_HINTS: [WorkingKind, RegExp][] = [
  ['stope', /(^|[^a-z])(tajeos?|taj|tj|stopes?|stp)([^a-z]|$)/i],
  [
    'raise',
    /(^|[^a-z])(chimeneas?|chim|raises?|echaderos?|ore ?pass|pozos?|shafts?|ch(?=[-_ .]?\d))/i,
  ],
  // Cámaras de carguío, chancado o refugio: no son galerías de avance.
  ['other', /(^|[^a-z])(c[aá]maras?|chambers?|refugios?)([^a-z]|$)/i],
  ['bypass', /(^|[^a-z])(by[-_ ]?pass|bp(?=[-_ .]?\d))/i],
  ['ramp', /(^|[^a-z])(rampas?|ramps?|rp(?=[-_ .]?\d))/i],
  ['crosscut', /(^|[^a-z])(cruceros?|crosscuts?|cross cut|xc|cx(?=[-_ .]?\d))/i],
  ['access', /(^|[^a-z])(accesos?|access|portal|bocamina|ventanas?)([^a-z]|$)/i],
  ['drift', /(^|[^a-z])(galer[ií]as?|gal|drifts?|subnivel|sn(?=[-_ .]?\d)|nivel)([^a-z]|$)/i],
];

/** Tipo por el nombre de la labor (capa), o null si el nombre no lo dice. */
export function workingKindFromName(name: string): WorkingKind | null {
  for (const [kind, re] of NAME_HINTS) if (re.test(name)) return kind;
  return null;
}

/**
 * Tipo por la geometría del eje (supuesto R0, editable): casi vertical (sube más de lo que avanza,
 * > 45°) → chimenea; pendiente media 5–20 % → rampa; el resto → galería.
 */
export function workingKindFromAxis(points: readonly Vec3[]): WorkingKind {
  let horizontal = 0;
  let vertical = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Vec3;
    const b = points[i] as Vec3;
    horizontal += Math.hypot(b.x - a.x, b.y - a.y);
    vertical += Math.abs(b.z - a.z);
  }
  if (horizontal + vertical < 1e-6) return 'other';
  if (vertical > horizontal) return 'raise';
  const grade = vertical / Math.max(horizontal, 1e-9);
  if (grade >= 0.05 && grade <= 0.2) return 'ramp';
  return 'drift';
}

/** Tipo por defecto: el nombre si lo dice; si no, la geometría. */
export function defaultWorkingKind(name: string, points: readonly Vec3[]): WorkingKind {
  return workingKindFromName(name) ?? workingKindFromAxis(points);
}

/** Tipo de cada eje: el guardado en el levantamiento o, si falta, el de por defecto. */
export function workingKinds(w: WorkingsData, saved?: readonly WorkingKind[]): WorkingKind[] {
  return w.axes.map((a, i) => saved?.[i] ?? defaultWorkingKind(a.name, workingAxisPoints(w, i)));
}

/** Distancia de un punto a una polilínea 3D. */
function distanceToPolyline(p: Vec3, pts: readonly Vec3[]): number {
  if (pts.length === 1) {
    const a = pts[0] as Vec3;
    return Math.hypot(p.x - a.x, p.y - a.y, p.z - a.z);
  }
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as Vec3;
    const b = pts[i] as Vec3;
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const uz = b.z - a.z;
    const len2 = ux * ux + uy * uy + uz * uz;
    const t =
      len2 > 0
        ? Math.max(0, Math.min(1, ((p.x - a.x) * ux + (p.y - a.y) * uy + (p.z - a.z) * uz) / len2))
        : 0;
    const d = Math.hypot(p.x - a.x - t * ux, p.y - a.y - t * uy, p.z - a.z - t * uz);
    if (d < best) best = d;
  }
  return best;
}

/**
 * A qué labor (eje) pertenece cada triángulo de la malla: cada parte conexa (un túnel generado o
 * una parte de un sólido) va al eje más cercano a su centro. -1 = parte sin eje.
 */
export function workingTriangleOwners(w: WorkingsData): Int32Array {
  const nt = Math.floor(w.triangles.length / 3);
  const owners = new Int32Array(nt).fill(-1);
  if (nt === 0 || w.axes.length === 0) return owners;
  const nv = Math.floor(w.vertices.length / 3);
  const parent = new Int32Array(nv);
  for (let i = 0; i < nv; i++) parent[i] = i;
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r] ?? r;
    while (parent[i] !== r) {
      const next = parent[i] ?? r;
      parent[i] = r;
      i = next;
    }
    return r;
  };
  const tri = w.triangles;
  for (let t = 0; t < nt; t++) {
    const a = find(tri[t * 3] ?? 0);
    const b = find(tri[t * 3 + 1] ?? 0);
    const c = find(tri[t * 3 + 2] ?? 0);
    if (a !== b) parent[a] = b;
    const r = find(b);
    if (c !== r) parent[c] = r;
  }
  // Centro de cada parte (promedio de los vértices de sus triángulos).
  const sums = new Map<number, [number, number, number, number]>();
  const comp = new Int32Array(nt);
  for (let t = 0; t < nt; t++) {
    const root = find(tri[t * 3] ?? 0);
    comp[t] = root;
    let s = sums.get(root);
    if (!s) sums.set(root, (s = [0, 0, 0, 0]));
    for (let k = 0; k < 3; k++) {
      const v = tri[t * 3 + k] ?? 0;
      s[0] += w.vertices[v * 3] ?? 0;
      s[1] += w.vertices[v * 3 + 1] ?? 0;
      s[2] += w.vertices[v * 3 + 2] ?? 0;
      s[3]++;
    }
  }
  const axes = w.axes.map((_, i) => workingAxisPoints(w, i));
  const ownerOf = new Map<number, number>();
  for (const [root, s] of sums) {
    const c = { x: s[0] / s[3], y: s[1] / s[3], z: s[2] / s[3] };
    let best = -1;
    let bestD = Infinity;
    axes.forEach((pts, i) => {
      if (pts.length === 0) return;
      const d = distanceToPolyline(c, pts);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    ownerOf.set(root, best);
  }
  for (let t = 0; t < nt; t++) owners[t] = ownerOf.get(comp[t] ?? 0) ?? -1;
  return owners;
}

/** Triángulos de la malla agrupados por tipo de labor (`null` = sin eje asignado). */
export function workingTrianglesByKind(
  w: WorkingsData,
  kinds: readonly WorkingKind[],
  owners: Int32Array = workingTriangleOwners(w),
): Map<WorkingKind | null, Uint32Array> {
  const lists = new Map<WorkingKind | null, number[]>();
  for (let t = 0; t < owners.length; t++) {
    const o = owners[t] ?? -1;
    const kind = o >= 0 ? (kinds[o] ?? null) : null;
    let l = lists.get(kind);
    if (!l) lists.set(kind, (l = []));
    l.push(w.triangles[t * 3] ?? 0, w.triangles[t * 3 + 1] ?? 0, w.triangles[t * 3 + 2] ?? 0);
  }
  const out = new Map<WorkingKind | null, Uint32Array>();
  for (const [k, l] of lists) out.set(k, Uint32Array.from(l));
  return out;
}
