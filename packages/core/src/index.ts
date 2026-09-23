export { SCHEMA_VERSION } from './model/schema';
export * from './units/units';

/** Verificación de extremo a extremo del cableado core → workers. */
export function ping(message: string): string {
  return `pong: ${message}`;
}
