/**
 * Servicio de cálculo interno de Cronos. Variables:
 * - CALC_TOKEN (obligatoria): credencial entre servicios que trae cada llamada del agente.
 * - CALC_PORT (por defecto 8090) y CALC_HOST (por defecto 0.0.0.0: dentro de la red privada).
 * - CALC_WORKERS: procesos de cálculo (por defecto, núcleos − 1).
 * - CALC_TIMEOUT_MS: tiempo máximo de una corrida (60 s).
 * - DATABASE_URL: PostgreSQL de Cronos para el registro de corridas; sin ella, registro en memoria.
 * - CALC_VERSION: versión del motor que se anota en cada corrida (p. ej. el commit desplegado).
 */
import { buildCalcApp } from './app';
import { ThreadPool } from './pool';
import { MemoryRunLog, PgRunLog, type RunLog } from './runLog';

const token = process.env.CALC_TOKEN ?? '';
if (token.length < 32) {
  console.error('CALC_TOKEN falta o es corta (mínimo 32 caracteres).');
  process.exit(1);
}
const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

const executor = new ThreadPool({
  ...(process.env.CALC_WORKERS ? { size: num(process.env.CALC_WORKERS, 1) } : {}),
  timeoutMs: num(process.env.CALC_TIMEOUT_MS, 60_000),
});
const runLog: RunLog = process.env.DATABASE_URL
  ? new PgRunLog(process.env.DATABASE_URL)
  : new MemoryRunLog();

const app = buildCalcApp({
  executor,
  runLog,
  token,
  engineVersion: process.env.CALC_VERSION ?? '0.1.0-dev',
  logger: true,
});

const close = async () => {
  await app.close();
  await executor.close();
  await runLog.close();
  process.exit(0);
};
process.on('SIGTERM', () => void close());
process.on('SIGINT', () => void close());

await app.listen({
  port: num(process.env.CALC_PORT, 8090),
  host: process.env.CALC_HOST ?? '0.0.0.0',
});
