import type { Role } from '@cronos/api';
import type { Kysely, Selectable } from 'kysely';
import type { Database, MineTable } from '../db/schema';

export type MineRow = Selectable<MineTable>;

/** Rol del usuario en la empresa, o `null` si no es miembro. */
export async function memberRole(
  db: Kysely<Database>,
  organizationId: string,
  userId: string,
): Promise<Role | null> {
  const row = await db
    .selectFrom('member')
    .select('role')
    .where('organizationId', '=', organizationId)
    .where('userId', '=', userId)
    .executeTakeFirst();
  return row?.role ?? null;
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
