/** Proceso de cálculo: recibe una corrida, la ejecuta con el núcleo y devuelve el resultado. */
import { parentPort } from 'node:worker_threads';
import type { ModuleName, RunRequest } from './modules';
import { execute } from './pool';

parentPort?.on('message', (msg: { id: number; module: ModuleName; request: RunRequest }) => {
  parentPort?.postMessage({ id: msg.id, ...execute(msg.module, msg.request) });
});
