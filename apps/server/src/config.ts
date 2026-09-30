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
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  // Primer administrador: se crea solo si la base no tiene usuarios (debe cambiar la contraseña).
  CRONOS_ADMIN_EMAIL: z.email().optional(),
  CRONOS_ADMIN_PASSWORD: z.string().min(10).optional(),
  CRONOS_ADMIN_NAME: z.string().min(1).default('Administrador'),
});

export interface ServerConfig {
  databaseUrl: string;
  host: string;
  port: number;
  logLevel: string;
  authSecret: string;
  baseUrl: string;
  initialAdmin: { email: string; password: string; name: string } | null;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Variables de entorno inválidas o faltantes: ${fields}`);
  }
  const e = parsed.data;
  return {
    databaseUrl: e.DATABASE_URL,
    host: e.HOST,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    authSecret: e.BETTER_AUTH_SECRET,
    baseUrl: e.BETTER_AUTH_URL,
    initialAdmin:
      e.CRONOS_ADMIN_EMAIL && e.CRONOS_ADMIN_PASSWORD
        ? {
            email: e.CRONOS_ADMIN_EMAIL,
            password: e.CRONOS_ADMIN_PASSWORD,
            name: e.CRONOS_ADMIN_NAME,
          }
        : null,
  };
}
