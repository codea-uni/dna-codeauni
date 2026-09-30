import { buildApp } from './app';
import { createAuth } from './auth/auth';
import { ensureSuperAdmin } from './auth/seed';
import { loadConfig } from './config';
import { createDb, createPool, migrateToLatest } from './db/db';
import { SERVER_VERSION } from './version';

const config = loadConfig();
const pool = createPool(config.databaseUrl);
const db = createDb(pool);
await migrateToLatest(db);

const auth = createAuth({
  pool,
  secret: config.authSecret,
  baseUrl: config.baseUrl,
  // Límite de intentos solo en producción (la imagen Docker fija NODE_ENV=production): en
  // desarrollo todas las peticiones llegan desde la misma IP y se bloquearía al programador.
  rateLimit: process.env.NODE_ENV === 'production',
});
const app = buildApp({
  db,
  auth,
  baseUrl: config.baseUrl,
  version: SERVER_VERSION,
  logger: { level: config.logLevel },
});
const superAdmin = await ensureSuperAdmin(db, auth, config.initialAdmin);
if (superAdmin?.created) app.log.info('Superadministrador creado desde CRONOS_SUPERADMIN_EMAIL');
if (superAdmin?.belongsToOrganization)
  app.log.error(
    'CRONOS_SUPERADMIN_EMAIL pertenece a una empresa: el superadministrador no puede ser miembro. Usar otra cuenta.',
  );

const shutdown = async () => {
  await app.close();
  await db.destroy();
  process.exit(0);
};
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

await app.listen({ host: config.host, port: config.port });
