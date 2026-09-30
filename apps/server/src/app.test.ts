import { healthSchema } from '@cronos/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { createDb, createPool } from './db/db';
import { createTestDb, databaseAvailable, type TestDb } from './test/testDb';

describe.runIf(await databaseAvailable())('servidor base', () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(async () => {
    await t.drop();
  });

  it('GET /api/health responde ok con la base disponible', async () => {
    const app = buildApp({ db: t.db, version: 'test' });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(healthSchema.parse(res.json())).toEqual({
      status: 'ok',
      database: 'ok',
      version: 'test',
    });
  });

  it('GET /api/health responde 503 si la base no contesta', async () => {
    const db = createDb(createPool('postgres://nobody:x@127.0.0.1:1/none'));
    const app = buildApp({ db, version: 'test' });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: 'error', database: 'error' });
    await db.destroy();
  });

  it('una ruta desconocida devuelve el cuerpo de error estándar', async () => {
    const app = buildApp({ db: t.db, version: 'test' });
    const res = await app.inject({ method: 'GET', url: '/api/nada' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ code: 'not_found', message: 'Not found' });
  });
});
