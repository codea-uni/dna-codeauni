import {
  meSchema,
  mineSchema,
  platformOrganizationListSchema,
  platformOrganizationSchema,
  platformUserListSchema,
  platformUserSchema,
} from '@cronos/api';
import { createEmptyProject, toProjectFile } from '@cronos/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureSuperAdmin } from '../auth/seed';
import { activate, createTestApp, signIn, TEST_ORIGIN, type TestApp } from '../test/testApp';
import { createTestDb, databaseAvailable, type TestDb } from '../test/testDb';

type Method = 'GET' | 'POST' | 'PATCH';

describe.runIf(await databaseAvailable())(
  'consola de la plataforma (superadministrador, D-14)',
  () => {
    let t: TestDb;
    let s: TestApp;
    let root: string;
    let surId: string;
    let surAdmin: string;
    const call = async (cookie: string, method: Method, url: string, payload?: unknown) => {
      const res = await s.app.inject({
        method,
        url: `/api${url}`,
        headers: { ...TEST_ORIGIN, cookie },
        ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
      });
      return { status: res.statusCode, json: () => res.json<unknown>() };
    };
    const me = async (cookie: string) => meSchema.parse((await call(cookie, 'GET', '/me')).json());

    beforeAll(async () => {
      t = await createTestDb();
      s = createTestApp(t);
      await ensureSuperAdmin(t.db, s.auth, {
        email: 'root@cronos.pe',
        password: 'root-inicial',
        name: 'Plataforma',
      });
      root = await activate(s.app, 'root@cronos.pe', 'root-inicial');
    });
    afterAll(async () => {
      await t.drop();
    });

    it('crea una empresa con su primer administrador (contraseña temporal)', async () => {
      const res = await call(root, 'POST', '/platform/organizations', {
        name: 'Minera Sur',
        admin: { email: 'ana@sur.pe', name: 'Ana', password: 'temporal-ana' },
      });
      expect(res.status).toBe(201);
      const org = platformOrganizationSchema.parse(res.json());
      expect(org).toMatchObject({
        name: 'Minera Sur',
        disabled: false,
        members: 1,
        mines: 0,
        projects: 0,
        versions: 0,
        lastActivityAt: null,
        admins: [{ name: 'Ana', email: 'ana@sur.pe' }],
      });
      surId = org.id;
      surAdmin = await activate(s.app, 'ana@sur.pe', 'temporal-ana');
      expect((await me(surAdmin)).organization).toEqual({
        id: surId,
        name: 'Minera Sur',
        role: 'admin',
        disabled: false,
      });
    });

    it('solo el superadministrador entra a la consola', async () => {
      expect((await call(surAdmin, 'GET', '/platform/organizations')).status).toBe(403);
      expect(
        (
          await call(surAdmin, 'POST', '/platform/organizations', {
            name: 'X',
            admin: { email: 'x@x.pe', name: 'X' },
          })
        ).status,
      ).toBe(403);
      expect((await call(root, 'GET', '/platform/organizations')).status).toBe(200);
    });

    it('una persona pertenece a una sola empresa', async () => {
      const res = await call(root, 'POST', '/platform/organizations', {
        name: 'Contratista Andina',
        admin: { email: 'ana@sur.pe', name: 'Ana' },
      });
      expect(res.status).toBe(409);
      expect(res.json()).toMatchObject({ code: 'other_organization' });

      const norte = platformOrganizationSchema.parse(
        (
          await call(root, 'POST', '/platform/organizations', {
            name: 'Minera Norte',
            admin: { email: 'beto@norte.pe', name: 'Beto', password: 'temporal-beto' },
          })
        ).json(),
      );
      // El administrador de Sur no puede sumar a alguien de Norte.
      const add = await call(surAdmin, 'POST', `/organizations/${surId}/members`, {
        email: 'beto@norte.pe',
        name: 'Beto',
        role: 'designer',
      });
      expect(add.status).toBe(409);
      expect(add.json()).toMatchObject({ code: 'other_organization' });
      expect(norte.members).toBe(1);
    });

    it('suma un administrador a una empresa existente', async () => {
      const list = platformOrganizationListSchema.parse(
        (await call(root, 'GET', '/platform/organizations')).json(),
      );
      const norte = list.organizations.find((o) => o.name === 'Minera Norte');
      if (!norte) throw new Error('fixture');
      const res = await call(root, 'POST', `/platform/organizations/${norte.id}/admins`, {
        email: 'carla@norte.pe',
        name: 'Carla',
        password: 'temporal-carla',
      });
      expect(res.status).toBe(201);
      expect(platformOrganizationSchema.parse(res.json()).admins.map((a) => a.email)).toEqual([
        'beto@norte.pe',
        'carla@norte.pe',
      ]);
      const again = await call(root, 'POST', `/platform/organizations/${norte.id}/admins`, {
        email: 'ana@sur.pe',
        name: 'Ana',
      });
      expect(again.json()).toMatchObject({ code: 'other_organization' });
    });

    it('lista todas las empresas con sus números', async () => {
      const mine = mineSchema.parse(
        (await call(surAdmin, 'POST', `/organizations/${surId}/mines`, { name: 'Cuajone' })).json(),
      );
      await call(surAdmin, 'POST', `/mines/${mine.id}/projects`, {
        file: toProjectFile(createEmptyProject('Banco 3400'), { appVersion: 'test' }),
        message: 'Inicial',
      });
      const list = platformOrganizationListSchema.parse(
        (await call(root, 'GET', '/platform/organizations')).json(),
      );
      expect(list.organizations.map((o) => o.name)).toEqual(['Minera Norte', 'Minera Sur']);
      expect(list.organizations.find((o) => o.id === surId)).toMatchObject({
        members: 1,
        mines: 1,
        projects: 1,
        versions: 1,
      });
      expect(list.organizations.find((o) => o.id === surId)?.lastActivityAt).not.toBeNull();
      const mines = (await call(root, 'GET', `/platform/organizations/${surId}/mines`)).json() as {
        mines: { name: string; projectCount: number; organizationId: string }[];
      };
      expect(mines.mines).toEqual([
        expect.objectContaining({ name: 'Cuajone', projectCount: 1, organizationId: surId }),
      ]);
      expect((await call(surAdmin, 'GET', `/platform/organizations/${surId}/mines`)).status).toBe(
        403,
      );
    });

    it('desactivar una empresa corta el acceso de sus miembros sin borrar nada', async () => {
      const off = await call(root, 'PATCH', `/platform/organizations/${surId}`, { disabled: true });
      expect(platformOrganizationSchema.parse(off.json())).toMatchObject({
        disabled: true,
        mines: 1,
      });
      expect((await me(surAdmin)).organization?.disabled).toBe(true);
      const blocked = await call(surAdmin, 'GET', `/organizations/${surId}/mines`);
      expect(blocked.status).toBe(403);
      expect(blocked.json()).toMatchObject({ code: 'organization_disabled' });

      await call(root, 'PATCH', `/platform/organizations/${surId}`, { disabled: false });
      expect((await call(surAdmin, 'GET', `/organizations/${surId}/mines`)).status).toBe(200);
    });

    it('desactivar una cuenta cierra sus sesiones y le impide entrar', async () => {
      const users = platformUserListSchema.parse(
        (await call(root, 'GET', `/platform/organizations/${surId}/users`)).json(),
      );
      const ana = users.users.find((u) => u.email === 'ana@sur.pe');
      if (!ana) throw new Error('fixture');
      expect(ana.lastSeenAt).not.toBeNull();

      const off = await call(root, 'PATCH', `/platform/users/${ana.userId}`, { disabled: true });
      expect(platformUserSchema.parse(off.json())).toMatchObject({ disabled: true });
      expect((await call(surAdmin, 'GET', '/me')).status).toBe(401);
      const login = await s.app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        headers: TEST_ORIGIN,
        payload: { email: 'ana@sur.pe', password: 'temporal-ana-definitiva' },
      });
      expect(login.statusCode).toBe(403);
      expect(login.json()).toMatchObject({ code: 'account_disabled' });

      await call(root, 'PATCH', `/platform/users/${ana.userId}`, { disabled: false });
      surAdmin = await signIn(s.app, 'ana@sur.pe', 'temporal-ana-definitiva');
      expect((await me(surAdmin)).user.email).toBe('ana@sur.pe');
    });

    it('el superadministrador no se desactiva a sí mismo', async () => {
      const rootId = (await me(root)).user.id;
      const res = await call(root, 'PATCH', `/platform/users/${rootId}`, { disabled: true });
      expect(res.status).toBe(409);
      expect(res.json()).toMatchObject({ code: 'cannot_disable_self' });
    });

    it('la auditoría de la empresa registra lo que hizo la plataforma', async () => {
      const audit = (await call(surAdmin, 'GET', `/organizations/${surId}/audit`)).json() as {
        events: { action: string; actorName: string | null }[];
      };
      const actions = audit.events.map((e) => e.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'organization.create',
          'organization.disable',
          'organization.enable',
          'user.disable',
          'user.enable',
        ]),
      );
      expect(audit.events.find((e) => e.action === 'organization.disable')?.actorName).toBe(
        'Plataforma',
      );
    });
  },
);
