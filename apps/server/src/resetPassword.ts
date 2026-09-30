import { createAuth, MIN_PASSWORD_LENGTH } from './auth/auth';
import { loadConfig } from './config';
import { createDb, createPool } from './db/db';

/**
 * Restablece la contraseña de una cuenta (p. ej. el administrador la olvidó). Queda como
 * temporal (hay que cambiarla al entrar) salvo con `--permanente`. Cierra las sesiones abiertas.
 *   pnpm --filter @cronos/server reset-password <correo> <contraseña> [--permanente]
 * En producción: docker compose exec api node dist/resetPassword.js <correo> <contraseña>
 */
const args = process.argv.slice(2);
const permanent = args.includes('--permanente');
const [email, password] = args.filter((a) => a !== '--permanente');
if (!email || !password || password.length < MIN_PASSWORD_LENGTH) {
  console.error(`Uso: reset-password <correo> <contraseña de ${MIN_PASSWORD_LENGTH}+ caracteres>`);
  process.exit(1);
}

const config = loadConfig();
const pool = createPool(config.databaseUrl);
const db = createDb(pool);
const auth = createAuth({
  pool,
  secret: config.authSecret,
  baseUrl: config.baseUrl,
  rateLimit: false,
});
try {
  const ctx = await auth.$context;
  const found = await ctx.internalAdapter.findUserByEmail(email.trim().toLowerCase());
  if (!found) {
    console.error(`No existe una cuenta con el correo ${email}`);
    process.exitCode = 1;
  } else {
    await ctx.internalAdapter.updatePassword(found.user.id, await ctx.password.hash(password));
    await ctx.internalAdapter.deleteUserSessions(found.user.id);
    await db
      .updateTable('user')
      .set({ mustChangePassword: !permanent })
      .where('id', '=', found.user.id)
      .execute();
    console.log(
      `Contraseña de ${found.user.email} restablecida${permanent ? '' : ' (temporal: se cambia al entrar)'}.`,
    );
  }
} finally {
  await db.destroy();
}
