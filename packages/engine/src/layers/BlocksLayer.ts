import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { Vec3 } from '@cronos/core';
import { FragmentsLayer, type FragmentsData } from './FragmentsLayer';

const G = 9.80665;
/** Tiempo en que un bloque pasa del impacto a su lugar final en la pila (modo rápido) [s]. */
export const SETTLE = 0.4;
/** Los bloques se dibujan apenas más chicos que su celda: se leen como vóxeles. */
const GAP = 0.94;

/** Cuadros de la simulación física (worker de física, A7 nivel 2). */
export interface BlockFrames {
  bodies: number;
  blockIndex: Int32Array;
  t0: number;
  dt: number;
  frames: number;
  /** Relativas al origen de render con el que se simuló. */
  positions: Float32Array;
  rotations: Float32Array;
  /** Origen con el que se simuló (se corrige si el engine recentró). */
  origin: Vec3;
}

/** Bloques de la pila (A7): trayectorias del modelo cinemático y color por bloque. */
export interface BlocksData {
  count: number;
  origin: Float64Array;
  impact: Float64Array;
  destination: Float64Array;
  velocity: Float32Array;
  launchTime: Float64Array;
  impactTime: Float64Array;
  height: Float32Array;
  /**
   * Pendiente del terreno sobre el bloque superior de cada columna [dz/dx, dz/dy, …]: in situ su
   * cara de arriba sigue el relieve (ausente o 0 = caja recta).
   */
  topSlope?: Float32Array;
  /** Lado en planta [m]. */
  size: number;
  /** Color sRGB por bloque [r, g, b, …] (0–255). */
  colors: Uint8Array;
  /** Con cuadros de física se dibujan sus cuerpos; sin ellos, el modo rápido interpola. */
  frames?: BlockFrames | null;
  /**
   * Trayectoria muestreada por bloque (pila subterránea: choca con techo y paredes): `pathPoints`
   * muestras [dx, dy, dz, t] relativas al origen y a la salida. Sin ella, tiro parabólico.
   */
  path?: Float32Array | null;
  pathPoints?: number;
  /**
   * Población de fragmentos (FC-47). Con ella, el bloque se ve in situ hasta su salida, vuela como
   * piedras de tamaño, forma, velocidad y giro propios, y en la pila deja su fino como cama de
   * grava (vóxel bajo, alto = fracción fina). Sin ella (o con física), vóxeles como siempre.
   */
  fragments?: FragmentsData | null;
}

/** Estado de los bloques padre en el instante actual (lo leen sus fragmentos). */
export interface BlockState {
  /** Posición del bloque [m] relativa al origen de render. */
  pos: Float64Array;
  /** Tiempo desde la salida [s]: −1 = aún in situ (o no sale), Infinity = pila final. */
  tau: Float32Array;
  /** Duración del vuelo hasta el impacto [s]. */
  flight: Float32Array;
  /** Asentamiento 0–1 tras el impacto (1 = en su lugar de la pila). */
  settle: Float32Array;
}

/**
 * Vóxeles de la pila animados con el reloj de la secuencia de disparo. Sin tiempo (`null`) muestra
 * la pila final. Una sola InstancedMesh: miles de bloques a 60 fps. Con fragmentos, además, una
 * InstancedMesh por forma de roca (`FragmentsLayer`).
 */
export class BlocksLayer {
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly material = tiltedTopMaterial();
  /** Inclinación de la cara superior por instancia, en unidades locales de la caja. */
  private tilt: InstancedBufferAttribute | null = null;
  mesh: InstancedMesh | null = null;
  /** Lo que se agrega a la escena: los vóxeles y, si hay, los fragmentos. */
  root: Group | null = null;
  private readonly fragments = new FragmentsLayer();
  private state: BlockState | null = null;
  private data: BlocksData | null = null;
  private origin: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly q2 = new Quaternion();
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private lastT: number | null | undefined = undefined;

  /** El grupo cambia al cargar datos: el engine lo agrega a su escena con esta función. */
  onMeshChange: ((root: Group | null, previous: Group | null) => void) | null = null;

  /** Hay fragmentos dibujados (no física ni bloques sin curva). */
  get hasFragments(): boolean {
    return this.fragments.count > 0;
  }

  set(data: BlocksData | null, origin: Vec3): void {
    const previous = this.root;
    const previousMesh = this.mesh;
    this.data = data;
    this.origin = origin;
    this.lastT = undefined;
    const n = data ? (data.frames ? data.frames.bodies : data.count) : 0;
    if (!data || n === 0) {
      this.mesh = null;
      this.root = null;
      this.state = null;
      this.fragments.set(null, null);
      this.onMeshChange?.(null, previous);
      previousMesh?.dispose();
      return;
    }
    this.tilt = new InstancedBufferAttribute(new Float32Array(n * 2), 2).setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('aTilt', this.tilt);
    const mesh = new InstancedMesh(this.geometry, this.material, n);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(n * 3), 3);
    mesh.frustumCulled = false;
    this.mesh = mesh;
    const root = new Group();
    root.add(mesh);
    const frag = !data.frames && data.fragments && data.fragments.count > 0 ? data.fragments : null;
    this.state = frag
      ? {
          pos: new Float64Array(3 * data.count),
          tau: new Float32Array(data.count),
          flight: new Float32Array(data.count),
          settle: new Float32Array(data.count),
        }
      : null;
    this.fragments.set(frag, frag ? data : null, origin);
    if (this.fragments.group) root.add(this.fragments.group);
    this.root = root;
    this.applyColors();
    this.update(null);
    this.onMeshChange?.(root, previous);
    previousMesh?.dispose();
  }

  /** Cambia solo los colores (otro modo de color), sin rehacer las instancias. */
  setColors(colors: Uint8Array): void {
    if (!this.data) return;
    this.data = { ...this.data, colors };
    this.applyColors();
    this.fragments.setColors(colors);
  }

  private applyColors(): void {
    const { mesh, data } = this;
    if (!mesh || !data) return;
    const c = new Color();
    const n = mesh.count;
    for (let i = 0; i < n; i++) {
      const k = data.frames ? (data.frames.blockIndex[i] ?? 0) : i;
      c.setRGB(
        (data.colors[3 * k] ?? 160) / 255,
        (data.colors[3 * k + 1] ?? 140) / 255,
        (data.colors[3 * k + 2] ?? 110) / 255,
        SRGBColorSpace,
      );
      mesh.instanceColor?.setXYZ(i, c.r, c.g, c.b);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /** Posiciona los bloques en el instante `t` de la secuencia [s]; `null` = pila final. */
  update(t: number | null): void {
    const { mesh, data } = this;
    if (!mesh || !data) return;
    if (t === this.lastT) return;
    this.lastT = t;
    if (data.frames) this.updateFrames(t, data, data.frames);
    else this.updateKinematic(t, data);
    mesh.instanceMatrix.needsUpdate = true;
    if (this.tilt) this.tilt.needsUpdate = true;
    if (this.state) this.fragments.update(t, this.state);
  }

  private updateKinematic(t: number | null, d: BlocksData): void {
    const mesh = this.mesh;
    if (!mesh) return;
    const o = this.origin;
    const arr = mesh.instanceMatrix.array as Float32Array;
    const tilt = this.tilt?.array as Float32Array | undefined;
    const st = this.state;
    const fine = st ? d.fragments?.fineFraction : undefined;
    this.q.identity();
    for (let k = 0; k < d.count; k++) {
      const launch = d.launchTime[k] ?? NaN;
      const hit = d.impactTime[k] ?? NaN;
      let x: number;
      let y: number;
      let z: number;
      let tau = -1;
      let settle = 0;
      // In situ (antes de salir) la cara de arriba sigue el terreno; en vuelo y en la pila, caja recta.
      const inSitu = t !== null && (!Number.isFinite(launch) || t < launch);
      if (tilt) {
        // Pendiente del mundo → unidades locales de la caja (lado / alto).
        const f = inSitu ? d.size / (d.height[k] ?? d.size) : 0;
        tilt[2 * k] = (d.topSlope?.[2 * k] ?? 0) * f;
        tilt[2 * k + 1] = (d.topSlope?.[2 * k + 1] ?? 0) * f;
      }
      const ox = d.origin[3 * k] ?? 0;
      const oy = d.origin[3 * k + 1] ?? 0;
      const oz = d.origin[3 * k + 2] ?? 0;
      const vx = d.velocity[3 * k] ?? 0;
      const vy = d.velocity[3 * k + 1] ?? 0;
      const vz = d.velocity[3 * k + 2] ?? 0;
      const dx = d.destination[3 * k] ?? 0;
      const dy = d.destination[3 * k + 1] ?? 0;
      const dz = d.destination[3 * k + 2] ?? 0;
      const P = d.pathPoints ?? 0;
      const base = k * P * 4;
      // Duración del vuelo (trayectoria muestreada, tiro parabólico o desplazamiento sin vuelo).
      const disc = vz * vz + 2 * G * (oz - dz);
      const tLand = disc >= 0 ? (vz + Math.sqrt(disc)) / G : NaN;
      const pathTotal = d.path && P >= 2 ? (d.path[base + (P - 1) * 4 + 3] ?? 0) : NaN;
      const span = Math.max(SETTLE, (Number.isFinite(hit) ? hit : launch) - launch + SETTLE);
      const flight = Number.isFinite(pathTotal)
        ? pathTotal
        : Number.isFinite(tLand) && tLand > 0
          ? tLand
          : 0;
      if (t === null) {
        x = dx;
        y = dy;
        z = dz;
        tau = Number.isFinite(launch) ? Infinity : -1;
        settle = 1;
      } else if (!Number.isFinite(launch) || t < launch) {
        x = ox;
        y = oy;
        z = oz;
      } else {
        // El sitio final está en la pila ya formada (con el esponjamiento, ~3 de cada 4 bloques
        // terminan más alto de lo que vuelan). Si su vuelo alcanza la cota final, vuela hasta
        // cruzarla bajando y se desliza a su sitio; si no, se levanta y avanza de forma continua.
        tau = t - launch;
        if (d.path && P >= 2) {
          // Trayectoria muestreada: se recorre y luego se asienta en su lugar de la pila.
          const total = pathTotal;
          if (tau < total) {
            const u = total > 0 ? (tau / total) * (P - 1) : 0;
            const a = Math.min(P - 2, Math.floor(u));
            const w = u - a;
            const pa = base + a * 4;
            const pb = pa + 4;
            x = ox + lerp(d.path[pa] ?? 0, d.path[pb] ?? 0, w);
            y = oy + lerp(d.path[pa + 1] ?? 0, d.path[pb + 1] ?? 0, w);
            z = oz + lerp(d.path[pa + 2] ?? 0, d.path[pb + 2] ?? 0, w);
          } else {
            const pl = base + (P - 1) * 4;
            const s = Math.min(1, (tau - total) / SETTLE);
            const w = s * s * (3 - 2 * s);
            settle = w;
            x = lerp(ox + (d.path[pl] ?? 0), dx, w);
            y = lerp(oy + (d.path[pl + 1] ?? 0), dy, w);
            z = lerp(oz + (d.path[pl + 2] ?? 0), dz, w);
          }
        } else if (Number.isFinite(tLand) && tLand > 0) {
          if (tau < tLand) {
            x = ox + vx * tau;
            y = oy + vy * tau;
            z = oz + vz * tau - 0.5 * G * tau * tau;
          } else {
            const s = Math.min(1, (tau - tLand) / SETTLE);
            const w = s * s * (3 - 2 * s);
            settle = w;
            x = lerp(ox + vx * tLand, dx, w);
            y = lerp(oy + vy * tLand, dy, w);
            z = dz;
          }
        } else {
          const s = Math.min(1, tau / span);
          const w = s * s * (3 - 2 * s);
          settle = w;
          x = lerp(ox, dx, w);
          y = lerp(oy, dy, w);
          z = lerp(oz, dz, w);
        }
      }
      if (st) {
        st.pos[3 * k] = x - o.x;
        st.pos[3 * k + 1] = y - o.y;
        st.pos[3 * k + 2] = z - o.z;
        st.tau[k] = tau;
        st.flight[k] = flight;
        st.settle[k] = settle;
      }
      const h = d.height[k] ?? d.size;
      const ff = fine?.[k] ?? NaN;
      if (Number.isFinite(ff) && tau >= 0) {
        // Bloque discretizado ya disparado: en vuelo lo representan sus piedras; al asentarse
        // queda su fino como cama de grava en el fondo de su lugar de la pila.
        const bed = h * ff * settle;
        if (bed < 1e-4) {
          this.s.set(0, 0, 0);
          this.p.set(dx - o.x, dy - o.y, dz - o.z);
        } else {
          this.s.set(d.size, d.size, bed);
          this.p.set(dx - o.x, dy - o.y, dz - h / 2 + bed / 2 - o.z);
        }
      } else {
        this.p.set(x - o.x, y - o.y, z - o.z);
        this.s.set(d.size * GAP, d.size * GAP, h * GAP);
      }
      this.m.compose(this.p, this.q, this.s);
      this.m.toArray(arr, k * 16);
    }
  }

  private updateFrames(t: number | null, d: BlocksData, f: BlockFrames): void {
    const mesh = this.mesh;
    if (!mesh) return;
    const arr = mesh.instanceMatrix.array as Float32Array;
    const u = t === null ? f.frames - 1 : Math.min(f.frames - 1, Math.max(0, (t - f.t0) / f.dt));
    const a = Math.floor(u);
    const b = Math.min(f.frames - 1, a + 1);
    const w = u - a;
    // Si el engine recentró su origen después de simular, se corrige la diferencia.
    const dx = f.origin.x - this.origin.x;
    const dy = f.origin.y - this.origin.y;
    const dz = f.origin.z - this.origin.z;
    const n = f.bodies;
    for (let i = 0; i < n; i++) {
      const pa = 3 * (a * n + i);
      const pb = 3 * (b * n + i);
      this.p.set(
        lerp(f.positions[pa] ?? 0, f.positions[pb] ?? 0, w) + dx,
        lerp(f.positions[pa + 1] ?? 0, f.positions[pb + 1] ?? 0, w) + dy,
        lerp(f.positions[pa + 2] ?? 0, f.positions[pb + 2] ?? 0, w) + dz,
      );
      const qa = 4 * (a * n + i);
      const qb = 4 * (b * n + i);
      this.q.set(
        f.rotations[qa] ?? 0,
        f.rotations[qa + 1] ?? 0,
        f.rotations[qa + 2] ?? 0,
        f.rotations[qa + 3] ?? 1,
      );
      this.q2.set(
        f.rotations[qb] ?? 0,
        f.rotations[qb + 1] ?? 0,
        f.rotations[qb + 2] ?? 0,
        f.rotations[qb + 3] ?? 1,
      );
      this.q.slerp(this.q2, w);
      const k = f.blockIndex[i] ?? 0;
      this.s.set(d.size * GAP, d.size * GAP, (d.height[k] ?? d.size) * GAP);
      this.m.compose(this.p, this.q, this.s);
      this.m.toArray(arr, i * 16);
    }
  }

  dispose(): void {
    this.tilt = null;
    this.mesh?.dispose();
    this.mesh = null;
    this.root = null;
    this.fragments.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}

/**
 * Lambert con la cara superior inclinable por instancia (`aTilt`, pendiente en unidades locales):
 * los vértices de arriba suben `aTilt · xy` y su normal se inclina igual. Con `aTilt` = 0 es la
 * caja de siempre.
 */
function tiltedTopMaterial(): MeshLambertMaterial {
  const material = new MeshLambertMaterial({ color: 0xffffff });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aTilt;')
      .replace(
        '#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\nif (objectNormal.z > 0.5) objectNormal = normalize(vec3(-aTilt.x, -aTilt.y, 1.0));',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nif (position.z > 0.0) transformed.z += dot(aTilt, position.xy);',
      );
  };
  return material;
}

function lerp(a: number, b: number, w: number): number {
  return a + (b - a) * w;
}
