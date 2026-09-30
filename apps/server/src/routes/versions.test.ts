import {
  auditListSchema,
  mineSchema,
  projectSummarySchema,
  versionListSchema,
  versionSchema,
  type ProjectVersion,
} from '@cronos/api';
import {
  createEmptyProject,
  createHole,
  DEFAULT_BENCH,
  DEFAULT_HOLE_TEMPLATE,
  parseProjectFile,
  toProjectFile,
  type Project,
} from '@cronos/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  activate,
  createTestApp,
  TEST_ORIGIN,
  type TestApp,
  seedOrganization,
} from '../test/testApp';
import { createTestDb, databaseAvailable, type TestDb } from '../test/testDb';

type Method = 'GET' | 'POST';

/** Proyecto con 4 taladros; las pruebas lo modifican a mano y esperan exactamente ese cambio. */
function project(): Project {
  const p = createEmptyProject('Banco 3400', new Date('2026-09-30T10:00:00Z'));
  const blast = p.blasts[0];
  if (!blast) throw new Error('sin voladura');
  blast.holes = Array.from({ length: 4 }, (_, i) =>
    createHole({
      position: { x: i * 5, y: 0 },
      template: DEFAULT_HOLE_TEMPLATE,
      bench: DEFAULT_BENCH,
      label: `H${i + 1}`,
    }),
  );
  return p;
}

const fileOf = (p: Project) => toProjectFile(p, { appVersion: 'test' });

describe.runIf(await databaseAvailable())('historial de versiones (NF-08, D-14)', () => {
  let t: TestDb;
  let s: TestApp;
  let orgId: string;
  let admin: string;
  let designer: string;
  let reviewer: string;
  let projectId: string;
  let v1: ProjectVersion;
  let original: Project;
  const call = async (cookie: string, method: Method, url: string, payload?: unknown) => {
    const res = await s.app.inject({
      method,
      url: `/api${url}`,
      headers: { ...TEST_ORIGIN, cookie },
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    });
    return { status: res.statusCode, body: res.body, json: () => res.json<unknown>() };
  };
  const publish = (parentVersionId: string, p: Project, message = 'Cambio', cookie = designer) =>
    call(cookie, 'POST', `/projects/${projectId}/versions`, {
      parentVersionId,
      message,
      file: fileOf(p),
    });
  const latestProject = async (): Promise<Project> => {
    const res = await call(designer, 'GET', `/projects/${projectId}/versions/latest/content`);
    const parsed = parseProjectFile(res.body);
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.file.project;
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
    for (const [email, role] of [
      ['luis@sur.pe', 'designer'],
      ['rosa@sur.pe', 'reviewer'],
    ] as const)
      await call(admin, 'POST', `/organizations/${orgId}/members`, {
        email,
        name: email === 'luis@sur.pe' ? 'Luis' : 'Rosa',
        role,
        password: 'temporal-123',
      });
    designer = await activate(s.app, 'luis@sur.pe', 'temporal-123');
    reviewer = await activate(s.app, 'rosa@sur.pe', 'temporal-123');
    const mine = mineSchema.parse(
      (await call(admin, 'POST', `/organizations/${orgId}/mines`, { name: 'Cuajone' })).json(),
    );
    const created = projectSummarySchema.parse(
      (
        await call(designer, 'POST', `/mines/${mine.id}/projects`, {
          file: fileOf(project()),
          message: 'Inicial',
        })
      ).json(),
    );
    projectId = created.id;
    v1 = created.latest;
    original = await latestProject();
  });
  afterAll(async () => {
    await t.drop();
  });

  it('publica la versión 2 sobre la 1 con el resumen de cambios', async () => {
    const edited = structuredClone(original);
    const h1 = edited.blasts[0]?.holes[0];
    if (!h1) throw new Error('fixture');
    h1.collar.y += 0.8; // un taladro movido 0,8 m
    edited.blasts[0]?.holes.pop(); // uno quitado
    const res = await publish(v1.id, edited, 'Muevo H1 y quito H4');
    expect(res.status).toBe(201);
    const v2 = versionSchema.parse(res.json());
    expect(v2).toMatchObject({
      number: 2,
      parentVersionId: v1.id,
      restoredFromVersionId: null,
      authorName: 'Luis',
      message: 'Muevo H1 y quito H4',
      holeCount: 3,
    });
    expect(v2.summary).toMatchObject({ holesMoved: 1, holesRemoved: 1, holesAdded: 0 });
    const list = versionListSchema.parse(
      (await call(reviewer, 'GET', `/projects/${projectId}/versions`)).json(),
    );
    expect(list.versions.map((v) => v.number)).toEqual([2, 1]);
    expect(list.versions[1]?.summary).toBeNull();
  });

  it('publicar sobre una versión vieja es un conflicto (otro publicó antes)', async () => {
    const edited = structuredClone(original);
    edited.name = 'Otra idea';
    const res = await publish(v1.id, edited);
    expect(res.status).toBe(409);
    expect(res.json()).toMatchObject({ code: 'version_conflict' });
  });

  it('publicar sin cambios se rechaza', async () => {
    const list = versionListSchema.parse(
      (await call(designer, 'GET', `/projects/${projectId}/versions`)).json(),
    );
    const head = list.versions[0];
    if (!head) throw new Error('fixture');
    const res = await publish(head.id, await latestProject());
    expect(res.status).toBe(409);
    expect(res.json()).toMatchObject({ code: 'no_changes' });
  });

  it('el revisor no publica ni restaura (H-801)', async () => {
    const list = versionListSchema.parse(
      (await call(reviewer, 'GET', `/projects/${projectId}/versions`)).json(),
    );
    const head = list.versions[0]?.id ?? '';
    const edited = await latestProject();
    edited.name = 'Revisado';
    expect((await publish(head, edited, 'x', reviewer)).status).toBe(403);
    const restore = await call(reviewer, 'POST', `/projects/${projectId}/versions/1/restore`, {
      parentVersionId: head,
      message: 'x',
    });
    expect(restore.status).toBe(403);
  });

  it('restaurar la 1 crea la 3 con el contenido de la 1, sin borrar la 2', async () => {
    const list = versionListSchema.parse(
      (await call(designer, 'GET', `/projects/${projectId}/versions`)).json(),
    );
    const head = list.versions[0];
    if (!head) throw new Error('fixture');
    const res = await call(designer, 'POST', `/projects/${projectId}/versions/1/restore`, {
      parentVersionId: head.id,
      message: 'Vuelvo a la inicial',
    });
    expect(res.status).toBe(201);
    const v3 = versionSchema.parse(res.json());
    expect(v3).toMatchObject({ number: 3, restoredFromVersionId: v1.id, holeCount: 4 });
    expect(v3.contentHash).not.toBe(head.contentHash);
    expect(v3.summary).toMatchObject({ holesMoved: 1, holesAdded: 1 });
    const restored = await latestProject();
    expect(restored.blasts[0]?.holes).toEqual(original.blasts[0]?.holes);
    const all = versionListSchema.parse(
      (await call(designer, 'GET', `/projects/${projectId}/versions`)).json(),
    );
    expect(all.versions.map((v) => v.number)).toEqual([3, 2, 1]);
  });

  it('dos publicaciones simultáneas sobre la misma base: una entra y la otra es conflicto', async () => {
    const list = versionListSchema.parse(
      (await call(designer, 'GET', `/projects/${projectId}/versions`)).json(),
    );
    const head = list.versions[0]?.id ?? '';
    const a = await latestProject();
    a.name = 'Variante A';
    const b = await latestProject();
    b.name = 'Variante B';
    const results = await Promise.all([publish(head, a, 'A'), publish(head, b, 'B')]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('la auditoría registra publicaciones y restauraciones', async () => {
    expect((await call(designer, 'GET', `/organizations/${orgId}/audit`)).status).toBe(403);
    const audit = auditListSchema.parse(
      (await call(admin, 'GET', `/organizations/${orgId}/audit`)).json(),
    );
    const actions = audit.events.map((e) => e.action);
    expect(actions.filter((a) => a === 'version.create')).toHaveLength(2);
    expect(actions).toContain('version.restore');
    expect(actions).toContain('project.create');
  });
});
