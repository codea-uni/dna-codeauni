import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Auth } from '../auth/auth';
import type { Db } from '../db/db';
import { sendError } from './errors';
import { webHeaders } from './webBridge';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  locale: string;
  mustChangePassword: boolean;
  isSuperAdmin: boolean;
  disabled: boolean;
}

/**
 * Usuario de la sesión de la cookie, o `null` si no hay sesión válida. Los datos propios de
 * Cronos (superadmin, desactivado, contraseña temporal) se leen de la base en cada petición: un
 * cambio (p. ej. desactivar la cuenta) rige de inmediato.
 */
export async function getSessionUser(
  auth: Auth,
  db: Db,
  req: FastifyRequest,
): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: webHeaders(req) });
  if (!session) return null;
  const row = await db
    .selectFrom('user')
    .select(['id', 'name', 'email', 'locale', 'mustChangePassword', 'isSuperAdmin', 'disabledAt'])
    .where('id', '=', session.user.id)
    .executeTakeFirst();
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    locale: row.locale,
    mustChangePassword: row.mustChangePassword,
    isSuperAdmin: row.isSuperAdmin,
    disabled: row.disabledAt !== null,
  };
}

/**
 * Como `getSessionUser`, pero responde y devuelve `null` si no hay sesión (401), si la cuenta
 * está desactivada (403 `account_disabled`) o si la contraseña es temporal (403
 * `password_change_required`): hasta cambiarla solo se permiten las rutas de `/me`
 * (`allowTemporaryPassword`).
 */
export async function requireUser(
  auth: Auth,
  db: Db,
  req: FastifyRequest,
  reply: FastifyReply,
  options: { allowTemporaryPassword?: boolean } = {},
): Promise<SessionUser | null> {
  const user = await getSessionUser(auth, db, req);
  if (!user) {
    await sendError(reply, 401, 'unauthorized', 'Sign in required');
    return null;
  }
  if (user.disabled) {
    await sendError(reply, 403, 'account_disabled', 'This account is disabled');
    return null;
  }
  if (user.mustChangePassword && !options.allowTemporaryPassword) {
    await sendError(reply, 403, 'password_change_required', 'Change the temporary password first');
    return null;
  }
  return user;
}
