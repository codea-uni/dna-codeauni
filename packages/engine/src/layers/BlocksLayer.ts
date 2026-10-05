import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { Vec3 } from '@cronos/core';

const G = 9.80665;
/** Tiempo en que un bloque pasa del impacto a su lugar final en la pila (modo rápido) [s]. */
const SETTLE = 0.4;
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
}

/**
 * Vóxeles de la pila animados con el reloj de la secuencia de disparo. Sin tiempo (`null`) muestra
 * la pila final. Una sola InstancedMesh: miles de bloques a 60 fps.
 */
export class BlocksLayer {
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly material = tiltedTopMaterial();
  /** Inclinación de la cara superior por instancia, en unidades locales de la caja. */
  private tilt: InstancedBufferAttribute | null = null;
  mesh: InstancedMesh | null = null;
  private data: BlocksData | null = null;
  private origin: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly q2 = new Quaternion();
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private lastT: number | null | undefined = undefined;

  /** El mesh cambia al cargar datos: el engine lo agrega a su escena con esta función. */
  onMeshChange: ((mesh: InstancedMesh | null, previous: InstancedMesh | null) => void) | null =
    null;

  set(data: BlocksData | null, origin: Vec3): void {
    const previous = this.mesh;
    this.data = data;
    this.origin = origin;
    this.lastT = undefined;
    const n = data ? (data.frames ? data.frames.bodies : data.count) : 0;
    if (!data || n === 0) {
      this.mesh = null;
      this.onMeshChange?.(null, previous);
      previous?.dispose();
      return;
    }
    this.tilt = new InstancedBufferAttribute(new Float32Array(n * 2), 2).setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('aTilt', this.tilt);
    const mesh = new InstancedMesh(this.geometry, this.material, n);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(n * 3), 3);
    mesh.frustumCulled = false;
    this.mesh = mesh;
    this.applyColors();
    this.update(null);
    this.onMeshChange?.(mesh, previous);
    previous?.dispose();
  }

  /** Cambia solo los colores (otro modo de color), sin rehacer las instancias. */
  setColors(colors: Uint8Array): void {
    if (!this.data) return;
    this.data = { ...this.data, colors };
    this.applyColors();
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
  }

  private updateKinematic(t: number | null, d: BlocksData): void {
    const mesh = this.mesh;
    if (!mesh) return;
    const o = this.origin;
    const arr = mesh.instanceMatrix.array as Float32Array;
    const tilt = this.tilt?.array as Float32Array | undefined;
    this.q.identity();
    for (let k = 0; k < d.count; k++) {
      const launch = d.launchTime[k] ?? NaN;
      const hit = d.impactTime[k] ?? NaN;
      let x: number;
      let y: number;
      let z: number;
      // In situ (antes de salir) la cara de arriba sigue el terreno; en vuelo y en la pila, caja recta.
      const inSitu = t !== null && (!Number.isFinite(launch) || t < launch);
      if (tilt) {
        // Pendiente del mundo → unidades locales de la caja (lado / alto).
        const f = inSitu ? d.size / (d.height[k] ?? d.size) : 0;
        tilt[2 * k] = (d.topSlope?.[2 * k] ?? 0) * f;
        tilt[2 * k + 1] = (d.topSlope?.[2 * k + 1] ?? 0) * f;
      }
      if (t === null) {
        x = d.destination[3 * k] ?? 0;
        y = d.destination[3 * k + 1] ?? 0;
        z = d.destination[3 * k + 2] ?? 0;
      } else if (!Number.isFinite(launch) || t < launch) {
        x = d.origin[3 * k] ?? 0;
        y = d.origin[3 * k + 1] ?? 0;
        z = d.origin[3 * k + 2] ?? 0;
      } else if (t < hit) {
        const tau = t - launch;
        x = (d.origin[3 * k] ?? 0) + (d.velocity[3 * k] ?? 0) * tau;
        y = (d.origin[3 * k + 1] ?? 0) + (d.velocity[3 * k + 1] ?? 0) * tau;
        z = (d.origin[3 * k + 2] ?? 0) + (d.velocity[3 * k + 2] ?? 0) * tau - 0.5 * G * tau * tau;
      } else {
        const s = Math.min(1, (t - (Number.isFinite(hit) ? hit : launch)) / SETTLE);
        const w = s * s * (3 - 2 * s);
        x = lerp(d.impact[3 * k] ?? 0, d.destination[3 * k] ?? 0, w);
        y = lerp(d.impact[3 * k + 1] ?? 0, d.destination[3 * k + 1] ?? 0, w);
        z = lerp(d.impact[3 * k + 2] ?? 0, d.destination[3 * k + 2] ?? 0, w);
      }
      this.p.set(x - o.x, y - o.y, z - o.z);
      this.s.set(d.size * GAP, d.size * GAP, (d.height[k] ?? d.size) * GAP);
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
