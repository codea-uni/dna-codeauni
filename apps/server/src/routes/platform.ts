import {
  addPlatformAdminSchema,
  createPlatformOrganizationSchema,
  updatePlatformOrganizationSchema,
  updatePlatformUserSchema,
  type PlatformOrganization,
  type PlatformUser,
} from '@cronos/api';
import { uuidv7 } from '@cronos/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'kysely';
import { createUserWithPassword, type Auth } from '../auth/auth';
import type { Db } from '../db/db';
import { sendError } from '../http/errors';
import { requireUser, type SessionUser } from '../http/session';
import { recordAudit } from '../services/audit';
import { toMine } from './organizations';

export interface PlatformRouteDeps {
  auth: Auth;
  db: Db;
}

type Req = FastifyRequest<{ Params: Record<string, string> }>;

async function requireSuperAdmin(
  deps: PlatformRouteDeps,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<SessionUser | null> {
  const user = await requireUser(deps.auth, deps.db, req, reply);
  if (!user) return null;
  if (!user.isSuperAdmin) {
    await sendError(reply, 403, 'forbidden', 'Platform administrators only');
    return null;
  }
  return user;
}

/** Empresas con sus números, una consulta por tabla (no una por empresa). */
async function listOrganizations(db: Db, onlyId?: string): Promise<PlatformOrganization[]> {
  let orgs = db.selectFrom('organization').selectAll().orderBy('name');
  if (onlyId) orgs = orgs.where('id', '=', onlyId);
  const rows = await orgs.execute();
  if (rows.length === 0) return [];
  const ids = rows.map((o) => o.id);
  const count = (list: readonly { organizationId: string; n: string | number | bigint }[]) =>
    new Map(list.map((r) => [r.organizationId, Number(r.n)]));
  const [members, mines, projects, versions, admins] = await Promise.all([
    db
      .selectFrom('member')
      .select(['organizationId', (eb) => eb.fn.countAll<string>().as('n')])
      .where('organizationId', 'in', ids)
      .groupBy('organizationId')
      .execute(),
    db
      .selectFrom('mine')
      .select(['organizationId', (eb) => eb.fn.countAll<string>().as('n')])
      .where('organizationId', 'in', ids)
      .groupBy('organizationId')
      .execute(),
    db
      .selectFrom('project')
      .innerJoin('mine', 'mine.id', 'project.mineId')
      .select(['mine.organizationId', (eb) => eb.fn.countAll<string>().as('n')])
      .where('mine.organizationId', 'in', ids)
      .groupBy('mine.organizationId')
      .execute(),
    db
      .selectFrom('project_version')
      .innerJoin('project', 'project.id', 'project_version.projectId')
      .innerJoin('mine', 'mine.id', 'project.mineId')
      .select([
        'mine.organizationId',
        (eb) => eb.fn.countAll<string>().as('n'),
        (eb) => eb.fn.max('project_version.createdAt').as('last'),
      ])
      .where('mine.organizationId', 'in', ids)
      .groupBy('mine.organizationId')
      .execute(),
    db
      .selectFrom('member')
      .innerJoin('user', 'user.id', 'member.userId')
      .select(['member.organizationId', 'user.name', 'user.email'])
      .where('member.organizationId', 'in', ids)
      .where('member.role', '=', 'admin')
      .orderBy('user.name')
      .execute(),
  ]);
  const nMembers = count(members);
  const nMines = count(mines);
  const nProjects = count(projects);
  const nVersions = count(versions);
  const last = new Map(versions.map((v) => [v.organizationId, v.last]));
  return rows.map((o) => {
    const lastAt = last.get(o.id);
    return {
      id: o.id,
      name: o.name,
      createdAt: o.createdAt.toISOString(),
      disabled: o.disabledAt !== null,
      members: nMembers.get(o.id) ?? 0,
      mines: nMines.get(o.id) ?? 0,
      projects: nProjects.get(o.id) ?? 0,
      versions: nVersions.get(o.id) ?? 0,
      lastActivityAt: lastAt ? new Date(lastAt).toISOString() : null,
      admins: admins
        .filter((a) => a.organizationId === o.id)
        .map(({ name, email }) => ({ name, email })),
    };
  });
}

async function listUsers(db: Db, orgId: string, onlyUserId?: string): Promise<PlatformUser[]> {
  let q = db
    .selectFrom('member')
    .innerJoin('user', 'user.id', 'member.userId')
    .select([
      'member.userId',
      'user.name',
      'user.email',
      'member.role',
      'member.createdAt',
      'user.disabledAt',
      (eb) =>
        eb
          .selectFrom('session')
          .select(sql<Date | null>`max("session"."updatedAt")`.as('m'))
          .whereRef('session.userId', '=', 'member.userId')
          .as('lastSeenAt'),
    ])
    .where('member.organizationId', '=', orgId)
    .orderBy('user.name');
  if (onlyUserId) q = q.where('member.userId', '=', onlyUserId);
  const rows = await q.execute();
  return rows.map((r) => ({
    userId: r.userId,
    name: r.name,
    email: r.email,
    role: r.role,
    createdAt: r.createdAt.toISOString(),
    disabled: r.disabledAt !== null,
    lastSeenAt: r.lastSeenAt ? new Date(r.lastSeenAt).toISOString() : null,
  }));
}

/**
 * Cuenta para un administrador: una existente sin empresa, o una nueva con contraseña temporal.
 * Responde 409 si ya es de otra empresa (una por persona) y devuelve `null`.
 */
async function resolveAdmin(
  deps: PlatformRouteDeps,
  reply: FastifyReply,
  input: { email: string; name: string; password?: string | undefined },
): Promise<{ id: string; email: string } | null> {
  const email = input.email.trim().toLowerCase();
  const existing = await deps.db
    .selectFrom('user')
    .select('id')
    .where('email', '=', email)
    .executeTakeFirst();
  if (existing) {
    const current = await deps.db
      .selectFrom('member')
      .select('id')
      .where('userId', '=', existing.id)
      .executeTakeFirst();
    if (current) {
      await sendError(reply, 409, 'other_organization', 'User belongs to another organization');
      return null;
    }
    return { id: existing.id, email };
  }
  if (!input.password) {
    await sendError(reply, 400, 'password_required', 'New accounts need a temporary password');
    return null;
  }
  const created = await createUserWithPassword(deps.auth, {
    email,
    name: input.name,
    password: input.password,
  });
  return { id: created.id, email };
}

/**
 * Consola de la plataforma (D-14): solo el superadministrador. Ve todas las empresas con sus
 * números, crea empresas con su primer administrador y desactiva empresas o cuentas. No abre los
 * proyectos de las empresas: eso queda para sus miembros.
 */
export function platformRoutes(app: FastifyInstance, deps: PlatformRouteDeps): void {
  const { db } = deps;

  app.get('/platform/organizations', async (req, reply) => {
    if (!(await requireSuperAdmin(deps, req, reply))) return reply;
    return reply.send({ organizations: await listOrganizations(db) });
  });

  app.post('/platform/organizations', async (req, reply) => {
    const actor = await requireSuperAdmin(deps, req, reply);
    if (!actor) return reply;
    const body = createPlatformOrganizationSchema.safeParse(req.body);
    if (!body.success) return sendError(reply, 400, 'invalid_body', body.error.message);
    const admin = await resolveAdmin(deps, reply, body.data.admin);
    if (!admin) return reply;
    const { id: adminId, email } = admin;
    const orgId = uuidv7();
    await db.transaction().execute(async (tx) => {
      await tx.insertInto('organization').values({ id: orgId, name: body.data.name }).execute();
      await tx
        .insertInto('member')
        .values({ id: uuidv7(), organizationId: orgId, userId: adminId, role: 'admin' })
        .execute();
      await recordAudit(tx, {
        organizationId: orgId,
        actorId: actor.id,
        action: 'organization.create',
        targetType: 'organization',
        targetId: orgId,
        data: { name: body.data.name, admin: email },
      });
    });
    const [created] = await listOrganizations(db, orgId);
    return reply.code(201).send(created);
  });

  app.patch('/platform/organizations/:orgId', async (req: Req, reply) => {
    const actor = await requireSuperAdmin(deps, req, reply);
    if (!actor) return reply;
    const body = updatePlatformOrganizationSchema.safeParse(req.body);
    if (!body.success) return sendError(reply, 400, 'invalid_body', body.error.message);
    const org = await db
      .selectFrom('organization')
      .selectAll()
      .where('id', '=', req.params.orgId ?? '')
      .executeTakeFirst();
    if (!org) return sendError(reply, 404, 'not_found', 'Organization not found');
    const { name, disabled } = body.data;
    await db.transaction().execute(async (tx) => {
      if (name !== undefined && name !== org.name) {
        await tx.updateTable('organization').set({ name }).where('id', '=', org.id).execute();
        await recordAudit(tx, {
          organizationId: org.id,
          actorId: actor.id,
          action: 'organization.rename',
          targetType: 'organization',
          targetId: org.id,
          data: { from: org.name, to: name },
        });
      }
      if (disabled !== undefined && disabled !== (org.disabledAt !== null)) {
        await tx
          .updateTable('organization')
          .set({ disabledAt: disabled ? new Date() : null })
          .where('id', '=', org.id)
          .execute();
        await recordAudit(tx, {
          organizationId: org.id,
          actorId: actor.id,
          action: disabled ? 'organization.disable' : 'organization.enable',
          targetType: 'organization',
          targetId: org.id,
          data: { name: name ?? org.name },
        });
      }
    });
    const [updated] = await listOrganizations(db, org.id);
    return reply.send(updated);
  });

  // Sumar un administrador a una empresa existente (p. ej. una que quedó sin administrador).
  app.post('/platform/organizations/:orgId/admins', async (req: Req, reply) => {
    const actor = await requireSuperAdmin(deps, req, reply);
    if (!actor) return reply;
    const body = addPlatformAdminSchema.safeParse(req.body);
    if (!body.success) return sendError(reply, 400, 'invalid_body', body.error.message);
    const org = await db
      .selectFrom('organization')
      .select(['id', 'name'])
      .where('id', '=', req.params.orgId ?? '')
      .executeTakeFirst();
    if (!org) return sendError(reply, 404, 'not_found', 'Organization not found');
    const admin = await resolveAdmin(deps, reply, body.data);
    if (!admin) return reply;
    await db.transaction().execute(async (tx) => {
      await tx
        .insertInto('member')
        .values({ id: uuidv7(), organizationId: org.id, userId: admin.id, role: 'admin' })
        .execute();
      await recordAudit(tx, {
        organizationId: org.id,
        actorId: actor.id,
        action: 'member.add',
        targetType: 'user',
        targetId: admin.id,
        data: { email: admin.email, role: 'admin', byPlatform: true },
      });
    });
    const [updated] = await listOrganizations(db, org.id);
    return reply.code(201).send(updated);
  });

  // Minas de una empresa con sus proyectos: la plataforma ve la estructura, no el contenido.
  app.get('/platform/organizations/:orgId/mines', async (req: Req, reply) => {
    if (!(await requireSuperAdmin(deps, req, reply))) return reply;
    const rows = await db
      .selectFrom('mine')
      .selectAll()
      .where('organizationId', '=', req.params.orgId ?? '')
      .orderBy('name')
      .execute();
    return reply.send({ mines: await Promise.all(rows.map((r) => toMine(db, r))) });
  });

  app.get('/platform/organizations/:orgId/users', async (req: Req, reply) => {
    if (!(await requireSuperAdmin(deps, req, reply))) return reply;
    return reply.send({ users: await listUsers(db, req.params.orgId ?? '') });
  });

  // Desactivar una cuenta: no puede iniciar sesión y se cierran sus sesiones abiertas.
  app.patch('/platform/users/:userId', async (req: Req, reply) => {
    const actor = await requireSuperAdmin(deps, req, reply);
    if (!actor) return reply;
    const body = updatePlatformUserSchema.safeParse(req.body);
    if (!body.success) return sendError(reply, 400, 'invalid_body', body.error.message);
    const userId = req.params.userId ?? '';
    if (userId === actor.id)
      return sendError(reply, 409, 'cannot_disable_self', 'You cannot disable yourself');
    const member = await db
      .selectFrom('member')
      .select('organizationId')
      .where('userId', '=', userId)
      .executeTakeFirst();
    if (!member) return sendError(reply, 404, 'not_found', 'User not found');
    await db.transaction().execute(async (tx) => {
      await tx
        .updateTable('user')
        .set({ disabledAt: body.data.disabled ? new Date() : null })
        .where('id', '=', userId)
        .execute();
      if (body.data.disabled) await tx.deleteFrom('session').where('userId', '=', userId).execute();
      await recordAudit(tx, {
        organizationId: member.organizationId,
        actorId: actor.id,
        action: body.data.disabled ? 'user.disable' : 'user.enable',
        targetType: 'user',
        targetId: userId,
      });
    });
    const [user] = await listUsers(db, member.organizationId, userId);
    return reply.send(user);
  });
}
