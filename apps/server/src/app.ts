import type { ApiErrorBody } from '@cronos/api';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { Db } from './db/db';
import { healthRoutes } from './routes/health';

export interface AppDeps {
  db: Db;
  version: string;
  logger?: FastifyServerOptions['logger'];
}

/** Arma la app sin escuchar un puerto: `main.ts` la inicia y las pruebas usan `app.inject`. */
export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: deps.logger ?? false });

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
      done();
    },
    { prefix: '/api' },
  );

  return app;
}
