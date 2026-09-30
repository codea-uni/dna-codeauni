import { changePasswordSchema, updateMeSchema, type Me } from '@cronos/api';
import type { FastifyInstance } from 'fastify';
import type { Auth } from '../auth/auth';
import type { Db } from '../db/db';
import { sendError } from '../http/errors';
import { requireUser, type SessionUser } from '../http/session';
import { sendWebResponse, toWebRequest, webHeaders } from '../http/webBridge';

/**
 * Rutas de Better Auth que la web usa. Todo lo demás de `/api/auth/*` responde 404: el registro
 * público, el restablecimiento por correo y los proveedores externos quedan cerrados (D-14).
 */
const FORWARDED_AUTH_ROUTES = [
  { method: 'POST', url: '/auth/sign-in/email' },
  { method: 'POST', url: '/auth/sign-out' },
  { method: 'GET', url: '/auth/get-session' },
] as const;

export interface AuthRouteDeps {
  auth: Auth;
  db: Db;
  baseUrl: string;
}

function toMe(user: SessionUser): Me {
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      locale: user.locale === 'en' ? 'en' : 'es',
      mustChangePassword: user.mustChangePassword,
    },
  };
}

export function authRoutes(app: FastifyInstance, deps: AuthRouteDeps): void {
  for (const route of FORWARDED_AUTH_ROUTES) {
    app.route({
      method: route.method,
      url: route.url,
      handler: async (req, reply) => {
        const res = await deps.auth.handler(toWebRequest(req, deps.baseUrl));
        return sendWebResponse(reply, res);
      },
    });
  }

  app.get('/me', async (req, reply) => {
    const user = await requireUser(deps.auth, req, reply);
    if (!user) return reply;
    return reply.send(toMe(user));
  });

  app.patch('/me', async (req, reply) => {
    const user = await requireUser(deps.auth, req, reply);
    if (!user) return reply;
    const body = updateMeSchema.safeParse(req.body);
    if (!body.success) return sendError(reply, 400, 'invalid_body', body.error.message);
    await deps.db
      .updateTable('user')
      .set({ locale: body.data.locale })
      .where('id', '=', user.id)
      .execute();
    return reply.send(toMe({ ...user, locale: body.data.locale }));
  });

  // Cambio de contraseña: cierra las otras sesiones y quita la marca de contraseña temporal.
  app.post('/me/password', async (req, reply) => {
    const user = await requireUser(deps.auth, req, reply);
    if (!user) return reply;
    const body = changePasswordSchema.safeParse(req.body);
    if (!body.success) return sendError(reply, 400, 'password_too_short', body.error.message);
    const res = await deps.auth.api.changePassword({
      headers: webHeaders(req),
      body: { ...body.data, revokeOtherSessions: true },
      asResponse: true,
    });
    if (!res.ok) return sendError(reply, 400, 'invalid_password', 'Current password is wrong');
    await deps.db
      .updateTable('user')
      .set({ mustChangePassword: false })
      .where('id', '=', user.id)
      .execute();
    // La respuesta trae la cookie de la sesión nueva; el cuerpo se reemplaza por `{ ok: true }`.
    const cookies = res.headers.getSetCookie();
    if (cookies.length) void reply.header('set-cookie', cookies);
    return reply.send({ ok: true });
  });
}
