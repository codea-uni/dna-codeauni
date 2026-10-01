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
  CRONOS_DEMO_DATA: z.enum(['true', 'false']).default('true'),
  // Superadministrador: se crea o sincroniza desde el entorno, sin cambio obligatorio.
  CRONOS_SUPERADMIN_EMAIL: z.email().optional(),
  CRONOS_SUPERADMIN_PASSWORD: z.string().min(8).optional(),
  CRONOS_SUPERADMIN_NAME: z.string().min(1).default('Administrador de la plataforma'),
});

export interface ServerConfig {
  databaseUrl: string;
  host: string;
  port: number;
  logLevel: string;
  authSecret: string;
  baseUrl: string;
  demoData: boolean;
  initialAdmin: { email: string; password: string; name: string } | null;
}

/** Nombres anteriores de las variables del superadministrador (siguen valiendo). */
const LEGACY: Record<string, string> = {
  CRONOS_ADMIN_EMAIL: 'CRONOS_SUPERADMIN_EMAIL',
  CRONOS_ADMIN_PASSWORD: 'CRONOS_SUPERADMIN_PASSWORD',
  CRONOS_ADMIN_NAME: 'CRONOS_SUPERADMIN_NAME',
};

export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const withLegacy = { ...env };
  for (const [old, name] of Object.entries(LEGACY))
    if (withLegacy[name] === undefined && withLegacy[old] !== undefined)
      withLegacy[name] = withLegacy[old];
  const parsed = envSchema.safeParse(withLegacy);
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
    demoData: e.CRONOS_DEMO_DATA !== 'false',
    initialAdmin:
      e.CRONOS_SUPERADMIN_EMAIL && e.CRONOS_SUPERADMIN_PASSWORD
        ? {
            email: e.CRONOS_SUPERADMIN_EMAIL,
            password: e.CRONOS_SUPERADMIN_PASSWORD,
            name: e.CRONOS_SUPERADMIN_NAME,
          }
        : null,
  };
}
