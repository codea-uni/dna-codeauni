import type { ApiErrorBody } from '@cronos/api';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { Auth } from './auth/auth';
import type { Db } from './db/db';
import type { AiConfig } from './config';
import { aiRoutes } from './routes/ai';
import { authRoutes } from './routes/auth';
import { healthRoutes } from './routes/health';
import { organizationRoutes } from './routes/organizations';
import { platformRoutes } from './routes/platform';
import { projectRoutes } from './routes/projects';
import { topographyRoutes } from './routes/topography';
import { versionRoutes } from './routes/versions';

export interface AppDeps {
  db: Db;
  auth: Auth;
  /** URL pública (`BETTER_AUTH_URL`): arma las `Request` que se pasan a Better Auth. */
  baseUrl: string;
  version: string;
  logger?: FastifyServerOptions['logger'];
  /** Asistente de IA; null o ausente = sin configurar (responde 503). */
  ai?: AiConfig | null;
  /** `fetch` hacia Gemini (inyectable en las pruebas). */
  fetch?: typeof fetch;
}

/** Arma la app sin escuchar un puerto: `main.ts` la inicia y las pruebas usan `app.inject`. */
export function buildApp(deps: AppDeps): FastifyInstance {
  // Un proyecto con miles de taladros pesa varios MB de JSON (nginx admite hasta 50 MB).
  const app = Fastify({ logger: deps.logger ?? false, bodyLimit: 50 * 1024 * 1024 });

  app.setErrorHandler((error: unknown, _req, reply) => {
    const e =
      error instanceof Error ? (error as Error & { statusCode?: unknown; code?: unknown }) : null;
    const status = typeof e?.statusCode === 'number' ? e.statusCode : 500;
    if (status >= 500) app.log.error(error);
    const body: ApiErrorBody =
      status >= 500 || !e
        ? { code: 'internal_error', message: 'Internal server error' }
        : { code: typeof e.code === 'string' ? e.code : 'bad_request', message: e.message };
    return reply.code(status).send(body);
  });
  app.setNotFoundHandler((_req, reply) => {
    const body: ApiErrorBody = { code: 'not_found', message: 'Not found' };
    return reply.code(404).send(body);
  });

  void app.register(
    (api, _opts, done) => {
      healthRoutes(api, deps);
      authRoutes(api, deps);
      organizationRoutes(api, deps);
      platformRoutes(api, deps);
      projectRoutes(api, deps);
      versionRoutes(api, deps);
      topographyRoutes(api, deps);
      aiRoutes(api, deps);
      done();
    },
    { prefix: '/api' },
  );

  return app;
}
