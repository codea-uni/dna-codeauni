import {
  memberListSchema,
  mineSchema,
  projectSummarySchema,
  timelineSchema,
  versionSchema,
} from '@cronos/api';
import { createEmptyProject, toProjectFile, type Project } from '@cronos/core';
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

describe.runIf(await databaseAvailable())('línea de tiempo de la mina (D-14)', () => {
  let t: TestDb;
  let s: TestApp;
  let admin: string;
  let luis: string;
  let rosa: string;
  let mineId: string;
  let orgId: string;
  const projectIds: string[] = [];
  const call = async (cookie: string, method: Method, url: string, payload?: unknown) => {
    const res = await s.app.inject({
      method,
      url: `/api${url}`,
      headers: { ...TEST_ORIGIN, cookie },
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    });
    return {
      status: res.statusCode,
      body: res.body,
      headers: res.headers,
      json: () => res.json<unknown>(),
    };
  };
  const timeline = async (query = '', cookie = rosa) =>
    timelineSchema.parse((await call(cookie, 'GET', `/mines/${mineId}/versions${query}`)).json());

  /** Publica una versión cambiando el nombre del proyecto (un cambio conocido). */
  const publish = async (cookie: string, projectId: string, name: string) => {
    const versions = (await call(cookie, 'GET', `/projects/${projectId}/versions`)).json() as {
      versions: { id: string }[];
    };
    const content = await call(cookie, 'GET', `/projects/${projectId}/versions/latest/content`);
    const file = JSON.parse(content.body) as { project: Project };
    file.project.name = name;
    const res = await call(cookie, 'POST', `/projects/${projectId}/versions`, {
      parentVersionId: versions.versions[0]?.id,
      message: `Renombro a ${name}`,
      file,
    });
    return versionSchema.parse(res.json());
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
    orgId = orgs.organizations[0]?.id ?? '';
    for (const [email, name, role] of [
      ['luis@sur.pe', 'Luis', 'designer'],
      ['rosa@sur.pe', 'Rosa', 'reviewer'],
    ] as const)
      await call(admin, 'POST', `/organizations/${orgId}/members`, {
        email,
        name,
        role,
        password: 'temporal-123',
      });
    luis = await activate(s.app, 'luis@sur.pe', 'temporal-123');
    rosa = await activate(s.app, 'rosa@sur.pe', 'temporal-123');
    mineId = mineSchema.parse(
      (await call(admin, 'POST', `/organizations/${orgId}/mines`, { name: 'Cuajone' })).json(),
    ).id;
    // Dos proyectos (v1 cada uno), luego 3 versiones más alternando autores:
    // A v1 (Luis), B v1 (Ana), A v2 (Luis), B v2 (Ana), A v3 (Luis)
    for (const [cookie, name] of [
      [luis, 'Banco 3400'],
      [admin, 'Banco 3385'],
    ] as const) {
      const file = toProjectFile(createEmptyProject(name), { appVersion: 'test' });
      const p = projectSummarySchema.parse(
        (
          await call(cookie, 'POST', `/mines/${mineId}/projects`, { file, message: 'Inicial' })
        ).json(),
      );
      projectIds.push(p.id);
    }
    const [a = '', b = ''] = projectIds;
    await publish(luis, a, 'Banco 3400 rev. B');
    await publish(admin, b, 'Banco 3385 rev. B');
    await publish(luis, a, 'Banco 3400 rev. C');
  });
  afterAll(async () => {
    await t.drop();
  });

  it('lista las versiones de todos los proyectos, de la más nueva a la más vieja', async () => {
    const tl = await timeline();
    expect(tl.hasMore).toBe(false);
    expect(tl.versions.map((v) => `${v.projectName} v${v.number} ${v.authorName}`)).toEqual([
      'Banco 3400 rev. C v3 Luis',
      'Banco 3385 rev. B v2 Ana',
      'Banco 3400 rev. B v2 Luis',
      'Banco 3385 v1 Ana',
      'Banco 3400 v1 Luis',
    ]);
    const dates = tl.versions.map((v) => Date.parse(v.createdAt));
    expect([...dates].sort((x, y) => y - x)).toEqual(dates);
  });

  it('filtra por proyecto y por autor', async () => {
    const onlyA = await timeline(`?projectId=${projectIds[0] ?? ''}`);
    expect(onlyA.versions.map((v) => v.number)).toEqual([3, 2, 1]);
    const members = memberListSchema.parse(
      (await call(admin, 'GET', `/organizations/${orgId}/members`)).json(),
    );
    const anaId = members.members.find((m) => m.name === 'Ana')?.userId ?? '';
    const byAna = await timeline(`?authorId=${anaId}`);
    expect(byAna.versions.map((v) => v.projectName)).toEqual(['Banco 3385 rev. B', 'Banco 3385']);
  });

  it('filtra por fechas y pagina con `before`', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect((await timeline(`?from=${future}`)).versions).toEqual([]);
    const page1 = await timeline('?limit=2');
    expect(page1.versions).toHaveLength(2);
    expect(page1.hasMore).toBe(true);
    const page2 = await timeline(`?limit=10&before=${page1.versions.at(-1)?.id ?? ''}`);
    expect(page2.hasMore).toBe(false);
    const all = await timeline();
    expect([...page1.versions, ...page2.versions].map((v) => v.id)).toEqual(
      all.versions.map((v) => v.id),
    );
  });

  it('respeta el acceso a la mina', async () => {
    const outsider = await signedIn(s, { email: 'otro@norte.pe' });
    expect((await call(outsider, 'GET', `/mines/${mineId}/versions`)).status).toBe(404);
    const members = memberListSchema.parse(
      (await call(admin, 'GET', `/organizations/${orgId}/members`)).json(),
    );
    const luisId = members.members.find((m) => m.name === 'Luis')?.userId ?? '';
    await call(admin, 'PUT', `/mines/${mineId}/access`, { userIds: [luisId] });
    expect((await call(rosa, 'GET', `/mines/${mineId}/versions`)).status).toBe(404);
    await call(admin, 'PUT', `/mines/${mineId}/access`, { userIds: [] });
  });

  it('descarga el JSON de una versión como archivo', async () => {
    const res = await call(
      rosa,
      'GET',
      `/projects/${projectIds[0] ?? ''}/versions/2/content?download=1`,
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('Banco_3400_rev_B-v2.cronos.json');
    expect((JSON.parse(res.body) as { project: Project }).project.name).toBe('Banco 3400 rev. B');
  });
});
