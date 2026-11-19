import { BufferGeometry, Float32BufferAttribute } from 'three';

/**
 * Biblioteca de formas de roca (skill `cronos-fragmentos-render` §1): poliedros convexos obtenidos
 * con cortes planos sucesivos de un cubo (rotura binaria al estilo Domokos et al. 2020: ≈ 6–9
 * caras, como la roca fragmentada medida, no las ≈ 15 de una celda de Voronoi). Semilla fija:
 * siempre las mismas formas. Cada forma se centra en su centroide, se lleva a la caja unitaria
 * (extensión 1 en x, y, z) y se escala para que su volumen sea 1: con la escala (L, I, S) de la
 * instancia, su volumen es L·I·S (= k_v·x³ del core).
 */

interface Plane {
  n: [number, number, number];
  d: number;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dot = (a: readonly number[], b: readonly number[]) =>
  (a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0);

/** Vértices del poliedro {x : n·x ≤ d} (intersección de ternas de planos). */
function vertices(planes: readonly Plane[]): [number, number, number][] {
  const out: [number, number, number][] = [];
  const P = planes.length;
  for (let a = 0; a < P; a++)
    for (let b = a + 1; b < P; b++)
      for (let c = b + 1; c < P; c++) {
        const pa = planes[a];
        const pb = planes[b];
        const pc = planes[c];
        if (!pa || !pb || !pc) continue;
        const [a1, a2, a3] = pa.n;
        const [b1, b2, b3] = pb.n;
        const [c1, c2, c3] = pc.n;
        const det = a1 * (b2 * c3 - b3 * c2) - a2 * (b1 * c3 - b3 * c1) + a3 * (b1 * c2 - b2 * c1);
        if (Math.abs(det) < 1e-9) continue;
        const x =
          (pa.d * (b2 * c3 - b3 * c2) -
            a2 * (pb.d * c3 - b3 * pc.d) +
            a3 * (pb.d * c2 - b2 * pc.d)) /
          det;
        const y =
          (a1 * (pb.d * c3 - b3 * pc.d) -
            pa.d * (b1 * c3 - b3 * c1) +
            a3 * (b1 * pc.d - pb.d * c1)) /
          det;
        const z =
          (a1 * (b2 * pc.d - pb.d * c2) -
            a2 * (b1 * pc.d - pb.d * c1) +
            pa.d * (b1 * c2 - b2 * c1)) /
          det;
        const v: [number, number, number] = [x, y, z];
        if (planes.every((p) => dot(p.n, v) <= p.d + 1e-7)) {
          if (!out.some((w) => Math.hypot(w[0] - x, w[1] - y, w[2] - z) < 1e-6)) out.push(v);
        }
      }
  return out;
}

/** Triángulos (no indexados, normales planas) de las caras del poliedro. */
function triangulate(
  planes: readonly Plane[],
  verts: readonly [number, number, number][],
): number[] {
  const tri: number[] = [];
  for (const p of planes) {
    const on = verts.filter((v) => Math.abs(dot(p.n, v) - p.d) < 1e-6);
    if (on.length < 3) continue;
    const c = [0, 0, 0];
    for (const v of on) for (let i = 0; i < 3; i++) c[i] = (c[i] ?? 0) + (v[i] ?? 0) / on.length;
    // Base del plano para ordenar por ángulo.
    const [nx, ny, nz] = p.n;
    const u = Math.abs(nx) < 0.9 ? [0, -nz, ny] : [-ny, nx, 0];
    const un = Math.hypot(u[0] ?? 0, u[1] ?? 0, u[2] ?? 0);
    const ux = (u[0] ?? 0) / un;
    const uy = (u[1] ?? 0) / un;
    const uz = (u[2] ?? 0) / un;
    const wx = ny * uz - nz * uy;
    const wy = nz * ux - nx * uz;
    const wz = nx * uy - ny * ux;
    const ang = (v: readonly number[]) => {
      const dx = (v[0] ?? 0) - (c[0] ?? 0);
      const dy = (v[1] ?? 0) - (c[1] ?? 0);
      const dz = (v[2] ?? 0) - (c[2] ?? 0);
      return Math.atan2(dx * wx + dy * wy + dz * wz, dx * ux + dy * uy + dz * uz);
    };
    const ring = [...on].sort((a, b) => ang(a) - ang(b));
    const r0 = ring[0];
    if (!r0) continue;
    for (let i = 1; i + 1 < ring.length; i++) {
      const r1 = ring[i];
      const r2 = ring[i + 1];
      if (!r1 || !r2) continue;
      tri.push(...r0, ...r1, ...r2);
    }
  }
  return tri;
}

/** Volumen de una malla cerrada de triángulos (suma de tetraedros con el origen). */
function meshVolume(t: readonly number[]): number {
  let v = 0;
  for (let i = 0; i + 8 < t.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = t.slice(i, i + 9) as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
}

/** Una forma: cubo [-1/2, 1/2]³ con `cuts` cortes que quitan cada uno una esquina o arista. */
function shape(seed: number): BufferGeometry {
  const r = rng(seed);
  const planes: Plane[] = [
    { n: [1, 0, 0], d: 0.5 },
    { n: [-1, 0, 0], d: 0.5 },
    { n: [0, 1, 0], d: 0.5 },
    { n: [0, -1, 0], d: 0.5 },
    { n: [0, 0, 1], d: 0.5 },
    { n: [0, 0, -1], d: 0.5 },
  ];
  const cuts = 3 + Math.floor(r() * 4);
  for (let c = 0; c < cuts; c++) {
    // Normal al azar sesgada hacia una esquina; corte que quita ~5–25 % del volumen.
    let n: [number, number, number] = [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1];
    const L = Math.hypot(...n) || 1;
    n = [n[0] / L, n[1] / L, n[2] / L];
    const verts = vertices(planes);
    const reach = Math.max(...verts.map((v) => dot(n, v)));
    const d = reach * (0.45 + 0.35 * r());
    const trial = [...planes, { n, d }];
    const tv = vertices(trial);
    if (tv.length >= 4) planes.push({ n, d });
  }
  const verts = vertices(planes);
  let tri = triangulate(planes, verts);
  // Centrar, llevar a la caja unitaria y a volumen 1.
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tri.length; i++) {
    const a = i % 3;
    min[a] = Math.min(min[a] ?? 0, tri[i] ?? 0);
    max[a] = Math.max(max[a] ?? 0, tri[i] ?? 0);
  }
  tri = tri.map((x, i) => {
    const a = i % 3;
    const lo = min[a] ?? 0;
    const hi = max[a] ?? 1;
    return (x - (lo + hi) / 2) / Math.max(1e-9, hi - lo);
  });
  const k = 1 / Math.cbrt(Math.abs(meshVolume(tri)));
  tri = tri.map((x) => x * k);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(tri, 3));
  g.computeVertexNormals();
  return g;
}

/** Las `count` formas base (por defecto 16, `FRAGMENT_SHAPES` del core). */
export function buildFragmentShapes(count = 16): BufferGeometry[] {
  return Array.from({ length: count }, (_, i) => shape(0x5eed + i * 7919));
}

/** Volumen de una geometría no indexada (para los tests). */
export function geometryVolume(g: BufferGeometry): number {
  const a = g.getAttribute('position');
  return Math.abs(meshVolume(Array.from(a.array as Float32Array)));
}
