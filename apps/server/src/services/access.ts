import type { Role } from '@cronos/api';
import type { Kysely, Selectable } from 'kysely';
import { HttpError } from '../http/errors';
import type { Database, MineTable } from '../db/schema';

export type MineRow = Selectable<MineTable>;

/**
 * Rol del usuario en la empresa, o `null` si no es miembro. Si la empresa está desactivada, lanza
 * 403 `organization_disabled`: sus miembros no acceden a nada hasta que se reactive.
 */
export async function memberRole(
  db: Kysely<Database>,
  organizationId: string,
  userId: string,
): Promise<Role | null> {
  const row = await db
    .selectFrom('member')
    .innerJoin('organization', 'organization.id', 'member.organizationId')
    .select(['member.role', 'organization.disabledAt'])
    .where('member.organizationId', '=', organizationId)
    .where('member.userId', '=', userId)
    .executeTakeFirst();
  if (!row) return null;
  if (row.disabledAt)
    throw new HttpError(403, 'organization_disabled', 'The organization is disabled');
  return row.role;
}

/** La empresa del usuario (cada persona pertenece a una sola) con su rol, o `null`. */
export async function userOrganization(db: Kysely<Database>, userId: string) {
  const row = await db
    .selectFrom('member')
    .innerJoin('organization', 'organization.id', 'member.organizationId')
    .select([
      'organization.id',
      'organization.name',
      'organization.createdAt',
      'organization.disabledAt',
      'member.role',
    ])
    .where('member.userId', '=', userId)
    .executeTakeFirst();
  return row ?? null;
}

/**
 * La mina y el rol del usuario si puede verla: es miembro de la empresa y, si la mina tiene lista
 * de acceso, está en ella (los administradores siempre la ven). Si no, `null`.
 */
export async function visibleMine(
  db: Kysely<Database>,
  mineId: string,
  userId: string,
): Promise<{ mine: MineRow; role: Role } | null> {
  const mine = await db.selectFrom('mine').selectAll().where('id', '=', mineId).executeTakeFirst();
  if (!mine) return null;
  const role = await memberRole(db, mine.organizationId, userId);
  if (!role) return null;
  if (role === 'admin') return { mine, role };
  const access = await db
    .selectFrom('mine_access')
    .select('userId')
    .where('mineId', '=', mineId)
    .execute();
  if (access.length > 0 && !access.some((a) => a.userId === userId)) return null;
  return { mine, role };
}
