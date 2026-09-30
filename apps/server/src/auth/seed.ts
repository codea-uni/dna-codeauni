import type { Db } from '../db/db';
import { createUserWithPassword, type Auth } from './auth';

export interface InitialAdmin {
  email: string;
  password: string;
  name: string;
}

/**
 * Superadministrador de la plataforma desde las variables de entorno (D-14). Si la cuenta ya
 * existe, solo se asegura de que sea superadministrador (no toca su contraseña); si no, la crea
 * con la contraseña temporal. Idempotente. Devuelve el id de la cuenta o `null` sin variables.
 * No crea empresas: las crea el superadministrador desde la consola de la plataforma.
 */
export async function ensureSuperAdmin(
  db: Db,
  auth: Auth,
  admin: InitialAdmin | null,
): Promise<{ id: string; created: boolean } | null> {
  if (!admin) return null;
  const email = admin.email.trim().toLowerCase();
  const existing = await db
    .selectFrom('user')
    .select('id')
    .where('email', '=', email)
    .executeTakeFirst();
  if (existing) {
    await db
      .updateTable('user')
      .set({ isSuperAdmin: true })
      .where('id', '=', existing.id)
      .execute();
    return { id: existing.id, created: false };
  }
  const { id } = await createUserWithPassword(auth, { ...admin, email, mustChangePassword: true });
  await db.updateTable('user').set({ isSuperAdmin: true }).where('id', '=', id).execute();
  return { id, created: true };
}
