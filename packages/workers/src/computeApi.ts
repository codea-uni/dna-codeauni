import { ping } from '@blastlab/core';

/**
 * API que el worker de cómputo expone vía Comlink.
 * Solo delega en funciones puras de core; así se testea en Node sin worker.
 */
export const computeApi = {
  ping(message: string): string {
    return ping(message);
  },
};

export type ComputeApi = typeof computeApi;
