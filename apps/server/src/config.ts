import { z } from 'zod';

/**
 * Configuración desde variables de entorno (guía §14: sin credenciales en el repositorio).
 * Se valida al arrancar: una variable faltante detiene el servidor con un mensaje claro.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export interface ServerConfig {
  databaseUrl: string;
  host: string;
  port: number;
  logLevel: string;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Variables de entorno inválidas o faltantes: ${fields}`);
  }
  const e = parsed.data;
  return { databaseUrl: e.DATABASE_URL, host: e.HOST, port: e.PORT, logLevel: e.LOG_LEVEL };
}
