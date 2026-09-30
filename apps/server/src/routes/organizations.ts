import {
  addMemberSchema,
  createMineSchema,
  mineAccessSchema,
  permissions,
  updateMemberSchema,
  updateMineSchema,
  type AuditEvent,
  type Member,
  type Mine,
  type Organization,
  type Role,
} from '@cronos/api';
import { uuidv7 } from '@cronos/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Kysely } from 'kysely';
import type { z } from 'zod';
import { createUserWithPassword, type Auth } from '../auth/auth';
import type { Db } from '../db/db';
import type { Database } from '../db/schema';
import { sendError } from '../http/errors';
import { requireUser, type SessionUser } from '../http/session';
import { memberRole, visibleMine, type MineRow } from '../services/access';
import { recordAudit } from '../services/audit';

export interface OrganizationRouteDeps {
  auth: Auth;
  db: Db;
}

type Params = Record<string, string>;
type Handler = (ctx: {
  req: FastifyRequest<{ Params: Params; Querystring: Params }>;
  reply: FastifyReply;
  user: SessionUser;
}) => Promise<FastifyReply>;

/** Envuelve un handler: exige sesión y le pasa el usuario. */
function withUser(deps: OrganizationRouteDeps, handler: Handler) {
  return async (
    req: FastifyRequest<{ Params: Params; Querystring: Params }>,
    reply: FastifyReply,
  ) => {
    const user = await requireUser(deps.auth, deps.db, req, reply);
    if (!user) return reply;
    return handler({ req, reply, user });
  };
}

function parse<S extends z.ZodType>(
  schema: S,
  body: unknown,
  reply: FastifyReply,
): z.infer<S> | null {
  const r = schema.safeParse(body);
  if (r.success) return r.data;
  void sendError(reply, 400, 'invalid_body', r.error.message);
  return null;
}

export async function toMine(db: Kysely<Database>, row: MineRow): Promise<Mine> {
  const access = await db
    .selectFrom('mine_access')
    .select('userId')
    .where('mineId', '=', row.id)
    .orderBy('userId')
    .execute();
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    epsg: row.epsg,
    restricted: access.length > 0,
    accessUserIds: access.map((a) => a.userId),
    createdAt: row.createdAt.toISOString(),
  };
}

async function toMember(db: Kysely<Database>, orgId: string, userId: string): Promise<Member> {
  const row = await db
    .selectFrom('member')
    .innerJoin('user', 'user.id', 'member.userId')
    .select(['member.userId', 'user.name', 'user.email', 'member.role', 'member.createdAt'])
    .where('member.organizationId', '=', orgId)
    .where('member.userId', '=', userId)
    .executeTakeFirstOrThrow();
  return { ...row, createdAt: row.createdAt.toISOString() };
}

async function adminCount(db: Kysely<Database>, orgId: string): Promise<number> {
  const r = await db
    .selectFrom('member')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('organizationId', '=', orgId)
    .where('role', '=', 'admin')
    .executeTakeFirstOrThrow();
  return Number(r.n);
}

/**
 * Empresas, miembros, minas y auditoría. Quien no es miembro recibe 404 (no se revela que la
 * empresa o la mina existen); un miembro sin permiso recibe 403.
 */
export function organizationRoutes(app: FastifyInstance, deps: OrganizationRouteDeps): void {
  const { db } = deps;

  /** Rol del usuario en `:orgId`, o responde 404/403 y devuelve `null`. */
  const roleIn = async (
    orgId: string,
    user: SessionUser,
    reply: FastifyReply,
    need?: (r: Role) => boolean,
  ): Promise<Role | null> => {
    const role = await memberRole(db, orgId, user.id);
    if (!role) {
      await sendError(reply, 404, 'not_found', 'Organization not found');
      return null;
    }
    if (need && !need(role)) {
      await sendError(reply, 403, 'forbidden', 'Not allowed for this role');
      return null;
    }
    return role;
  };

  app.get(
    '/organizations',
    withUser(deps, async ({ reply, user }) => {
      const rows = await db
        .selectFrom('member')
        .innerJoin('organization', 'organization.id', 'member.organizationId')
        .select(['organization.id', 'organization.name', 'member.role', 'organization.createdAt'])
        .where('member.userId', '=', user.id)
        .orderBy('organization.name')
        .execute();
      const organizations: Organization[] = rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      }));
      return reply.send({ organizations });
    }),
  );

  app.get(
    '/organizations/:orgId/members',
    withUser(deps, async ({ req, reply, user }) => {
      const orgId = req.params.orgId ?? '';
      if (!(await roleIn(orgId, user, reply))) return reply;
      const rows = await db
        .selectFrom('member')
        .innerJoin('user', 'user.id', 'member.userId')
        .select(['member.userId', 'user.name', 'user.email', 'member.role', 'member.createdAt'])
        .where('member.organizationId', '=', orgId)
        .orderBy('user.name')
        .execute();
      const members: Member[] = rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
      return reply.send({ members });
    }),
  );

  app.post(
    '/organizations/:orgId/members',
    withUser(deps, async ({ req, reply, user }) => {
      const orgId = req.params.orgId ?? '';
      if (!(await roleIn(orgId, user, reply, permissions.manageMembers))) return reply;
      const body = parse(addMemberSchema, req.body, reply);
      if (!body) return reply;
      const email = body.email.trim().toLowerCase();
      let target = await db
        .selectFrom('user')
        .select('id')
        .where('email', '=', email)
        .executeTakeFirst();
      let created = false;
      if (!target) {
        if (!body.password)
          return sendError(
            reply,
            400,
            'password_required',
            'New accounts need a temporary password',
          );
        target = await createUserWithPassword(deps.auth, {
          email,
          name: body.name,
          password: body.password,
        });
        created = true;
      } else {
        // Cada persona pertenece a una sola empresa.
        const current = await db
          .selectFrom('member')
          .select('organizationId')
          .where('userId', '=', target.id)
          .executeTakeFirst();
        if (current?.organizationId === orgId)
          return sendError(reply, 409, 'already_member', 'User is already a member');
        if (current)
          return sendError(
            reply,
            409,
            'other_organization',
            'User belongs to another organization',
          );
      }
      const userId = target.id;
      await db.transaction().execute(async (tx) => {
        await tx
          .insertInto('member')
          .values({ id: uuidv7(), organizationId: orgId, userId, role: body.role })
          .execute();
        await recordAudit(tx, {
          organizationId: orgId,
          actorId: user.id,
          action: 'member.add',
          targetType: 'user',
          targetId: userId,
          data: { email, role: body.role, accountCreated: created },
        });
      });
      return reply.code(201).send(await toMember(db, orgId, userId));
    }),
  );

  app.patch(
    '/organizations/:orgId/members/:userId',
    withUser(deps, async ({ req, reply, user }) => {
      const orgId = req.params.orgId ?? '';
      const userId = req.params.userId ?? '';
      if (!(await roleIn(orgId, user, reply, permissions.manageMembers))) return reply;
      const body = parse(updateMemberSchema, req.body, reply);
      if (!body) return reply;
      const current = await memberRole(db, orgId, userId);
      if (!current) return sendError(reply, 404, 'not_found', 'Member not found');
      if (current === 'admin' && body.role !== 'admin' && (await adminCount(db, orgId)) <= 1)
        return sendError(reply, 409, 'last_admin', 'The organization needs an administrator');
      await db.transaction().execute(async (tx) => {
        await tx
          .updateTable('member')
          .set({ role: body.role })
          .where('organizationId', '=', orgId)
          .where('userId', '=', userId)
          .execute();
        await recordAudit(tx, {
          organizationId: orgId,
          actorId: user.id,
          action: 'member.role_change',
          targetType: 'user',
          targetId: userId,
          data: { from: current, to: body.role },
        });
      });
      return reply.send(await toMember(db, orgId, userId));
    }),
  );

  app.delete(
    '/organizations/:orgId/members/:userId',
    withUser(deps, async ({ req, reply, user }) => {
      const orgId = req.params.orgId ?? '';
      const userId = req.params.userId ?? '';
      if (!(await roleIn(orgId, user, reply, permissions.manageMembers))) return reply;
      const current = await memberRole(db, orgId, userId);
      if (!current) return sendError(reply, 404, 'not_found', 'Member not found');
      if (current === 'admin' && (await adminCount(db, orgId)) <= 1)
        return sendError(reply, 409, 'last_admin', 'The organization needs an administrator');
      await db.transaction().execute(async (tx) => {
        await tx
          .deleteFrom('mine_access')
          .where('userId', '=', userId)
          .where(
            'mineId',
            'in',
            tx.selectFrom('mine').select('id').where('organizationId', '=', orgId),
          )
          .execute();
        await tx
          .deleteFrom('member')
          .where('organizationId', '=', orgId)
          .where('userId', '=', userId)
          .execute();
        await recordAudit(tx, {
          organizationId: orgId,
          actorId: user.id,
          action: 'member.remove',
          targetType: 'user',
          targetId: userId,
          data: { role: current },
        });
      });
      return reply.send({ ok: true });
    }),
  );

  app.get(
    '/organizations/:orgId/mines',
    withUser(deps, async ({ req, reply, user }) => {
      const orgId = req.params.orgId ?? '';
      const role = await roleIn(orgId, user, reply);
      if (!role) return reply;
      const rows = await db
        .selectFrom('mine')
        .selectAll()
        .where('organizationId', '=', orgId)
        .orderBy('name')
        .execute();
      const mines = await Promise.all(rows.map((r) => toMine(db, r)));
      const visible =
        role === 'admin'
          ? mines
          : mines.filter((m) => !m.restricted || m.accessUserIds.includes(user.id));
      return reply.send({ mines: visible });
    }),
  );

  app.post(
    '/organizations/:orgId/mines',
    withUser(deps, async ({ req, reply, user }) => {
      const orgId = req.params.orgId ?? '';
      if (!(await roleIn(orgId, user, reply, permissions.manageMines))) return reply;
      const body = parse(createMineSchema, req.body, reply);
      if (!body) return reply;
      const row = await db.transaction().execute(async (tx) => {
        const id = uuidv7();
        const mine = await tx
          .insertInto('mine')
          .values({
            id,
            organizationId: orgId,
            name: body.name,
            epsg: body.epsg ?? null,
            createdBy: user.id,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        await recordAudit(tx, {
          organizationId: orgId,
          actorId: user.id,
          action: 'mine.create',
          targetType: 'mine',
          targetId: id,
          data: { name: body.name, epsg: body.epsg ?? null },
        });
        return mine;
      });
      return reply.code(201).send(await toMine(db, row));
    }),
  );

  app.get(
    '/mines/:mineId',
    withUser(deps, async ({ req, reply, user }) => {
      const found = await visibleMine(db, req.params.mineId ?? '', user.id);
      if (!found) return sendError(reply, 404, 'not_found', 'Mine not found');
      return reply.send({ mine: await toMine(db, found.mine), role: found.role });
    }),
  );

  app.patch(
    '/mines/:mineId',
    withUser(deps, async ({ req, reply, user }) => {
      const found = await visibleMine(db, req.params.mineId ?? '', user.id);
      if (!found) return sendError(reply, 404, 'not_found', 'Mine not found');
      if (!permissions.manageMines(found.role))
        return sendError(reply, 403, 'forbidden', 'Not allowed for this role');
      const body = parse(updateMineSchema, req.body, reply);
      if (!body) return reply;
      const patch = {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.epsg !== undefined ? { epsg: body.epsg } : {}),
      };
      const row = await db.transaction().execute(async (tx) => {
        const mine = Object.keys(patch).length
          ? await tx
              .updateTable('mine')
              .set(patch)
              .where('id', '=', found.mine.id)
              .returningAll()
              .executeTakeFirstOrThrow()
          : found.mine;
        await recordAudit(tx, {
          organizationId: mine.organizationId,
          actorId: user.id,
          action: 'mine.update',
          targetType: 'mine',
          targetId: mine.id,
          data: patch,
        });
        return mine;
      });
      return reply.send(await toMine(db, row));
    }),
  );

  app.put(
    '/mines/:mineId/access',
    withUser(deps, async ({ req, reply, user }) => {
      const found = await visibleMine(db, req.params.mineId ?? '', user.id);
      if (!found) return sendError(reply, 404, 'not_found', 'Mine not found');
      if (!permissions.manageMines(found.role))
        return sendError(reply, 403, 'forbidden', 'Not allowed for this role');
      const body = parse(mineAccessSchema, req.body, reply);
      if (!body) return reply;
      const userIds = [...new Set(body.userIds)];
      const orgId = found.mine.organizationId;
      if (userIds.length) {
        const members = await db
          .selectFrom('member')
          .select('userId')
          .where('organizationId', '=', orgId)
          .where('userId', 'in', userIds)
          .execute();
        if (members.length !== userIds.length)
          return sendError(reply, 400, 'not_a_member', 'Every user must be a member');
      }
      await db.transaction().execute(async (tx) => {
        await tx.deleteFrom('mine_access').where('mineId', '=', found.mine.id).execute();
        if (userIds.length)
          await tx
            .insertInto('mine_access')
            .values(userIds.map((userId) => ({ mineId: found.mine.id, userId })))
            .execute();
        await recordAudit(tx, {
          organizationId: orgId,
          actorId: user.id,
          action: 'mine.access_change',
          targetType: 'mine',
          targetId: found.mine.id,
          data: { userIds },
        });
      });
      return reply.send(await toMine(db, found.mine));
    }),
  );

  app.get(
    '/organizations/:orgId/audit',
    withUser(deps, async ({ req, reply, user }) => {
      const orgId = req.params.orgId ?? '';
      if (!(await roleIn(orgId, user, reply, permissions.viewAudit))) return reply;
      const limit = Math.min(Math.max(Number(req.query.limit ?? 100) || 100, 1), 500);
      const rows = await db
        .selectFrom('audit_event')
        .leftJoin('user', 'user.id', 'audit_event.actorId')
        .select([
          'audit_event.id',
          'audit_event.at',
          'audit_event.actorId',
          'user.name as actorName',
          'audit_event.action',
          'audit_event.targetType',
          'audit_event.targetId',
          'audit_event.data',
        ])
        .where('audit_event.organizationId', '=', orgId)
        .orderBy('audit_event.at', 'desc')
        .orderBy('audit_event.id', 'desc')
        .limit(limit)
        .execute();
      const events: AuditEvent[] = rows.map((r) => ({ ...r, at: r.at.toISOString() }));
      return reply.send({ events });
    }),
  );
}
