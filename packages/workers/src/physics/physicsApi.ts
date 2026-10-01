import type { ScalarGrid, Vec3 } from '@cronos/core';
import type * as RapierModule from '@dimforge/rapier3d-compat';
import { transfer } from 'comlink';

/**
 * Animación física de la pila (A7, nivel 2; D-17). Rapier (WASM de terceros) se carga solo al
 * pedir este modo. Es visualización: los indicadores de la pila salen del modelo cinemático.
 * Cada bloque entra al mundo al detonar su taladro con la velocidad del nivel 1 y choca con el
 * terreno fijo y con los demás bloques. Coordenadas relativas a `origin` (float32).
 */

export interface PhysicsInput {
  /** Origen de render [m]: todo se simula relativo a él. */
  origin: Vec3;
  /** Terreno fijo (piso dentro de la voladura y terreno fuera): collider estático. */
  ground: ScalarGrid;
  blocks: {
    count: number;
    origin: Float64Array;
    velocity: Float32Array;
    launchTime: Float64Array;
    /** Alto de cada bloque [m]; el lado en planta es `blockSize`. */
    height: Float32Array;
  };
  blockSize: number;
  /** Máximo de cuerpos simulados (se toma uno de cada k bloques si hay más). */
  maxBodies?: number;
  /** Cuadros guardados por segundo. */
  frameRate?: number;
  /** Tiempo simulado después de la última salida [s]. */
  settleTime?: number;
}

export interface PhysicsFrames {
  bodies: number;
  /** Bloque que representa cada cuerpo. */
  blockIndex: Int32Array;
  /** Tiempo del primer cuadro [s] y paso entre cuadros [s]. */
  t0: number;
  dt: number;
  frames: number;
  /** Posición relativa al origen por cuadro y cuerpo [x, y, z, …]. */
  positions: Float32Array;
  /** Rotación (cuaternión x, y, z, w) por cuadro y cuerpo. */
  rotations: Float32Array;
  elapsedMs: number;
}

const STEP = 1 / 60;
/** Encogimiento de los cuerpos: sin él, los bloques que salen juntos nacen tocándose. */
const SHRINK = 0.9;

type Rapier = typeof RapierModule;
let rapier: Promise<Rapier> | null = null;

async function loadRapier(): Promise<Rapier> {
  rapier ??= import('@dimforge/rapier3d-compat').then(async (m) => {
    await m.init();
    return m;
  });
  return rapier;
}

/** Simula la caída y el apilamiento de los bloques y devuelve los cuadros para reproducirlos. */
export async function simulatePhysics(
  input: PhysicsInput,
  onProgress?: (fraction: number) => void,
): Promise<PhysicsFrames> {
  const t0 = performance.now();
  const R = await loadRapier();
  const { blocks, origin, ground } = input;
  const maxBodies = input.maxBodies ?? 3000;
  const stride = Math.max(1, Math.ceil(blocks.count / maxBodies));
  const chosen: number[] = [];
  for (let k = 0; k < blocks.count; k += stride) chosen.push(k);
  const n = chosen.length;

  let first = Infinity;
  let last = -Infinity;
  for (const k of chosen) {
    const t = blocks.launchTime[k] ?? NaN;
    if (!Number.isFinite(t)) continue;
    first = Math.min(first, t);
    last = Math.max(last, t);
  }
  if (!Number.isFinite(first)) first = last = 0;
  const start = first - 0.05;
  const end = last + (input.settleTime ?? 5);
  const frameDt = 1 / (input.frameRate ?? 20);
  const frames = Math.max(1, Math.floor((end - start) / frameDt) + 1);

  const world = new R.World({ x: 0, y: 0, z: -9.80665 });
  world.timestep = STEP;
  try {
    // Terreno: malla de triángulos entre centros de celda (no se mueve).
    const { nx, ny, cellSize, originX, originY } = ground;
    const vertices = new Float32Array(nx * ny * 3);
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        vertices[3 * k] = originX + (i + 0.5) * cellSize - origin.x;
        vertices[3 * k + 1] = originY + (j + 0.5) * cellSize - origin.y;
        vertices[3 * k + 2] = (ground.values[k] ?? origin.z) - origin.z;
      }
    const indices = new Uint32Array(Math.max(0, (nx - 1) * (ny - 1) * 6));
    let t = 0;
    for (let j = 0; j + 1 < ny; j++)
      for (let i = 0; i + 1 < nx; i++) {
        const k = j * nx + i;
        indices.set([k, k + 1, k + nx, k + 1, k + nx + 1, k + nx], t);
        t += 6;
      }
    if (indices.length > 0)
      world.createCollider(R.ColliderDesc.trimesh(vertices, indices).setFriction(0.9));

    const order = chosen
      .map((k, i) => ({ k, i, t: blocks.launchTime[k] ?? Infinity }))
      .sort((a, b) => a.t - b.t || a.i - b.i);
    const bodies: (InstanceType<Rapier['RigidBody']> | null)[] = Array.from(
      { length: n },
      () => null,
    );
    const positions = new Float32Array(frames * n * 3);
    const rotations = new Float32Array(frames * n * 4);
    const half = (input.blockSize / 2) * SHRINK;
    let next = 0;
    let time = start;
    for (let f = 0; f < frames; f++) {
      const target = start + f * frameDt;
      while (time < target) {
        // Entran al mundo los bloques cuyo taladro ya detonó.
        while (next < order.length && (order[next]?.t ?? Infinity) <= time) {
          const o = order[next];
          next++;
          if (!o) continue;
          const k = o.k;
          const desc = R.RigidBodyDesc.dynamic()
            .setTranslation(
              (blocks.origin[3 * k] ?? 0) - origin.x,
              (blocks.origin[3 * k + 1] ?? 0) - origin.y,
              (blocks.origin[3 * k + 2] ?? 0) - origin.z,
            )
            .setLinvel(
              blocks.velocity[3 * k] ?? 0,
              blocks.velocity[3 * k + 1] ?? 0,
              blocks.velocity[3 * k + 2] ?? 0,
            )
            .setAngularDamping(0.5);
          const body = world.createRigidBody(desc);
          world.createCollider(
            R.ColliderDesc.cuboid(half, half, ((blocks.height[k] ?? input.blockSize) / 2) * SHRINK)
              .setFriction(0.8)
              .setRestitution(0.1)
              .setDensity(2650),
            body,
          );
          bodies[o.i] = body;
        }
        world.step();
        time += STEP;
      }
      for (let i = 0; i < n; i++) {
        const body = bodies[i];
        const p = 3 * (f * n + i);
        const q = 4 * (f * n + i);
        if (body) {
          const tr = body.translation();
          const rot = body.rotation();
          positions[p] = tr.x;
          positions[p + 1] = tr.y;
          positions[p + 2] = tr.z;
          rotations.set([rot.x, rot.y, rot.z, rot.w], q);
        } else {
          const k = chosen[i] ?? 0;
          positions[p] = (blocks.origin[3 * k] ?? 0) - origin.x;
          positions[p + 1] = (blocks.origin[3 * k + 1] ?? 0) - origin.y;
          positions[p + 2] = (blocks.origin[3 * k + 2] ?? 0) - origin.z;
          rotations[q + 3] = 1;
        }
      }
      if (f % 10 === 0) onProgress?.(f / frames);
    }
    onProgress?.(1);
    return {
      bodies: n,
      blockIndex: Int32Array.from(chosen),
      t0: start,
      dt: frameDt,
      frames,
      positions,
      rotations,
      elapsedMs: performance.now() - t0,
    };
  } finally {
    world.free();
  }
}

/** API del worker de física (Comlink). */
export const physicsApi = {
  async simulate(
    input: PhysicsInput,
    onProgress?: (fraction: number) => void,
  ): Promise<PhysicsFrames> {
    const r = await simulatePhysics(input, onProgress);
    return transfer(r, [
      r.blockIndex.buffer,
      r.positions.buffer,
      r.rotations.buffer,
    ] as ArrayBuffer[]);
  },
};

export type PhysicsApi = typeof physicsApi;
