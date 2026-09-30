import { mineSchema, mineSurveyListSchema, projectSummarySchema } from '@cronos/api';
import {
  buildSurvey,
  bytesToBase64,
  createEmptyProject,
  newId,
  parseProjectFile,
  toProjectFile,
  type Project,
  type TopographySurvey,
} from '@cronos/core';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  activate,
  createTestApp,
  seedOrganization,
  TEST_ORIGIN,
  type TestApp,
} from '../test/testApp';
import { createTestDb, databaseAvailable, type TestDb } from '../test/testDb';

type Method = 'GET' | 'POST' | 'PUT';

/** Levantamiento mínimo (2 triángulos) y su asset `CRTS`; `z` cambia el contenido y el hash. */
function survey(z = 4250): { survey: TopographySurvey; hash: string; bytes: Uint8Array } {
  const built = buildSurvey(
    { name: `Tajo ${String(z)}`, surveyDate: '2026-09-15', format: 'points', files: ['tajo.csv'] },
    {
      tin: {
        vertices: Float64Array.from([0, 0, z, 10, 0, z, 10, 10, z + 1, 0, 10, z]),
        triangles: Uint32Array.from([0, 1, 2, 0, 2, 3]),
      },
    },
  );
  const asset = built.assets[0];
  if (!asset) throw new Error('sin asset');
  return {
    survey: { ...built.survey, id: newId<'TopographySurvey'>() },
    hash: asset.hash,
    bytes: asset.bytes,
  };
}

function projectWith(s: TopographySurvey | null): Project {
  const p = createEmptyProject('Banco 3400', new Date('2026-09-30T10:00:00Z'));
  if (s) p.topography = [s];
  return p;
}

describe.runIf(await databaseAvailable())('topografía de la mina (D-16)', () => {
  let t: TestDb;
  let s: TestApp;
  let designer: string;
  let reviewer: string;
  let otherAdmin: string;
  let cuajone: string;
  let toquepala: string;
  let norte: string;
  const tajo = survey();

  const call = async (
    cookie: string,
    method: Method,
    url: string,
    payload?: unknown,
    headers: Record<string, string> = {},
  ) => {
    const res = await s.app.inject({
      method,
      url: `/api${url}`,
      headers: { ...TEST_ORIGIN, cookie, ...headers },
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    });
    return {
      status: res.statusCode,
      body: res.body,
      raw: res.rawPayload,
      headers: res.headers,
      json: () => res.json<Record<string, unknown>>(),
    };
  };
  const upload = (cookie: string, mine: string, hash: string, bytes: Uint8Array) =>
    call(cookie, 'PUT', `/mines/${mine}/assets/${hash}`, Buffer.from(bytes), {
      'content-type': 'application/octet-stream',
    });

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
        name: email === 'luis@sur.pe' ? 'Luis' : 'Rosa',
        role,
        password: 'temporal-123',
      });
    designer = await activate(s.app, 'luis@sur.pe', 'temporal-123');
    reviewer = await activate(s.app, 'rosa@sur.pe', 'temporal-123');
    const mine = async (cookie: string, org: string, name: string) =>
      mineSchema.parse((await call(cookie, 'POST', `/organizations/${org}/mines`, { name })).json())
        .id;
    cuajone = await mine(admin, orgId, 'Cuajone');
    toquepala = await mine(admin, orgId, 'Toquepala');
    // Otra empresa, con su propia mina.
    await seedOrganization(t.db, s.auth, {
      email: 'admin@norte.pe',
      password: 'admin-inicial',
      name: 'Beto',
      organization: 'Minera Norte',
    });
    otherAdmin = await activate(s.app, 'admin@norte.pe', 'admin-inicial');
    const otherOrg =
      (
        (await call(otherAdmin, 'GET', '/organizations')).json().organizations as { id: string }[]
      )[0]?.id ?? '';
    norte = await mine(otherAdmin, otherOrg, 'Norte');
  });
  afterAll(async () => {
    await t.drop();
  });

  it('sube un asset una sola vez, verificando su hash y su contenido', async () => {
    const missing = await call(designer, 'POST', `/mines/${cuajone}/assets/missing`, {
      hashes: [tajo.hash],
    });
    expect(missing.json()).toEqual({ missing: [tajo.hash] });
    expect((await upload(reviewer, cuajone, tajo.hash, tajo.bytes)).status).toBe(403);
    const wrongHash = await upload(designer, cuajone, 'a'.repeat(64), tajo.bytes);
    expect([wrongHash.status, wrongHash.json().code]).toEqual([400, 'asset_hash_mismatch']);
    const junk = new TextEncoder().encode('no es un asset');
    const { createHash } = await import('node:crypto');
    const junkHash = createHash('sha256').update(junk).digest('hex');
    const invalid = await upload(designer, cuajone, junkHash, junk);
    expect([invalid.status, invalid.json().code]).toEqual([400, 'invalid_asset']);

    const ok = await upload(designer, cuajone, tajo.hash, tajo.bytes);
    expect(ok.status).toBe(201);
    expect(ok.json()).toEqual({ hash: tajo.hash, kind: 'tin', sizeBytes: tajo.bytes.byteLength });
    expect((await upload(designer, cuajone, tajo.hash, tajo.bytes)).status).toBe(201);
    const after = await call(designer, 'POST', `/mines/${cuajone}/assets/missing`, {
      hashes: [tajo.hash],
    });
    expect(after.json()).toEqual({ missing: [] });
  });

  it('quien ve la mina descarga el asset (inmutable, con ETag); otra empresa no', async () => {
    const res = await call(reviewer, 'GET', `/mines/${toquepala}/assets/${tajo.hash}`);
    expect(res.status).toBe(200);
    expect(new Uint8Array(res.raw)).toEqual(tajo.bytes);
    expect(res.headers['cache-control']).toContain('immutable');
    const cached = await call(reviewer, 'GET', `/mines/${cuajone}/assets/${tajo.hash}`, undefined, {
      'if-none-match': `"${tajo.hash}"`,
    });
    expect(cached.status).toBe(304);
    expect((await call(otherAdmin, 'GET', `/mines/${cuajone}/assets/${tajo.hash}`)).status).toBe(
      404,
    );
    // Los assets son por empresa: el mismo hash no existe en la mina de la otra.
    expect((await call(otherAdmin, 'GET', `/mines/${norte}/assets/${tajo.hash}`)).status).toBe(404);
  });

  it('al crear un proyecto registra su levantamiento en la mina', async () => {
    const res = await call(designer, 'POST', `/mines/${cuajone}/projects`, {
      file: toProjectFile(projectWith(tajo.survey), { appVersion: 'test' }),
    });
    expect(res.status).toBe(201);
    const list = mineSurveyListSchema.parse(
      (await call(reviewer, 'GET', `/mines/${cuajone}/surveys`)).json(),
    );
    expect(list.surveys.map((x) => [x.survey.id, x.createdBy?.name])).toEqual([
      [tajo.survey.id, 'Luis'],
    ]);
  });

  it('un levantamiento pertenece a una sola mina', async () => {
    const res = await call(designer, 'POST', `/mines/${toquepala}/projects`, {
      file: toProjectFile(projectWith(tajo.survey), { appVersion: 'test' }),
    });
    expect([res.status, res.json().code]).toEqual([409, 'survey_other_mine']);
  });

  it('no publica un levantamiento cuyos datos no se subieron', async () => {
    const created = projectSummarySchema.parse(
      (
        await call(designer, 'POST', `/mines/${cuajone}/projects`, {
          file: toProjectFile(projectWith(null), { appVersion: 'test' }),
        })
      ).json(),
    );
    const nuevo = survey(4300);
    const res = await call(designer, 'POST', `/projects/${created.id}/versions`, {
      parentVersionId: created.latest.id,
      message: 'Topografía nueva',
      file: toProjectFile(projectWith(nuevo.survey), { appVersion: 'test' }),
    });
    expect([res.status, res.json().code]).toEqual([409, 'missing_assets']);
  });

  it('un .cronos.json con assets embebidos los guarda aparte y la versión no los copia', async () => {
    const embebido = survey(4400);
    const file = toProjectFile(projectWith(embebido.survey), {
      appVersion: 'test',
      embeddedAssets: { [embebido.hash]: bytesToBase64(embebido.bytes) },
    });
    const created = projectSummarySchema.parse(
      (await call(designer, 'POST', `/mines/${toquepala}/projects`, { file })).json(),
    );
    const content = await call(designer, 'GET', `/projects/${created.id}/versions/latest/content`);
    const parsed = parseProjectFile(content.body);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.file.embeddedAssets).toBeUndefined();
    expect(parsed.file.project.topography.map((x) => x.id)).toEqual([embebido.survey.id]);
    const asset = await call(reviewer, 'GET', `/mines/${toquepala}/assets/${embebido.hash}`);
    expect(new Uint8Array(asset.raw)).toEqual(embebido.bytes);
  });

  it('los assets son inmutables en la base', async () => {
    await expect(
      sql`update "topography_asset" set "sizeBytes" = 0 where "hash" = ${tajo.hash}`.execute(t.db),
    ).rejects.toThrow(/immutable/);
  });
});
