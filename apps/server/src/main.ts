import { buildApp } from './app';
import { loadConfig } from './config';
import { createDb, createPool, migrateToLatest } from './db/db';
import { SERVER_VERSION } from './version';

const config = loadConfig();
const pool = createPool(config.databaseUrl);
const db = createDb(pool);
await migrateToLatest(db);

const app = buildApp({ db, version: SERVER_VERSION, logger: { level: config.logLevel } });

const shutdown = async () => {
  await app.close();
  await db.destroy();
  process.exit(0);
};
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

await app.listen({ host: config.host, port: config.port });
