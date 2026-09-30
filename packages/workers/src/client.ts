import { wrap, type Remote } from 'comlink';
import type { ComputeApi } from './computeApi';
import type { PhysicsApi } from './physics/physicsApi';

export interface ComputeClient {
  readonly api: Remote<ComputeApi>;
  terminate(): void;
}

/** Crea un worker de cómputo. (El pool con latest-wins llega en fases posteriores.) */
export function createComputeClient(): ComputeClient {
  const worker = new Worker(new URL('./compute.worker.ts', import.meta.url), {
    type: 'module',
    name: 'cronos-compute',
  });
  return {
    api: wrap<ComputeApi>(worker),
    terminate: () => {
      worker.terminate();
    },
  };
}

export interface PhysicsClient {
  readonly api: Remote<PhysicsApi>;
  terminate(): void;
}

/**
 * Worker de la animación física de la pila (A7, D-17): aparte del de cómputo para no bloquearlo
 * mientras simula; carga Rapier solo cuando se crea.
 */
export function createPhysicsClient(): PhysicsClient {
  const worker = new Worker(new URL('./physics.worker.ts', import.meta.url), {
    type: 'module',
    name: 'cronos-physics',
  });
  return {
    api: wrap<PhysicsApi>(worker),
    terminate: () => {
      worker.terminate();
    },
  };
}
