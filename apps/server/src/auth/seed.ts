import type { Db } from '../db/db';
import { createUserWithPassword, type Auth } from './auth';

export interface InitialAdmin {
  email: string;
  password: string;
  name: string;
}

/**
 * Superadministrador de la plataforma desde las variables de entorno (D-15): el dueño del
 * software, sin empresa. Si la cuenta ya existe y no es de ninguna empresa, se la promueve (no se
 * toca su contraseña); si pertenece a una empresa, no se la promueve (`belongsToOrganization`).
 * Si no existe, se crea con la contraseña temporal. Idempotente; `null` sin variables.
 */
export async function ensureSuperAdmin(
  db: Db,
  auth: Auth,
  admin: InitialAdmin | null,
): Promise<{ id: string; created: boolean; belongsToOrganization: boolean } | null> {
  if (!admin) return null;
  const email = admin.email.trim().toLowerCase();
  const existing = await db
    .selectFrom('user')
    .select('id')
    .where('email', '=', email)
    .executeTakeFirst();
  if (existing) {
    const member = await db
      .selectFrom('member')
      .select('id')
      .where('userId', '=', existing.id)
      .executeTakeFirst();
    if (member) return { id: existing.id, created: false, belongsToOrganization: true };
    await db
      .updateTable('user')
      .set({ isSuperAdmin: true })
      .where('id', '=', existing.id)
      .execute();
    return { id: existing.id, created: false, belongsToOrganization: false };
  }
  const { id } = await createUserWithPassword(auth, { ...admin, email, mustChangePassword: true });
  await db.updateTable('user').set({ isSuperAdmin: true }).where('id', '=', id).execute();
  return { id, created: true, belongsToOrganization: false };
}
