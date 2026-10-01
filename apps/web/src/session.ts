import { createEditorSession, type EditorSession } from '@cronos/core';
import type { Engine } from '@cronos/engine';
import {
  createComputeClient,
  createPhysicsClient,
  type ComputeClient,
  type PhysicsClient,
} from '@cronos/workers';

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

let physics: PhysicsClient | null = null;
/** Worker de la animación física de la pila (A7): se crea (y carga Rapier) solo al pedirlo. */
export function getPhysics(): PhysicsClient {
  physics ??= createPhysicsClient();
  return physics;
}

let engine: Engine | null = null;
export function setEngine(value: Engine | null): void {
  engine = value;
}
export function getEngine(): Engine | null {
  return engine;
}

export const APP_VERSION = '0.1.0';
