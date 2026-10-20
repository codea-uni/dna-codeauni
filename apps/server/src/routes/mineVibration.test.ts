import { minePointListSchema, mineSchema, vibrationRecordListSchema } from '@cronos/api';
import { newId, type MonitoringPoint, type SeismographRecord } from '@cronos/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  activate,
  createTestApp,
  seedOrganization,
  TEST_ORIGIN,
  type TestApp,
} from '../test/testApp';
import { createTestDb, databaseAvailable, type TestDb } from '../test/testDb';

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

describe.runIf(await databaseAvailable())('vibración de la mina', () => {
  let t: TestDb;
  let s: TestApp;
  let designer: string;
  let reviewer: string;
  let otherAdmin: string;
  let mine: string;

  const call = async (cookie: string, method: Method, url: string, payload?: unknown) => {
    const res = await s.app.inject({
      method,
      url: `/api${url}`,
      headers: { ...TEST_ORIGIN, cookie },
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    });
    return { status: res.statusCode, json: () => res.json<Record<string, unknown>>() };
  };

  beforeAll(async () => {
    t = await createTestDb();
    s = createTestApp(t);
    await seedOrganization(t.db, s.auth, {
      email: 'admin@sur.pe',
      password: 'admin-inicial',
      name: 'Ana',
      organization: 'Minera Sur',
    });
    const admin = await activate(s.app, 'admin@sur.pe', 'admin-inicial');
    const orgId =
      ((await call(admin, 'GET', '/organizations')).json().organizations as { id: string }[])[0]
        ?.id ?? '';
    for (const [email, role] of [
      ['luis@sur.pe', 'designer'],
      ['rosa@sur.pe', 'reviewer'],
    ] as const)
      await call(admin, 'POST', `/organizations/${orgId}/members`, {
        email,
        name: email,
        role,
        password: 'temporal-123',
      });
    designer = await activate(s.app, 'luis@sur.pe', 'temporal-123');
    reviewer = await activate(s.app, 'rosa@sur.pe', 'temporal-123');
    mine = mineSchema.parse(
      (await call(admin, 'POST', `/organizations/${orgId}/mines`, { name: 'Cuajone' })).json(),
    ).id;
    await seedOrganization(t.db, s.auth, {
      email: 'admin@norte.pe',
      password: 'admin-inicial',
      name: 'Beto',
      organization: 'Minera Norte',
    });
    otherAdmin = await activate(s.app, 'admin@norte.pe', 'admin-inicial');
  });
  afterAll(async () => {
    await t.drop();
  });

  it('comparte un punto con la mina, lo actualiza y lo borra', async () => {
    const point: MonitoringPoint = {
      id: newId<'MonitoringPoint'>(),
      name: 'Galería 3370',
      position: { x: 10, y: 20, z: -180 },
      kind: 'underground-working',
    };
    const put = await call(designer, 'PUT', `/mines/${mine}/monitoring-points/${point.id}`, {
      point,
    });
    expect(put.status).toBe(200);
    const again = await call(designer, 'PUT', `/mines/${mine}/monitoring-points/${point.id}`, {
      point: { ...point, name: 'Galería 3370 N' },
    });
    expect(again.status).toBe(200);
    const list = minePointListSchema.parse(
      (await call(reviewer, 'GET', `/mines/${mine}/monitoring-points`)).json(),
    );
    expect(list.points.map((p) => [p.point.name, p.point.kind])).toEqual([
      ['Galería 3370 N', 'underground-working'],
    ]);
    // El revisor no edita; otra empresa no ve la mina.
    expect(
      (await call(reviewer, 'DELETE', `/mines/${mine}/monitoring-points/${point.id}`)).status,
    ).toBe(403);
    expect((await call(otherAdmin, 'GET', `/mines/${mine}/monitoring-points`)).status).toBe(404);
    expect(
      (await call(designer, 'DELETE', `/mines/${mine}/monitoring-points/${point.id}`)).status,
    ).toBe(200);
    expect(
      minePointListSchema.parse(
        (await call(designer, 'GET', `/mines/${mine}/monitoring-points`)).json(),
      ).points,
    ).toEqual([]);
  });

  it('guarda mediciones de sismógrafo (upsert por id) y las borra', async () => {
    const rec: SeismographRecord = {
      id: 'r1',
      date: '2026-10-01',
      zone: 'Norte',
      context: 'surface',
      charge: 120,
      distance: 150,
      ppv: 0.012,
    };
    const saved = await call(designer, 'POST', `/mines/${mine}/vibration-records`, {
      records: [rec, { ...rec, id: 'r2', distance: 300, ppv: 0.004 }],
    });
    expect(saved.status).toBe(200);
    await call(designer, 'POST', `/mines/${mine}/vibration-records`, {
      records: [{ ...rec, ppv: 0.013 }],
    });
    const list = vibrationRecordListSchema.parse(
      (await call(reviewer, 'GET', `/mines/${mine}/vibration-records`)).json(),
    );
    expect(list.records.map((r) => [r.id, r.ppv])).toEqual([
      ['r1', 0.013],
      ['r2', 0.004],
    ]);
    expect(
      (await call(designer, 'POST', `/mines/${mine}/vibration-records`, { records: [{ id: 'x' }] }))
        .status,
    ).toBe(400);
    expect((await call(designer, 'DELETE', `/mines/${mine}/vibration-records/r2`)).status).toBe(
      200,
    );
    expect((await call(designer, 'DELETE', `/mines/${mine}/vibration-records/r2`)).status).toBe(
      404,
    );
  });
});
