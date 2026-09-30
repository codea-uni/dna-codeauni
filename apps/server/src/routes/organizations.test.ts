import {
  auditListSchema,
  memberListSchema,
  memberSchema,
  mineDetailSchema,
  mineListSchema,
  mineSchema,
  organizationListSchema,
  organizationSchema,
} from '@cronos/api';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedInitialAdmin } from '../auth/seed';
import {
  activate,
  createTestApp,
  signIn,
  signedIn,
  TEST_ORIGIN,
  type TestApp,
} from '../test/testApp';
import { createTestDb, databaseAvailable, type TestDb } from '../test/testDb';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

describe.runIf(await databaseAvailable())('empresas, miembros y minas (D-14, H-801)', () => {
  let t: TestDb;
  let s: TestApp;
  let admin: string;
  let orgId: string;
  const call = async (cookie: string, method: Method, url: string, payload?: unknown) => {
    const res = await s.app.inject({
      method,
      url: `/api${url}`,
      headers: { ...TEST_ORIGIN, cookie },
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    });
    return { status: res.statusCode, body: res.json<unknown>() };
  };

  beforeAll(async () => {
    t = await createTestDb();
    s = createTestApp(t);
    await seedInitialAdmin(t.db, s.auth, {
      email: 'admin@sur.pe',
      password: 'admin-inicial',
      name: 'Ana Admin',
      organization: 'Minera Sur',
    });
    const temporary = await signIn(s.app, 'admin@sur.pe', 'admin-inicial');
    const blocked = await call(temporary, 'GET', '/organizations');
    expect(blocked).toMatchObject({ status: 403, body: { code: 'password_change_required' } });
    admin = await activate(s.app, 'admin@sur.pe', 'admin-inicial');
    const orgs = organizationListSchema.parse((await call(admin, 'GET', '/organizations')).body);
    expect(orgs.organizations).toHaveLength(1);
    expect(orgs.organizations[0]).toMatchObject({ name: 'Minera Sur', role: 'admin' });
    orgId = orgs.organizations[0]?.id ?? '';
  });
  afterAll(async () => {
    await t.drop();
  });

  it('el administrador da de alta cuentas con contraseña temporal y rol', async () => {
    const res = await call(admin, 'POST', `/organizations/${orgId}/members`, {
      email: 'Luis@Sur.pe',
      name: 'Luis Diseñador',
      role: 'designer',
      password: 'temporal-luis',
    });
    expect(res.status).toBe(201);
    expect(memberSchema.parse(res.body)).toMatchObject({ email: 'luis@sur.pe', role: 'designer' });
    await call(admin, 'POST', `/organizations/${orgId}/members`, {
      email: 'rosa@sur.pe',
      name: 'Rosa Revisora',
      role: 'reviewer',
      password: 'temporal-rosa',
    });
    await activate(s.app, 'rosa@sur.pe', 'temporal-rosa');
    const luis = await activate(s.app, 'luis@sur.pe', 'temporal-luis');
    const list = memberListSchema.parse(
      (await call(luis, 'GET', `/organizations/${orgId}/members`)).body,
    );
    expect(list.members.map((m) => [m.email, m.role])).toEqual([
      ['admin@sur.pe', 'admin'],
      ['luis@sur.pe', 'designer'],
      ['rosa@sur.pe', 'reviewer'],
    ]);
  });

  it('una cuenta nueva necesita contraseña temporal y no se agrega dos veces', async () => {
    const noPw = await call(admin, 'POST', `/organizations/${orgId}/members`, {
      email: 'sin@sur.pe',
      name: 'Sin Clave',
      role: 'designer',
    });
    expect(noPw).toMatchObject({ status: 400, body: { code: 'password_required' } });
    const again = await call(admin, 'POST', `/organizations/${orgId}/members`, {
      email: 'luis@sur.pe',
      name: 'Luis',
      role: 'reviewer',
    });
    expect(again).toMatchObject({ status: 409, body: { code: 'already_member' } });
  });

  it('diseñador y revisor no administran la empresa (403)', async () => {
    const luis = await signIn(s.app, 'luis@sur.pe', 'temporal-luis-definitiva');
    const rosa = await signIn(s.app, 'rosa@sur.pe', 'temporal-rosa-definitiva');
    const add = await call(luis, 'POST', `/organizations/${orgId}/members`, {
      email: 'x@sur.pe',
      name: 'X',
      role: 'admin',
      password: 'temporal-xxx',
    });
    expect(add.status).toBe(403);
    expect(
      (await call(rosa, 'POST', `/organizations/${orgId}/mines`, { name: 'Tajo' })).status,
    ).toBe(403);
    expect((await call(luis, 'GET', `/organizations/${orgId}/audit`)).status).toBe(403);
  });

  it('las minas: el administrador las crea y todos los miembros las ven', async () => {
    const res = await call(admin, 'POST', `/organizations/${orgId}/mines`, {
      name: 'Cuajone',
      epsg: 32719,
    });
    expect(res.status).toBe(201);
    const mine = mineSchema.parse(res.body);
    expect(mine).toMatchObject({
      name: 'Cuajone',
      epsg: 32719,
      restricted: false,
      accessUserIds: [],
    });
    await call(admin, 'POST', `/organizations/${orgId}/mines`, { name: 'Toquepala' });
    const rosa = await signIn(s.app, 'rosa@sur.pe', 'temporal-rosa-definitiva');
    const list = mineListSchema.parse(
      (await call(rosa, 'GET', `/organizations/${orgId}/mines`)).body,
    );
    expect(list.mines.map((m) => m.name)).toEqual(['Cuajone', 'Toquepala']);
    const detail = mineDetailSchema.parse((await call(rosa, 'GET', `/mines/${mine.id}`)).body);
    expect(detail.role).toBe('reviewer');
  });

  it('una mina restringida solo la ven sus usuarios y los administradores', async () => {
    const luis = await signIn(s.app, 'luis@sur.pe', 'temporal-luis-definitiva');
    const rosa = await signIn(s.app, 'rosa@sur.pe', 'temporal-rosa-definitiva');
    const mines = mineListSchema.parse(
      (await call(admin, 'GET', `/organizations/${orgId}/mines`)).body,
    );
    const toquepala = mines.mines.find((m) => m.name === 'Toquepala');
    const members = memberListSchema.parse(
      (await call(admin, 'GET', `/organizations/${orgId}/members`)).body,
    );
    const luisId = members.members.find((m) => m.email === 'luis@sur.pe')?.userId;
    if (!toquepala || !luisId) throw new Error('fixture');

    const set = await call(admin, 'PUT', `/mines/${toquepala.id}/access`, { userIds: [luisId] });
    expect(mineSchema.parse(set.body)).toMatchObject({ restricted: true, accessUserIds: [luisId] });

    const forRosa = mineListSchema.parse(
      (await call(rosa, 'GET', `/organizations/${orgId}/mines`)).body,
    );
    expect(forRosa.mines.map((m) => m.name)).toEqual(['Cuajone']);
    expect((await call(rosa, 'GET', `/mines/${toquepala.id}`)).status).toBe(404);
    expect((await call(luis, 'GET', `/mines/${toquepala.id}`)).status).toBe(200);
    expect((await call(admin, 'GET', `/mines/${toquepala.id}`)).status).toBe(200);

    const bad = await call(admin, 'PUT', `/mines/${toquepala.id}/access`, {
      userIds: ['no-existe'],
    });
    expect(bad).toMatchObject({ status: 400, body: { code: 'not_a_member' } });
    await call(admin, 'PUT', `/mines/${toquepala.id}/access`, { userIds: [] });
    expect((await call(rosa, 'GET', `/mines/${toquepala.id}`)).status).toBe(200);
  });

  it('quien no es de la empresa no ve que existe (404)', async () => {
    const outsider = await signedIn(s, { email: 'otro@norte.pe' });
    const mines = mineListSchema.parse(
      (await call(admin, 'GET', `/organizations/${orgId}/mines`)).body,
    );
    const any = mines.mines[0];
    if (!any) throw new Error('fixture');
    expect((await call(outsider, 'GET', `/organizations/${orgId}/mines`)).status).toBe(404);
    expect((await call(outsider, 'GET', `/organizations/${orgId}/members`)).status).toBe(404);
    expect((await call(outsider, 'GET', `/mines/${any.id}`)).status).toBe(404);
    expect(
      organizationListSchema.parse((await call(outsider, 'GET', '/organizations')).body),
    ).toEqual({
      organizations: [],
    });
  });

  it('una cuenta existente de otra empresa se agrega sin contraseña nueva', async () => {
    const res = await call(admin, 'POST', `/organizations/${orgId}/members`, {
      email: 'otro@norte.pe',
      name: 'Ignorado',
      role: 'reviewer',
    });
    expect(res.status).toBe(201);
    expect(memberSchema.parse(res.body)).toMatchObject({
      email: 'otro@norte.pe',
      role: 'reviewer',
    });
  });

  it('la empresa no se queda sin administrador', async () => {
    const members = memberListSchema.parse(
      (await call(admin, 'GET', `/organizations/${orgId}/members`)).body,
    );
    const adminId = members.members.find((m) => m.email === 'admin@sur.pe')?.userId ?? '';
    const luisId = members.members.find((m) => m.email === 'luis@sur.pe')?.userId ?? '';
    const demote = await call(admin, 'PATCH', `/organizations/${orgId}/members/${adminId}`, {
      role: 'designer',
    });
    expect(demote).toMatchObject({ status: 409, body: { code: 'last_admin' } });
    expect((await call(admin, 'DELETE', `/organizations/${orgId}/members/${adminId}`)).status).toBe(
      409,
    );

    const promote = await call(admin, 'PATCH', `/organizations/${orgId}/members/${luisId}`, {
      role: 'admin',
    });
    expect(memberSchema.parse(promote.body).role).toBe('admin');
    const back = await call(admin, 'PATCH', `/organizations/${orgId}/members/${luisId}`, {
      role: 'designer',
    });
    expect(back.status).toBe(200);
  });

  it('quitar a un miembro le cierra la empresa', async () => {
    const members = memberListSchema.parse(
      (await call(admin, 'GET', `/organizations/${orgId}/members`)).body,
    );
    const otroId = members.members.find((m) => m.email === 'otro@norte.pe')?.userId ?? '';
    expect((await call(admin, 'DELETE', `/organizations/${orgId}/members/${otroId}`)).status).toBe(
      200,
    );
    const otro = await signIn(s.app, 'otro@norte.pe', 'contraseña-segura');
    expect((await call(otro, 'GET', `/organizations/${orgId}/mines`)).status).toBe(404);
  });

  it('una empresa nueva solo la crea quien ya administra otra', async () => {
    const rosa = await signIn(s.app, 'rosa@sur.pe', 'temporal-rosa-definitiva');
    expect((await call(rosa, 'POST', '/organizations', { name: 'Rosa SAC' })).status).toBe(403);
    const res = await call(admin, 'POST', '/organizations', { name: 'Contratista Andina' });
    expect(res.status).toBe(201);
    expect(organizationSchema.parse(res.body)).toMatchObject({
      name: 'Contratista Andina',
      role: 'admin',
    });
    const orgs = organizationListSchema.parse((await call(admin, 'GET', '/organizations')).body);
    expect(orgs.organizations.map((o) => o.name)).toEqual(['Contratista Andina', 'Minera Sur']);
  });

  it('la auditoría registra quién hizo qué y no se puede alterar (NF-07)', async () => {
    const audit = auditListSchema.parse(
      (await call(admin, 'GET', `/organizations/${orgId}/audit`)).body,
    );
    const actions = audit.events.map((e) => e.action).reverse();
    expect(actions.slice(0, 5)).toEqual([
      'organization.create',
      'member.add',
      'member.add',
      'mine.create',
      'mine.create',
    ]);
    expect(actions).toContain('mine.access_change');
    expect(actions).toContain('member.role_change');
    expect(actions.at(-1)).toBe('member.remove');
    expect(audit.events[0]?.actorName).toBe('Ana Admin');
    await expect(sql`update "audit_event" set "action" = 'x'`.execute(t.db)).rejects.toThrow(
      /append-only/,
    );
    await expect(sql`delete from "audit_event"`.execute(t.db)).rejects.toThrow(/append-only/);
  });
});
