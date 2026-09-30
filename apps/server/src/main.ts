import { buildApp } from './app';
import { createAuth } from './auth/auth';
import { seedInitialAdmin } from './auth/seed';
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
  rateLimit: true,
});
const app = buildApp({
  db,
  auth,
  baseUrl: config.baseUrl,
  version: SERVER_VERSION,
  logger: { level: config.logLevel },
});
if (await seedInitialAdmin(db, auth, config.initialAdmin))
  app.log.info('Primer administrador creado desde CRONOS_ADMIN_EMAIL');

const shutdown = async () => {
  await app.close();
  await db.destroy();
  process.exit(0);
};
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

await app.listen({ host: config.host, port: config.port });
