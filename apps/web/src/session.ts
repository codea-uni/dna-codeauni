import { createEditorSession, type EditorSession } from '@blastlab/core';
import type { Engine } from '@blastlab/engine';
import { createComputeClient, type ComputeClient } from '@blastlab/workers';

/**
 * Singletons de la aplicación: documento + selección (core), cliente de cómputo (workers)
 * y el engine una vez montado el viewport. Viven fuera de React.
 */
export const session: EditorSession = createEditorSession();

let compute: ComputeClient | null = null;
export function getCompute(): ComputeClient {
  compute ??= createComputeClient();
  return compute;
}

let engine: Engine | null = null;
export function setEngine(value: Engine | null): void {
  engine = value;
}
export function getEngine(): Engine | null {
  return engine;
}

export const APP_VERSION = '0.1.0';
