import type { Db } from '../db/db';
import { createUserWithPassword, type Auth } from './auth';

/**
 * Crea el primer administrador si la base no tiene usuarios. Idempotente: con usuarios, no hace
 * nada. Devuelve el id creado o `null`.
 */
export async function seedInitialAdmin(
  db: Db,
  auth: Auth,
  admin: { email: string; password: string; name: string } | null,
): Promise<string | null> {
  if (!admin) return null;
  const existing = await db.selectFrom('user').select('id').limit(1).executeTakeFirst();
  if (existing) return null;
  const { id } = await createUserWithPassword(auth, { ...admin, mustChangePassword: true });
  return id;
}
