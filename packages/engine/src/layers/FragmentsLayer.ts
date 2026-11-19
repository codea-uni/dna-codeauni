import {
  Color,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshLambertMaterial,
  SRGBColorSpace,
  type BufferGeometry,
} from 'three';
import type { BlockState, BlocksData } from './BlocksLayer';
import { buildFragmentShapes } from './fragmentShapes';

/** Bandera del core: partícula proxy de finos (`FRAGMENT_FINE`). */
const FINE = 1;
/** Giro extra al rodar mientras se asienta [s equivalentes de vuelo]. */
const ROLL = 0.25;

/** Fragmentos del core (`MuckpileFragments`), lo que el engine necesita para dibujarlos. */
export interface FragmentsData {
  count: number;
  parent: Int32Array;
  axes: Float32Array;
  quat: Float32Array;
  shape: Uint8Array;
  offset: Float32Array;
  rest: Float32Array;
  spread: Float32Array;
  omega: Float32Array;
  flags: Uint8Array;
  fineFraction: Float32Array;
  /** Separación máxima respecto del bloque [m]. */
  spreadLimit?: number;
  /** Aterrizaje propio y lugar final en la pila [x, y, z, …] (coordenadas de proyecto). */
  land?: Float64Array;
  restPos?: Float64Array;
  /** Los mismos, relativos al origen de render (los arma `FragmentsLayer.set`). */
  landRel?: Float32Array;
  restRel?: Float32Array;
}

let shapes: BufferGeometry[] | null = null;

/**
 * Piedras de la pila (skill `cronos-fragmentos-render`): una InstancedMesh por forma base. Cada
 * piedra sigue la trayectoria de su bloque padre más su propia velocidad relativa (se separan en
 * el aire), gira con su ω y al asentarse rueda hasta su lugar sobre la cama de grava del bloque.
 * Antes de que su taladro salga no se dibuja (se ve el bloque in situ). Las partículas de finos
 * vuelan y se funden en la grava al llegar.
 */
export class FragmentsLayer {
  group: Group | null = null;
  count = 0;
  private data: FragmentsData | null = null;
  private meshes: InstancedMesh[] = [];
  /** Por forma: índices de fragmento en el orden de sus instancias. */
  private members: Int32Array[] = [];
  private readonly material = new MeshLambertMaterial({ color: 0xffffff });

  set(
    data: FragmentsData | null,
    blocks: BlocksData | null,
    origin: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
  ): void {
    this.disposeMeshes();
    this.data =
      data?.land && data.restPos
        ? {
            ...data,
            landRel: relative(data.land, origin),
            restRel: relative(data.restPos, origin),
          }
        : data;
    this.count = data?.count ?? 0;
    if (!data || !blocks || data.count === 0) {
      this.group = null;
      return;
    }
    shapes ??= buildFragmentShapes();
    const lib = shapes;
    const perShape = new Array<number[]>(lib.length).fill([]).map(() => [] as number[]);
    for (let j = 0; j < data.count; j++) perShape[(data.shape[j] ?? 0) % lib.length]?.push(j);
    const group = new Group();
    this.members = perShape.map((l) => Int32Array.from(l));
    this.meshes = this.members.map((ids, s) => {
      const geo = lib[s];
      const mesh = new InstancedMesh(geo, this.material, Math.max(1, ids.length));
      mesh.count = ids.length;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.instanceColor = new InstancedBufferAttribute(
        new Float32Array(3 * Math.max(1, ids.length)),
        3,
      );
      mesh.frustumCulled = false;
      group.add(mesh);
      return mesh;
    });
    this.group = group;
    this.setColors(blocks.colors);
  }

  /** Color del bloque padre con un leve cambio de tono por piedra (se distinguen entre sí). */
  setColors(colors: Uint8Array): void {
    const d = this.data;
    if (!d) return;
    const c = new Color();
    this.meshes.forEach((mesh, s) => {
      const ids = this.members[s];
      if (!ids) return;
      for (let i = 0; i < ids.length; i++) {
        const j = ids[i] ?? 0;
        const k = d.parent[j] ?? 0;
        const jitter = 0.82 + 0.3 * frac(Math.sin(j * 12.9898) * 43758.5453);
        c.setRGB(
          ((colors[3 * k] ?? 160) / 255) * jitter,
          ((colors[3 * k + 1] ?? 140) / 255) * jitter,
          ((colors[3 * k + 2] ?? 110) / 255) * jitter,
          SRGBColorSpace,
        );
        mesh.instanceColor?.setXYZ(i, c.r, c.g, c.b);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }

  /** Coloca las piedras según el estado de sus bloques padre (`BlocksLayer.updateKinematic`). */
  update(_t: number | null, st: BlockState): void {
    const d = this.data;
    if (!d) return;
    this.meshes.forEach((mesh, s) => {
      const ids = this.members[s];
      if (!ids) return;
      const arr = mesh.instanceMatrix.array as Float32Array;
      for (let i = 0; i < ids.length; i++) writeMatrix(arr, i * 16, d, ids[i] ?? 0, st);
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  private disposeMeshes(): void {
    for (const m of this.meshes) m.dispose();
    this.meshes = [];
    this.members = [];
  }

  dispose(): void {
    this.disposeMeshes();
    this.material.dispose();
    this.group = null;
    this.data = null;
  }
}

function relative(a: Float64Array, o: { x: number; y: number; z: number }): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i += 3) {
    out[i] = (a[i] ?? 0) - o.x;
    out[i + 1] = (a[i + 1] ?? 0) - o.y;
    out[i + 2] = (a[i + 2] ?? 0) - o.z;
  }
  return out;
}

function frac(x: number): number {
  return x - Math.floor(x);
}

/**
 * Matriz de la piedra j: T·R·S con R = q0 · rot(ω̂, |ω|·τ_giro) y S = (L, I, S). Escrita a mano
 * (sin objetos) porque corre para decenas de miles de piedras por cuadro.
 */
export function writeMatrix(
  out: Float32Array,
  o: number,
  d: FragmentsData,
  j: number,
  st: BlockState,
): void {
  const k = d.parent[j] ?? 0;
  const tau = st.tau[k] ?? -1;
  const fine = ((d.flags[j] ?? 0) & FINE) !== 0;
  const w = st.settle[k] ?? 0;
  if (tau < 0 || (fine && (w >= 1 || tau === Infinity))) {
    for (let i = 0; i < 16; i++) out[o + i] = 0;
    return;
  }
  const flight = st.flight[k] ?? 0;
  const tf = Math.min(tau, flight);
  // Posición: la del padre + desfase (propio de salida + velocidad relativa) que rueda al de reposo.
  // Separación por la velocidad propia, acotada (la dispersión no choca con paredes ni techo).
  let ex = (d.spread[3 * j] ?? 0) * tf;
  let ey = (d.spread[3 * j + 1] ?? 0) * tf;
  let ez = (d.spread[3 * j + 2] ?? 0) * tf;
  const lim = d.spreadLimit ?? Infinity;
  const em = Math.hypot(ex, ey, ez);
  if (em > lim) {
    const f = lim / em;
    ex *= f;
    ey *= f;
    ez *= f;
  }
  const ax = (d.offset[3 * j] ?? 0) + ex;
  const ay = (d.offset[3 * j + 1] ?? 0) + ey;
  const az = (d.offset[3 * j + 2] ?? 0) + ez;
  let px: number;
  let py: number;
  let pz: number;
  const L = d.landRel;
  const R = d.restRel;
  if (L && R) {
    // Vuela con su bloque + su separación; desde que aterriza ya no sigue al bloque: se acomoda
    // desde su punto de caída hasta su hueco en la pila (cercano, nunca de vuelta al frente).
    if (tau === Infinity) {
      px = R[3 * j] ?? 0;
      py = R[3 * j + 1] ?? 0;
      pz = R[3 * j + 2] ?? 0;
    } else if (tau < flight) {
      px = (st.pos[3 * k] ?? 0) + ax;
      py = (st.pos[3 * k + 1] ?? 0) + ay;
      pz = (st.pos[3 * k + 2] ?? 0) + az;
    } else {
      const lx = L[3 * j] ?? 0;
      const ly = L[3 * j + 1] ?? 0;
      const lz = L[3 * j + 2] ?? 0;
      px = lx + ((R[3 * j] ?? 0) - lx) * w;
      py = ly + ((R[3 * j + 1] ?? 0) - ly) * w;
      // Cae sobre la pila: baja o sube a su hueco sin atravesar en línea recta hacia atrás.
      pz = lz + ((R[3 * j + 2] ?? 0) - lz) * w;
    }
  } else {
    px = (st.pos[3 * k] ?? 0) + ax + ((d.rest[3 * j] ?? 0) - ax) * w;
    py = (st.pos[3 * k + 1] ?? 0) + ay + ((d.rest[3 * j + 1] ?? 0) - ay) * w;
    pz = (st.pos[3 * k + 2] ?? 0) + az + ((d.rest[3 * j + 2] ?? 0) - az) * w;
  }
  // Giro: ángulo |ω|·(vuelo + rodada al asentarse), alrededor de ω̂.
  const wx = d.omega[3 * j] ?? 0;
  const wy = d.omega[3 * j + 1] ?? 0;
  const wz = d.omega[3 * j + 2] ?? 0;
  const wm = Math.hypot(wx, wy, wz);
  const ang = wm * (tf + ROLL * w);
  let rx = 0;
  let ry = 0;
  let rz = 0;
  let rw = 1;
  if (wm > 1e-9) {
    const sn = Math.sin(ang / 2) / wm;
    rx = wx * sn;
    ry = wy * sn;
    rz = wz * sn;
    rw = Math.cos(ang / 2);
  }
  const q0x = d.quat[4 * j] ?? 0;
  const q0y = d.quat[4 * j + 1] ?? 0;
  const q0z = d.quat[4 * j + 2] ?? 0;
  const q0w = d.quat[4 * j + 3] ?? 1;
  // q = r · q0 (rota en el marco del mundo).
  const x = rw * q0x + rx * q0w + ry * q0z - rz * q0y;
  const y = rw * q0y - rx * q0z + ry * q0w + rz * q0x;
  const z = rw * q0z + rx * q0y - ry * q0x + rz * q0w;
  const qw = rw * q0w - rx * q0x - ry * q0y - rz * q0z;
  // Las partículas de finos se encogen mientras se funden en la grava.
  const shrink = fine ? 1 - w : 1;
  const sx = (d.axes[3 * j] ?? 0) * shrink;
  const sy = (d.axes[3 * j + 1] ?? 0) * shrink;
  const sz = (d.axes[3 * j + 2] ?? 0) * shrink;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx2 = qw * x2;
  const wy2 = qw * y2;
  const wz2 = qw * z2;
  out[o] = (1 - (yy + zz)) * sx;
  out[o + 1] = (xy + wz2) * sx;
  out[o + 2] = (xz - wy2) * sx;
  out[o + 3] = 0;
  out[o + 4] = (xy - wz2) * sy;
  out[o + 5] = (1 - (xx + zz)) * sy;
  out[o + 6] = (yz + wx2) * sy;
  out[o + 7] = 0;
  out[o + 8] = (xz + wy2) * sz;
  out[o + 9] = (yz - wx2) * sz;
  out[o + 10] = (1 - (xx + yy)) * sz;
  out[o + 11] = 0;
  out[o + 12] = px;
  out[o + 13] = py;
  out[o + 14] = pz;
  out[o + 15] = 1;
}
