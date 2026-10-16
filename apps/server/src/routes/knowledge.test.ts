import {
  companyExplosiveListSchema,
  designPresetListSchema,
  knowledgeDocListSchema,
  knowledgeSearchResultSchema,
  mineSchema,
  projectKnowledgeSchema,
  projectSummarySchema,
} from '@cronos/api';
import { createDefaultLibrary, createEmptyProject, toProjectFile } from '@cronos/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureSuperAdmin } from '../auth/seed';
import { activate, createTestApp, seedOrganization, TEST_ORIGIN, type TestApp } from '../test/testApp';
import { createTestDb, databaseAvailable, type TestDb } from '../test/testDb';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

describe.runIf(await databaseAvailable())('capas de conocimiento del agente', () => {
  let t: TestDb;
  let s: TestApp;
  let root: string;
  let admin: string;
  let designer: string;
  let reviewer: string;
  let otherAdmin: string;
  let orgId: string;
  let otherOrgId: string;
  let antamina: string;
  let toquepala: string;
  let chinalco: string;
  let otherProject: string;

  const call = async (cookie: string, method: Method, url: string, payload?: unknown) => {
    const res = await s.app.inject({
      method,
      url: `/api${url}`,
      headers: { ...TEST_ORIGIN, cookie },
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    });
    return { status: res.statusCode, json: () => res.json<Record<string, unknown>>() };
  };
  const doc = (cookie: string, body: Record<string, unknown>) =>
    call(cookie, 'POST', '/knowledge', { category: 'procedure', ...body });
  const search = async (cookie: string, project: string, q: string, layer?: string) =>
    knowledgeSearchResultSchema.parse(
      (
        await call(
          cookie,
          'GET',
          `/projects/${project}/knowledge/search?q=${encodeURIComponent(q)}${layer ? `&layer=${layer}` : ''}`,
        )
      ).json(),
    ).hits;
  const newProject = async (cookie: string, mine: string, name: string) =>
    projectSummarySchema.parse(
      (
        await call(cookie, 'POST', `/mines/${mine}/projects`, {
          file: toProjectFile(createEmptyProject(name), { appVersion: 'test' }),
        })
      ).json(),
    ).id;

  beforeAll(async () => {
    t = await createTestDb();
    s = createTestApp(t);
    await ensureSuperAdmin(t.db, s.auth, {
      email: 'root@cronos.pe',
      password: 'root-inicial',
      name: 'Plataforma',
    });
    root = await activate(s.app, 'root@cronos.pe', 'root-inicial');
    orgId = await seedOrganization(t.db, s.auth, {
      email: 'admin@explo.pe',
      password: 'admin-inicial',
      name: 'Ana',
      organization: 'Explosivos del Sur',
    });
    admin = await activate(s.app, 'admin@explo.pe', 'admin-inicial');
    for (const [email, role] of [
      ['luis@explo.pe', 'designer'],
      ['rosa@explo.pe', 'reviewer'],
    ] as const)
      await call(admin, 'POST', `/organizations/${orgId}/members`, {
        email,
        name: email,
        role,
        password: 'temporal-123',
      });
    designer = await activate(s.app, 'luis@explo.pe', 'temporal-123');
    reviewer = await activate(s.app, 'rosa@explo.pe', 'temporal-123');
    const mine = async (cookie: string, org: string, name: string) =>
      mineSchema.parse((await call(cookie, 'POST', `/organizations/${org}/mines`, { name })).json())
        .id;
    antamina = await mine(admin, orgId, 'Antamina');
    toquepala = await mine(admin, orgId, 'Toquepala');
    chinalco = await newProject(designer, antamina, 'Fase 4');
    otherOrgId = await seedOrganization(t.db, s.auth, {
      email: 'admin@otra.pe',
      password: 'admin-inicial',
      name: 'Beto',
      organization: 'Otra',
    });
    otherAdmin = await activate(s.app, 'admin@otra.pe', 'admin-inicial');
    otherProject = await newProject(otherAdmin, await mine(otherAdmin, otherOrgId, 'Norte'), 'X');
  });
  afterAll(async () => {
    await t.drop();
  });

  it('cada capa la escribe quien corresponde', async () => {
    const general = { layer: 'general', ownerId: null, category: 'theory', title: 'Marco teórico' };
    expect((await doc(admin, { ...general, content: 'Burden y espaciamiento.' })).status).toBe(403);
    expect((await doc(root, { ...general, content: '# Burden\n\nEl burden depende del diámetro.' })).status).toBe(201);

    const org = { layer: 'organization', ownerId: orgId, title: 'Procedimiento de carguío' };
    expect((await doc(designer, { ...org, content: 'x' })).status).toBe(403);
    expect(
      (await doc(admin, { ...org, content: 'Cebar con booster de 450 g en taladros con agua.' })).status,
    ).toBe(201);
    expect((await doc(otherAdmin, { ...org, content: 'x' })).status).toBe(404);

    const site = { layer: 'mine', ownerId: antamina, category: 'geology', title: 'Geología' };
    expect((await doc(reviewer, { ...site, content: 'x' })).status).toBe(403);
    expect(
      (await doc(designer, { ...site, content: 'Skarn con agua freática a 8 m; terreno reactivo con pirita.' })).status,
    ).toBe(201);
    expect(
      (await doc(admin, { layer: 'mine', ownerId: toquepala, title: 'Otro sitio', content: 'Pórfido seco, pirita escasa.' })).status,
    ).toBe(201);

    const proj = { layer: 'project', ownerId: chinalco, category: 'lesson', title: 'Lección' };
    expect(
      (await doc(designer, { ...proj, content: 'En la voladura 12 hubo tiros cortados por agua.' })).status,
    ).toBe(201);

    const list = knowledgeDocListSchema.parse(
      (await call(reviewer, 'GET', `/knowledge?layer=mine&ownerId=${antamina}`)).json(),
    );
    expect(list.canWrite).toBe(false);
    expect(list.docs.map((d) => [d.title, d.chunks])).toEqual([['Geología', 1]]);
  });

  it('la búsqueda del proyecto junta su capa, su mina, su empresa y la general', async () => {
    const hits = await search(reviewer, chinalco, 'agua reactivo booster burden');
    expect(new Set(hits.map((h) => h.layer))).toEqual(
      new Set(['project', 'mine', 'organization', 'general']),
    );
    // Sin tildes ni mayúsculas, y sin la mina vecina (Toquepala) ni la otra empresa.
    const pirita = await search(reviewer, chinalco, 'PIRITA');
    expect(pirita.map((h) => [h.layer, h.owner])).toEqual([['mine', 'Antamina']]);
    expect(await search(reviewer, chinalco, 'pirita', 'general')).toEqual([]);
    expect(await search(otherAdmin, otherProject, 'booster pirita tiros')).toEqual([]);
    expect((await call(otherAdmin, 'GET', `/projects/${chinalco}/knowledge/search?q=agua`)).status).toBe(404);
    // La capa más cercana al diseño va primero cuando las dos hablan de lo mismo.
    const agua = await search(reviewer, chinalco, 'agua');
    expect(agua[0]?.layer).toBe('project');
  });

  it('el resumen del proyecto lista las capas y el catálogo de la empresa', async () => {
    const anfo = createDefaultLibrary().explosives[0];
    if (!anfo) throw new Error('sin ANFO');
    expect(
      (await call(designer, 'PUT', `/organizations/${orgId}/explosives/${anfo.id}`, { explosive: anfo })).status,
    ).toBe(403);
    expect(
      (await call(admin, 'PUT', `/organizations/${orgId}/explosives/${anfo.id}`, { explosive: anfo })).status,
    ).toBe(200);
    const catalog = companyExplosiveListSchema.parse(
      (await call(reviewer, 'GET', `/organizations/${orgId}/explosives`)).json(),
    );
    expect(catalog.explosives.map((e) => e.explosive.name)).toEqual(['ANFO']);
    expect((await call(otherAdmin, 'GET', `/organizations/${orgId}/explosives`)).status).toBe(404);

    const summary = projectKnowledgeSchema.parse(
      (await call(reviewer, 'GET', `/projects/${chinalco}/knowledge`)).json(),
    );
    expect(summary.mine.name).toBe('Antamina');
    expect(summary.companyExplosives).toEqual(['ANFO']);
    expect(summary.layers.map((l) => [l.layer, l.docs.length])).toEqual([
      ['general', 1],
      ['organization', 1],
      ['mine', 1],
      ['project', 1],
    ]);
  });

  it('editar el texto rehace los trozos y borrar quita el documento de la búsqueda', async () => {
    const list = knowledgeDocListSchema.parse(
      (await call(designer, 'GET', `/knowledge?layer=project&ownerId=${chinalco}`)).json(),
    );
    const id = list.docs[0]?.id ?? '';
    expect(
      (await call(designer, 'PATCH', `/knowledge/${id}`, { content: 'Usar emulsión gasificada en taladros húmedos.' })).status,
    ).toBe(200);
    expect((await search(designer, chinalco, 'emulsion', 'project')).length).toBe(1);
    expect((await search(designer, chinalco, 'cortados', 'project')).length).toBe(0);
    expect((await call(reviewer, 'DELETE', `/knowledge/${id}`)).status).toBe(403);
    expect((await call(designer, 'DELETE', `/knowledge/${id}`)).status).toBe(200);
    expect((await search(designer, chinalco, 'emulsion', 'project')).length).toBe(0);
  });

  it('presets: del sitio o de la empresa, sin nombres repetidos, y los ve otro proyecto de la empresa', async () => {
    const steps = [{ tool: 'generate_pattern', args: { kind: 'staggered', burden: 5, spacing: 6 } }];
    const save = (cookie: string, body: Record<string, unknown>) =>
      call(cookie, 'POST', `/projects/${chinalco}/presets`, { steps, ...body });
    expect((await save(reviewer, { name: 'Mineral', mineId: antamina })).status).toBe(403);
    expect((await save(designer, { name: 'Mineral', mineId: antamina })).status).toBe(201);
    expect((await save(designer, { name: 'mineral', mineId: antamina })).status).toBe(409);
    expect((await save(designer, { name: 'Estándar', mineId: null })).status).toBe(201);
    expect((await save(designer, { name: 'X', mineId: toquepala })).status).toBe(400);

    const other = await newProject(designer, toquepala, 'Otro');
    const list = (id: string, cookie = reviewer) =>
      call(cookie, 'GET', `/projects/${id}/presets`).then((r) =>
        designPresetListSchema.parse(r.json()).presets.map((p) => [p.name, p.mineName]),
      );
    expect(await list(chinalco)).toEqual([
      ['Estándar', null],
      ['Mineral', 'Antamina'],
    ]);
    expect(await list(other)).toEqual([['Estándar', null]]);
    expect((await call(otherAdmin, 'GET', `/projects/${chinalco}/presets`)).status).toBe(404);

    const id = designPresetListSchema.parse((await call(admin, 'GET', `/projects/${chinalco}/presets`)).json())
      .presets[0]?.id;
    expect((await call(reviewer, 'DELETE', `/presets/${id ?? ''}`)).status).toBe(403);
    expect((await call(admin, 'DELETE', `/presets/${id ?? ''}`)).status).toBe(200);
  });
});
