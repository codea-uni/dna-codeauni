import {
  memberListSchema,
  mineSchema,
  projectDetailSchema,
  projectListSchema,
  projectSummarySchema,
} from '@cronos/api';
import { createEmptyProject, EXAMPLES, parseProjectFile, toProjectFile } from '@cronos/core';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  activate,
  createTestApp,
  signedIn,
  TEST_ORIGIN,
  type TestApp,
  seedOrganization,
} from '../test/testApp';
import { createTestDb, databaseAvailable, type TestDb } from '../test/testDb';

type Method = 'GET' | 'POST' | 'PUT';

const fileOf = (project = createEmptyProject('Banco 3400')) =>
  toProjectFile(project, { appVersion: 'test', now: new Date('2026-09-30T12:00:00Z') });

describe.runIf(await databaseAvailable())('proyectos de una mina (D-14, NF-08)', () => {
  let t: TestDb;
  let s: TestApp;
  let admin: string;
  let designer: string;
  let reviewer: string;
  let mineId: string;
  const call = async (cookie: string, method: Method, url: string, payload?: unknown) => {
    const res = await s.app.inject({
      method,
      url: `/api${url}`,
      headers: { ...TEST_ORIGIN, cookie },
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    });
    return { status: res.statusCode, body: res.body, json: () => res.json<unknown>() };
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
    admin = await activate(s.app, 'admin@sur.pe', 'admin-inicial');
    const orgs = (await call(admin, 'GET', '/organizations')).json() as {
      organizations: { id: string }[];
    };
    const orgId = orgs.organizations[0]?.id ?? '';
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
    const mine = mineSchema.parse(
      (
        await call(admin, 'POST', `/organizations/${orgId}/mines`, { name: 'Cuajone', epsg: 32719 })
      ).json(),
    );
    mineId = mine.id;
  });
  afterAll(async () => {
    await t.drop();
  });

  it('el diseñador crea un proyecto: versión 1 con autor, mensaje y un id nuevo', async () => {
    const file = fileOf();
    const res = await call(designer, 'POST', `/mines/${mineId}/projects`, {
      file,
      message: 'Versión inicial',
    });
    expect(res.status).toBe(201);
    const p = projectSummarySchema.parse(res.json());
    expect(p).toMatchObject({ name: 'Banco 3400', versionCount: 1 });
    expect(p.id).not.toBe(file.project.id);
    expect(p.latest).toMatchObject({
      number: 1,
      authorName: 'luis@sur.pe',
      message: 'Versión inicial',
      holeCount: 0,
      parentVersionId: null,
    });
  });

  it('guarda el contenido completo y lo devuelve válido (ida y vuelta)', async () => {
    const example = EXAMPLES[0];
    if (!example) throw new Error('sin ejemplos');
    const project = example.build();
    project.coordinateSystem = { ...project.coordinateSystem, epsg: 32719 };
    const holes = project.blasts.reduce((n, b) => n + b.holes.length, 0);
    expect(holes).toBeGreaterThan(0);
    const created = projectSummarySchema.parse(
      (await call(designer, 'POST', `/mines/${mineId}/projects`, { file: fileOf(project) })).json(),
    );
    expect(created.latest.holeCount).toBe(holes);

    const content = await call(reviewer, 'GET', `/projects/${created.id}/versions/latest/content`);
    expect(content.status).toBe(200);
    const parsed = parseProjectFile(content.body);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.file.project.id).toBe(created.id);
    expect(parsed.file.project.blasts[0]?.holes).toEqual(project.blasts[0]?.holes);
    const byNumber = await call(reviewer, 'GET', `/projects/${created.id}/versions/1/content`);
    expect(byNumber.body).toBe(content.body);
    expect((await call(reviewer, 'GET', `/projects/${created.id}/versions/2/content`)).status).toBe(
      404,
    );
    expect((await call(reviewer, 'GET', `/projects/${created.id}/versions/x/content`)).status).toBe(
      400,
    );
  });

  it('el revisor lista y abre, pero no crea proyectos (H-801)', async () => {
    const list = projectListSchema.parse(
      (await call(reviewer, 'GET', `/mines/${mineId}/projects`)).json(),
    );
    expect(list.projects).toHaveLength(2);
    const detail = projectDetailSchema.parse(
      (await call(reviewer, 'GET', `/projects/${list.projects[0]?.id ?? ''}`)).json(),
    );
    expect(detail.role).toBe('reviewer');
    expect(detail.mine.name).toBe('Cuajone');
    const res = await call(reviewer, 'POST', `/mines/${mineId}/projects`, { file: fileOf() });
    expect(res.status).toBe(403);
  });

  it('rechaza un archivo inválido y un CRS distinto al de la mina', async () => {
    const bad = await call(designer, 'POST', `/mines/${mineId}/projects`, {
      file: { format: 'otro' },
    });
    expect(bad.status).toBe(400);
    expect(bad.json()).toMatchObject({ code: 'invalid_project' });
    const project = createEmptyProject('Otro CRS');
    project.coordinateSystem = { ...project.coordinateSystem, epsg: 32718 };
    const crs = await call(designer, 'POST', `/mines/${mineId}/projects`, {
      file: fileOf(project),
    });
    expect(crs.status).toBe(409);
    expect(crs.json()).toMatchObject({ code: 'crs_mismatch' });
  });

  it('una mina restringida oculta también sus proyectos', async () => {
    const list = projectListSchema.parse(
      (await call(admin, 'GET', `/mines/${mineId}/projects`)).json(),
    );
    const projectId = list.projects[0]?.id ?? '';
    const orgs = (await call(admin, 'GET', '/organizations')).json() as {
      organizations: { id: string }[];
    };
    const members = memberListSchema.parse(
      (
        await call(admin, 'GET', `/organizations/${orgs.organizations[0]?.id ?? ''}/members`)
      ).json(),
    );
    const luisId = members.members.find((m) => m.email === 'luis@sur.pe')?.userId ?? '';
    await call(admin, 'PUT', `/mines/${mineId}/access`, { userIds: [luisId] });
    expect((await call(reviewer, 'GET', `/projects/${projectId}`)).status).toBe(404);
    expect(
      (await call(reviewer, 'GET', `/projects/${projectId}/versions/latest/content`)).status,
    ).toBe(404);
    expect((await call(designer, 'GET', `/projects/${projectId}`)).status).toBe(200);
    await call(admin, 'PUT', `/mines/${mineId}/access`, { userIds: [] });

    const outsider = await signedIn(s, { email: 'otro@norte.pe' });
    expect((await call(outsider, 'GET', `/mines/${mineId}/projects`)).status).toBe(404);
  });

  it('las versiones son inmutables en la base', async () => {
    await expect(sql`update "project_version" set "message" = 'x'`.execute(t.db)).rejects.toThrow(
      /immutable/,
    );
    await expect(sql`delete from "project_version"`.execute(t.db)).rejects.toThrow(/immutable/);
  });
});
