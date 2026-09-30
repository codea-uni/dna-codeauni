import type { Db } from '../db/db';
import { createUserWithPassword, type Auth } from './auth';

export interface InitialAdmin {
  email: string;
  password: string;
  name: string;
}

/**
 * Superadministrador de la plataforma desde las variables de entorno (D-15): el dueño del
 * software, sin empresa. El `.env` es la fuente de verdad de su cuenta:
 * - si no existe, se crea con esa contraseña, sin pedir cambiarla al entrar;
 * - si existe y no es de ninguna empresa, se promueve y su contraseña pasa a ser la del `.env`
 *   (`passwordSynced` si era otra), también sin pedir cambiarla;
 * - si pertenece a una empresa, no se toca (`belongsToOrganization`).
 * Idempotente; `null` sin variables.
 */
export async function ensureSuperAdmin(
  db: Db,
  auth: Auth,
  admin: InitialAdmin | null,
): Promise<{
  id: string;
  created: boolean;
  belongsToOrganization: boolean;
  passwordSynced: boolean;
} | null> {
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
    if (member)
      return {
        id: existing.id,
        created: false,
        belongsToOrganization: true,
        passwordSynced: false,
      };
    const ctx = await auth.$context;
    const accounts = await ctx.internalAdapter.findAccounts(existing.id);
    const hash = accounts.find((a) => a.providerId === 'credential')?.password;
    const same = hash ? await ctx.password.verify({ hash, password: admin.password }) : false;
    if (!same)
      await ctx.internalAdapter.updatePassword(
        existing.id,
        await ctx.password.hash(admin.password),
      );
    await db
      .updateTable('user')
      .set({ isSuperAdmin: true, mustChangePassword: false })
      .where('id', '=', existing.id)
      .execute();
    return { id: existing.id, created: false, belongsToOrganization: false, passwordSynced: !same };
  }
  const { id } = await createUserWithPassword(auth, { ...admin, email, mustChangePassword: false });
  await db.updateTable('user').set({ isSuperAdmin: true }).where('id', '=', id).execute();
  return { id, created: true, belongsToOrganization: false, passwordSynced: false };
}
