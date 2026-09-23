// Modelo
export * from './model/types';
export { SCHEMA_VERSION } from './model/schema';
export { newId, uuidv7 } from './model/ids';
export * from './model/factories';

// Unidades y geometría
export * from './units/units';
export * from './geometry/vec';
export * from './geometry/hole';
export * from './geometry/polygon';
export * from './geometry/snap';
export { PointIndex } from './geometry/spatialIndex';

// Patrones
export * from './patterns/pattern';

// Documento
export type { ChangeSet } from './document/changeset';
export type { Op, IndexedEntry, BlastPatch, BlastFields } from './document/ops';
export {
  DocumentStore,
  type DocumentListener,
  type DocumentReader,
  type HistoryEntry,
  type HoleLocation,
} from './document/DocumentStore';
export { SelectionStore, type SelectionListener } from './document/SelectionStore';
export { createEditorSession, type EditorSession } from './document/session';
export * as commands from './document/commands';
export type { HoleEdit } from './document/commands';

// IO
export * from './io/projectFile';

/** Verificación de extremo a extremo del cableado core → workers. */
export function ping(message: string): string {
  return `pong: ${message}`;
}
