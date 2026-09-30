import type { Health } from '@cronos/api';
import type { FastifyInstance } from 'fastify';
import { pingDb, type Db } from '../db/db';

export function healthRoutes(app: FastifyInstance, deps: { db: Db; version: string }): void {
  app.get('/health', async (_req, reply) => {
    const dbOk = await pingDb(deps.db);
    const body: Health = {
      status: dbOk ? 'ok' : 'error',
      database: dbOk ? 'ok' : 'error',
      version: deps.version,
    };
    return reply.code(dbOk ? 200 : 503).send(body);
  });
}
