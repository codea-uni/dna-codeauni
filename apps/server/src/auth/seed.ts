import { uuidv7 } from '@cronos/core';
import type { Db } from '../db/db';
import { recordAudit } from '../services/audit';
import { createUserWithPassword, type Auth } from './auth';

export interface InitialAdmin {
  email: string;
  password: string;
  name: string;
  /** Empresa inicial, de la que queda como administrador. */
  organization: string;
}

/**
 * Crea el primer administrador y su empresa si la base no tiene usuarios. Idempotente: con
 * usuarios, no hace nada. Devuelve el id creado o `null`.
 */
export async function seedInitialAdmin(
  db: Db,
  auth: Auth,
  admin: InitialAdmin | null,
): Promise<string | null> {
  if (!admin) return null;
  const existing = await db.selectFrom('user').select('id').limit(1).executeTakeFirst();
  if (existing) return null;
  const { id } = await createUserWithPassword(auth, { ...admin, mustChangePassword: true });
  await db.transaction().execute(async (tx) => {
    const organizationId = uuidv7();
    await tx
      .insertInto('organization')
      .values({ id: organizationId, name: admin.organization })
      .execute();
    await tx
      .insertInto('member')
      .values({ id: uuidv7(), organizationId, userId: id, role: 'admin' })
      .execute();
    await recordAudit(tx, {
      organizationId,
      actorId: id,
      action: 'organization.create',
      targetType: 'organization',
      targetId: organizationId,
      data: { name: admin.organization, seeded: true },
    });
  });
  return id;
}
