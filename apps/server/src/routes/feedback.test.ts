import {
  feedbackCreatedSchema,
  feedbackDetailSchema,
  feedbackItemSchema,
  feedbackListSchema,
  feedbackSummarySchema,
} from '@cronos/api';
import { uuidv7 } from '@cronos/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureSuperAdmin } from '../auth/seed';
import {
  activate,
  createTestApp,
  seedOrganization,
  signedIn,
  signIn,
  TEST_ORIGIN,
  type TestApp,
} from '../test/testApp';
import { createTestDb, databaseAvailable, type TestDb } from '../test/testDb';
import { FEEDBACK_PER_HOUR } from './feedback';

type Method = 'GET' | 'POST' | 'PATCH';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

describe.runIf(await databaseAvailable())('buzón de mejoras (/api/feedback)', () => {
  let t: TestDb;
  let s: TestApp;
  let root: string;
  let ana: string;
  let orgId: string;
  let mineId: string;
  const geminiCalls: string[] = [];
  let geminiReply: unknown = null;

  const call = async (cookie: string | null, method: Method, url: string, payload?: unknown) => {
    const res = await s.app.inject({
      method,
      url: `/api${url}`,
      headers: { ...TEST_ORIGIN, ...(cookie ? { cookie } : {}) },
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    });
    return { status: res.statusCode, json: () => res.json<Record<string, unknown>>() };
  };

  beforeAll(async () => {
    t = await createTestDb();
    s = createTestApp(t, {
      ai: { apiKey: 'clave', model: 'gemini-x', liteModel: 'gemini-lite-x' },
      fetch: (url, init) => {
        const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
        geminiCalls.push(`${href} ${typeof init?.body === 'string' ? init.body : ''}`);
        return Promise.resolve(Response.json(geminiReply));
      },
    });
    await ensureSuperAdmin(t.db, s.auth, {
      email: 'root@cronos.pe',
      password: 'root-inicial',
      name: 'Plataforma',
    });
    root = await activate(s.app, 'root@cronos.pe', 'root-inicial');
    orgId = await seedOrganization(t.db, s.auth, {
      email: 'ana@sur.pe',
      password: 'temporal-ana',
      name: 'Ana',
      organization: 'Minera Sur',
    });
    ana = await activate(s.app, 'ana@sur.pe', 'temporal-ana');
    mineId = uuidv7();
    await t.db
      .insertInto('mine')
      .values({
        id: mineId,
        organizationId: orgId,
        name: 'Tajo Norte',
        epsg: null,
        createdBy: null,
      })
      .execute();
  });
  afterAll(async () => {
    await t.drop();
  });

  it('pide sesión para enviar', async () => {
    const res = await call(null, 'POST', '/feedback', { kind: 'bug', text: 'no carga' });
    expect(res.status).toBe(401);
  });

  it('guarda el pedido con la empresa y la persona de la sesión, no las del cuerpo', async () => {
    const res = await call(ana, 'POST', '/feedback', {
      kind: 'bug',
      text: 'El botón de carguío no responde',
      context: {
        screen: 'Carguío',
        tool: 'surface',
        windows: ['Carguío', 'Tiempos'],
        recentActions: [{ label: 'Cambiar explosivo' }],
        recentErrors: [{ message: 'TypeError: x is undefined' }],
        conversation: [{ role: 'user', text: 'no puedo cargar' }],
        extra: { lo: 'que sea' },
      },
      screenshot: PNG,
      mineId,
      projectId: 'no-existe',
      organizationId: 'otra-empresa',
      userId: 'otra-persona',
    });
    expect(res.status).toBe(201);
    const { id } = feedbackCreatedSchema.parse(res.json());
    const detail = feedbackDetailSchema.parse(
      (await call(root, 'GET', `/platform/feedback/${id}`)).json(),
    );
    expect(detail).toMatchObject({
      organizationId: orgId,
      organizationName: 'Minera Sur',
      userName: 'Ana',
      userEmail: 'ana@sur.pe',
      kind: 'bug',
      status: 'new',
      mineId,
      mineName: 'Tajo Norte',
      projectId: null,
      screen: 'Carguío',
      tool: 'surface',
      hasScreenshot: true,
      screenshot: PNG,
    });
    expect(detail.context).toMatchObject({
      windows: ['Carguío', 'Tiempos'],
      extra: { lo: 'que sea' },
    });
  });

  it('rechaza contexto o captura demasiado grandes y capturas que no son imagen', async () => {
    const bigContext = await call(ana, 'POST', '/feedback', {
      kind: 'idea',
      text: 'x',
      context: { notes: 'a'.repeat(70 * 1024) },
    });
    expect(bigContext.status).toBe(413);
    expect(bigContext.json()).toMatchObject({ code: 'context_too_large' });
    const bigShot = await call(ana, 'POST', '/feedback', {
      kind: 'idea',
      text: 'x',
      screenshot: `data:image/jpeg;base64,${'A'.repeat(1_600_000)}`,
    });
    expect(bigShot.status).toBe(413);
    expect(bigShot.json()).toMatchObject({ code: 'screenshot_too_large' });
    const notImage = await call(ana, 'POST', '/feedback', {
      kind: 'idea',
      text: 'x',
      screenshot: 'data:text/html;base64,PGI+',
    });
    expect(notImage.status).toBe(400);
    const badKind = await call(ana, 'POST', '/feedback', { kind: 'queja', text: 'x' });
    expect(badKind.status).toBe(400);
    const empty = await call(ana, 'POST', '/feedback', { kind: 'bug', text: '   ' });
    expect(empty.status).toBe(400);
  });

  it(`limita a ${String(FEEDBACK_PER_HOUR)} pedidos por persona y hora`, async () => {
    const spam = await signedIn(s, { email: 'spam@mina.pe' });
    for (let i = 0; i < FEEDBACK_PER_HOUR; i++)
      expect(
        (await call(spam, 'POST', '/feedback', { kind: 'idea', text: `idea ${String(i)}` })).status,
      ).toBe(201);
    const res = await call(spam, 'POST', '/feedback', { kind: 'idea', text: 'una más' });
    expect(res.status).toBe(429);
    expect(res.json()).toMatchObject({ code: 'feedback_rate_limited' });
    // Los de otra persona siguen entrando.
    expect(
      (await call(ana, 'POST', '/feedback', { kind: 'question', text: '¿Qué es el taco?' })).status,
    ).toBe(201);
  });

  it('la consola es solo del superadministrador', async () => {
    expect((await call(ana, 'GET', '/platform/feedback')).status).toBe(403);
    expect((await call(null, 'GET', '/platform/feedback')).status).toBe(401);
    expect((await call(ana, 'PATCH', '/platform/feedback/x', { status: 'done' })).status).toBe(403);
    expect((await call(ana, 'POST', '/platform/feedback/summarize', {})).status).toBe(403);
  });

  it('lista sin capturas, con filtros, búsqueda y paginado', async () => {
    const all = feedbackListSchema.parse((await call(root, 'GET', '/platform/feedback')).json());
    expect(all.total).toBe(FEEDBACK_PER_HOUR + 2);
    expect(all.newCount).toBe(FEEDBACK_PER_HOUR + 2);
    expect(all.items).toHaveLength(FEEDBACK_PER_HOUR + 2);
    expect(all.items[0]).not.toHaveProperty('screenshot');
    expect(all.items[0]?.text).toBe('¿Qué es el taco?');

    const bugs = feedbackListSchema.parse(
      (await call(root, 'GET', '/platform/feedback?kind=bug')).json(),
    );
    expect(bugs.items.map((i) => i.text)).toEqual(['El botón de carguío no responde']);
    const byOrg = feedbackListSchema.parse(
      (await call(root, 'GET', `/platform/feedback?organizationId=${orgId}`)).json(),
    );
    expect(byOrg.total).toBe(2);
    const search = feedbackListSchema.parse(
      (await call(root, 'GET', `/platform/feedback?q=${encodeURIComponent('CARGUÍO')}`)).json(),
    );
    expect(search.total).toBe(1);
    const byUser = feedbackListSchema.parse(
      (await call(root, 'GET', '/platform/feedback?q=spam%40')).json(),
    );
    expect(byUser.total).toBe(FEEDBACK_PER_HOUR);
    const literal = feedbackListSchema.parse(
      (await call(root, 'GET', '/platform/feedback?q=%25')).json(),
    );
    expect(literal.total).toBe(0);
    const page = feedbackListSchema.parse(
      (await call(root, 'GET', '/platform/feedback?limit=5&offset=20')).json(),
    );
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(FEEDBACK_PER_HOUR + 2);
    const ids = all.items.slice(0, 2).map((i) => i.id);
    const someIds = feedbackListSchema.parse(
      (await call(root, 'GET', `/platform/feedback?ids=${ids.join(',')}`)).json(),
    );
    expect(someIds.items.map((i) => i.id)).toEqual(ids);
    expect((await call(root, 'GET', '/platform/feedback?status=nuevo')).status).toBe(400);
  });

  it('cambia estado, tema y nota', async () => {
    const [bug] = feedbackListSchema.parse(
      (await call(root, 'GET', '/platform/feedback?kind=bug')).json(),
    ).items;
    const res = await call(root, 'PATCH', `/platform/feedback/${bug?.id ?? ''}`, {
      status: 'approved',
      theme: 'Carguío',
      adminNote: 'Programar en la próxima entrega',
    });
    expect(res.status).toBe(200);
    expect(feedbackItemSchema.parse(res.json())).toMatchObject({
      status: 'approved',
      theme: 'Carguío',
      adminNote: 'Programar en la próxima entrega',
    });
    const cleared = feedbackItemSchema.parse(
      (
        await call(root, 'PATCH', `/platform/feedback/${bug?.id ?? ''}`, { adminNote: null })
      ).json(),
    );
    expect(cleared).toMatchObject({ adminNote: null, theme: 'Carguío', status: 'approved' });
    const approved = feedbackListSchema.parse(
      (await call(root, 'GET', '/platform/feedback?status=approved')).json(),
    );
    expect(approved.total).toBe(1);
    expect(approved.newCount).toBe(FEEDBACK_PER_HOUR + 1);
    expect(
      (await call(root, 'PATCH', `/platform/feedback/${bug?.id ?? ''}`, { status: 'x' })).status,
    ).toBe(400);
    expect((await call(root, 'PATCH', `/platform/feedback/${bug?.id ?? ''}`, {})).status).toBe(400);
    expect(
      (await call(root, 'PATCH', '/platform/feedback/no-existe', { status: 'done' })).status,
    ).toBe(404);
    expect((await call(root, 'GET', '/platform/feedback/no-existe')).status).toBe(404);
  });

  it('agrupa los abiertos con el modelo barato y descarta ids inventados', async () => {
    const open = feedbackListSchema.parse(
      (await call(root, 'GET', '/platform/feedback?status=new&limit=200')).json(),
    ).items;
    const [a, b, c] = open.map((i) => i.id);
    geminiReply = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  themes: [
                    { theme: 'Dudas', summary: 's', ids: [c, 'inventado'], suggestion: 'x' },
                    { theme: 'Ideas', summary: 's', ids: [a, b, c], suggestion: 'y' },
                  ],
                }),
              },
            ],
          },
        },
      ],
    };
    const res = await call(root, 'POST', '/platform/feedback/summarize', {});
    expect(res.status).toBe(200);
    const summary = feedbackSummarySchema.parse(res.json());
    expect(summary.considered).toBe(open.length);
    expect(summary.themes).toEqual([
      { theme: 'Ideas', summary: 's', count: 2, ids: [a, b], suggestion: 'y' },
      { theme: 'Dudas', summary: 's', count: 1, ids: [c], suggestion: 'x' },
    ]);
    const sent = geminiCalls.at(-1) ?? '';
    expect(sent).toContain('/gemini-lite-x:generateContent');
    // Solo texto: el pedido aprobado y las capturas no viajan.
    expect(sent).not.toContain('iVBORw0KGgo');
    expect(sent).not.toContain('El botón de carguío');

    geminiReply = { candidates: [{ content: { parts: [{ text: 'no es json' }] } }] };
    const bad = await call(root, 'POST', '/platform/feedback/summarize', {});
    expect(bad.status).toBe(502);
  });

  it('sin clave de IA, agrupar responde ai_not_configured', async () => {
    const noAi = createTestApp(t);
    const cookie = await signIn(noAi.app, 'root@cronos.pe', 'root-inicial-definitiva');
    const res = await noAi.app.inject({
      method: 'POST',
      url: '/api/platform/feedback/summarize',
      headers: { ...TEST_ORIGIN, cookie },
      payload: {},
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: 'ai_not_configured' });
  });
});
