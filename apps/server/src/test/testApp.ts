import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { createAuth, createUserWithPassword, type Auth, type NewUser } from '../auth/auth';
import type { TestDb } from './testDb';

export const TEST_BASE_URL = 'http://localhost:3000';
export const TEST_ORIGIN = { origin: TEST_BASE_URL };

export interface TestApp {
  app: FastifyInstance;
  auth: Auth;
}

export function createTestApp(t: TestDb, options: { rateLimit?: boolean } = {}): TestApp {
  const auth = createAuth({
    pool: t.pool,
    secret: 'test-secret-with-at-least-32-characters!',
    baseUrl: TEST_BASE_URL,
    rateLimit: options.rateLimit ?? false,
  });
  return { app: buildApp({ db: t.db, auth, baseUrl: TEST_BASE_URL, version: 'test' }), auth };
}

/** Crea el usuario y devuelve el header `cookie` de su sesión. */
export async function signedIn(
  { app, auth }: TestApp,
  user: Partial<NewUser> & { email: string },
): Promise<string> {
  const password = user.password ?? 'contraseña-segura';
  await createUserWithPassword(auth, {
    name: user.name ?? user.email,
    mustChangePassword: false,
    ...user,
    password,
  });
  return signIn(app, user.email, password);
}

export async function signIn(
  app: FastifyInstance,
  email: string,
  password: string,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: TEST_ORIGIN,
    payload: { email, password },
  });
  if (res.statusCode !== 200) throw new Error(`sign-in ${res.statusCode}: ${res.body}`);
  return cookieHeader(res.headers['set-cookie']);
}

export function cookieHeader(setCookie: string | string[] | undefined): string {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return list.map((c) => c.split(';')[0]).join('; ');
}

/** Entra con la contraseña temporal, la cambia por `newPassword` y devuelve la cookie nueva. */
export async function activate(
  app: FastifyInstance,
  email: string,
  temporary: string,
  newPassword = `${temporary}-definitiva`,
): Promise<string> {
  const cookie = await signIn(app, email, temporary);
  const res = await app.inject({
    method: 'POST',
    url: '/api/me/password',
    headers: { ...TEST_ORIGIN, cookie },
    payload: { currentPassword: temporary, newPassword },
  });
  if (res.statusCode !== 200) throw new Error(`password ${res.statusCode}: ${res.body}`);
  return cookieHeader(res.headers['set-cookie']);
}
