import { uuidv7 } from '@cronos/core';
import { betterAuth } from 'better-auth';
import type pg from 'pg';

export interface AuthConfig {
  pool: pg.Pool;
  /** Secreto de firma de cookies y tokens (≥ 32 caracteres, `BETTER_AUTH_SECRET`). */
  secret: string;
  /** URL pública de la app (`BETTER_AUTH_URL`); su origen es el único confiable. */
  baseUrl: string;
  /** Límite de intentos (5 inicios de sesión por minuto e IP). Las pruebas lo apagan salvo la suya. */
  rateLimit: boolean;
}

/** Contraseña mínima: 8 caracteres (NIST SP 800-63B pide ≥ 8). */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Better Auth (D-14): correo y contraseña, sesión en cookie `httpOnly`. **Sin registro público**:
 * las cuentas las crea el administrador (guía H-801) con `createUserWithPassword`.
 */
export function createAuth(config: AuthConfig) {
  return betterAuth({
    appName: 'Cronos',
    baseURL: config.baseUrl,
    basePath: '/api/auth',
    secret: config.secret,
    database: config.pool,
    trustedOrigins: [new URL(config.baseUrl).origin],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
    },
    user: {
      additionalFields: {
        // Idioma de la interfaz (guía 03 §2, entidad Usuario).
        locale: { type: 'string', required: false, defaultValue: 'es', input: false },
        // Cuenta creada por el administrador con contraseña temporal: debe cambiarla al entrar.
        mustChangePassword: { type: 'boolean', required: false, defaultValue: false, input: false },
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    rateLimit: {
      enabled: config.rateLimit,
      window: 60,
      max: 100,
      customRules: { '/sign-in/email': { window: 60, max: 5 } },
    },
    advanced: {
      useSecureCookies: config.baseUrl.startsWith('https://'),
      // Traefik fija X-Real-Ip con la IP del cliente y nginx la reenvía (deploy/nginx.conf).
      ipAddress: { ipAddressHeaders: ['x-real-ip'] },
      database: { generateId: () => uuidv7() },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

export interface NewUser {
  email: string;
  name: string;
  password: string;
  locale?: 'es' | 'en';
  /** Por defecto no se pide cambiar la contraseña al entrar. */
  mustChangePassword?: boolean;
}

/**
 * Crea una cuenta con contraseña sin pasar por el registro público (que está cerrado). Hace lo mismo
 * que el alta de Better Auth: usuario + cuenta `credential` con la contraseña hasheada (scrypt).
 */
export async function createUserWithPassword(auth: Auth, input: NewUser): Promise<{ id: string }> {
  const ctx = await auth.$context;
  if (input.password.length < MIN_PASSWORD_LENGTH) throw new Error('password_too_short');
  const email = input.email.trim().toLowerCase();
  if (await ctx.internalAdapter.findUserByEmail(email)) throw new Error('email_taken');
  const user = await ctx.internalAdapter.createUser(
    {
      email,
      name: input.name.trim(),
      emailVerified: true,
      locale: input.locale ?? 'es',
      mustChangePassword: input.mustChangePassword ?? false,
    },
    { method: 'admin' },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: 'credential',
    accountId: user.id,
    password: await ctx.password.hash(input.password),
  });
  return { id: user.id };
}
