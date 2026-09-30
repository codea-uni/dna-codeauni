import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Auth } from '../auth/auth';
import { sendError } from './errors';
import { webHeaders } from './webBridge';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  locale: string;
  mustChangePassword: boolean;
}

/** Usuario de la sesión de la cookie, o `null` si no hay sesión válida. */
export async function getSessionUser(auth: Auth, req: FastifyRequest): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: webHeaders(req) });
  if (!session) return null;
  const u = session.user;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    locale: u.locale ?? 'es',
    mustChangePassword: u.mustChangePassword ?? false,
  };
}

/** Como `getSessionUser`, pero responde 401 y devuelve `null` si no hay sesión. */
export async function requireUser(
  auth: Auth,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<SessionUser | null> {
  const user = await getSessionUser(auth, req);
  if (!user) await sendError(reply, 401, 'unauthorized', 'Sign in required');
  return user;
}
