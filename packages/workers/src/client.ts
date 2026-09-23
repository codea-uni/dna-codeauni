import { wrap, type Remote } from 'comlink';
import type { ComputeApi } from './computeApi';

export interface ComputeClient {
  readonly api: Remote<ComputeApi>;
  terminate(): void;
}

/** Crea un worker de cómputo. (El pool con latest-wins llega en fases posteriores.) */
export function createComputeClient(): ComputeClient {
  const worker = new Worker(new URL('./compute.worker.ts', import.meta.url), {
    type: 'module',
    name: 'blastlab-compute',
  });
  return {
    api: wrap<ComputeApi>(worker),
    terminate: () => {
      worker.terminate();
    },
  };
}
